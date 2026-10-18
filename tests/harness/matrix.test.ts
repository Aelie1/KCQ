import { describe, expect, it, vi } from "vitest";
import type { KCQCharacter } from "../../src/content";
import type { DifficultyId } from "../../src/engine/public/types";
import { deriveRunSeeds, runBatch, type BatchInput } from "../../src/harness/batch/batch";
import { executePolicyComparison } from "../../src/harness/batch/comparison";
import { executeMatrix, resolveMatrixInput, type MatrixEntry, type MatrixInput } from "../../src/harness/batch/matrix";
import { formatDifficultyProgression, formatPartyParity, summarizeDifficultyProgression, summarizePartyParity } from "../../src/harness/batch/matrix-reports";
import { BatchWorkerPool } from "../../src/harness/batch/parallel-batch";
import { summarizeBatch } from "../../src/harness/batch/summary";
import { enumerateHarnessParties, resolveFightConfiguration } from "../../src/harness/configuration";
import { basicPolicy } from "../../src/harness/policy/basic";
import { idlePolicy } from "../../src/harness/policy/idle";
import { stockCharacters } from "../../src/stock";

const input: MatrixInput = { encounterIds: ["plains_1"], policies: [basicPolicy], masterSeed: 321, runs: 2, maxActions: 4 };
const parties = enumerateHarnessParties();

describe("matrix selections and validation", () => {
    it("enumerates ten unique valid combinations in stable content order", () => {
        expect(parties).toHaveLength(10);
        expect(new Set(parties.map(party => [...party].sort().join("/"))).size).toBe(10);
        expect(parties).toEqual(enumerateHarnessParties());
        expect(parties[0]).toEqual(stockCharacters);
        expect(parties[9]).toEqual(["hinari", "naruyo", "sakari"]);
        parties.forEach(party => expect(resolveFightConfiguration({ party }).party).toEqual(party));
        const changed = enumerateHarnessParties();
        changed[0].reverse();
        expect(enumerateHarnessParties()).toEqual(parties);
    });

    it.each([
        [{}, 1],
        [{ parties: [parties[4]], difficulties: ["mythic"] }, 1],
        [{ parties: "all" }, 10],
        [{ difficulties: "all" }, 5],
        [{ parties: "all", difficulties: "all" }, 50],
        [{ parties: [parties[2], parties[8]], difficulties: ["mythic", "casual"], policies: [basicPolicy, idlePolicy], encounterIds: ["forest_1", "plains_1"] }, 16],
    ] satisfies [Partial<MatrixInput>, number][])("executes only the selected cross product %j", async (selection, count) => {
        const execute = vi.fn((batchInput: BatchInput) => runBatch(batchInput));
        const result = await executeMatrix({ ...input, ...selection, runs: 0 }, { runBatch: execute });
        expect(execute).toHaveBeenCalledTimes(count);
        expect(result.entries).toHaveLength(count);
        if (!("difficulties" in selection)) expect(result.configuration.difficulties).toEqual(["standard"]);
        if (!("parties" in selection)) expect(result.configuration.parties).toEqual([stockCharacters]);
    });

    it("orders selected difficulties canonically and preserves explicit party order", () => {
        const party = ["sakari", "ko", "naruyo"] as const;
        const result = resolveMatrixInput({ ...input, parties: [party, party], difficulties: ["mythic", "casual", "mythic"], policies: [basicPolicy, basicPolicy] });
        expect(result.parties).toEqual([party]);
        expect(result.difficulties).toEqual(["casual", "mythic"]);
        expect(result.policies).toEqual([basicPolicy]);
    });

    it.each([
        { encounterIds: [] }, { encounterIds: ["plains_1", "missing"] },
        { parties: [] }, { parties: [parties[0], ["ko", "ko", "hinari"]] },
        { parties: [["ko", "hinari", "missing" as KCQCharacter]] },
        { difficulties: [] }, { difficulties: ["standard", "missing" as DifficultyId] },
        { policies: [] }, { policies: [basicPolicy, { ...idlePolicy, id: "custom" }], workers: 2 },
        { masterSeed: NaN }, { runs: -1 }, { runs: 0.1 }, { maxActions: -1 }, { maxActions: Infinity }, { workers: 0 },
    ] satisfies Partial<MatrixInput>[])("rejects invalid input before executing any batch %j", async selection => {
        const execute = vi.fn(runBatch);
        await expect(executeMatrix({ ...input, ...selection }, { runBatch: execute })).rejects.toThrow();
        expect(execute).not.toHaveBeenCalled();
    });
});

describe("matrix determinism and lifetime", () => {
    it("matches independent batches and comparisons with the same run-index seed corpus", async () => {
        const selection: MatrixInput = { ...input, encounterIds: ["forest_1", "plains_1"], parties: [parties[7], parties[0]],
            difficulties: ["mythic", "casual"], policies: [basicPolicy, idlePolicy] };
        const completed: MatrixEntry[] = [];
        const onProgress = vi.fn();
        const result = await executeMatrix(selection, {
            onProgress,
            async onConfigurationComplete(entry, comparison, batchInput) {
                const independent = runBatch(batchInput);
                expect(comparison.batch).toEqual(independent);
                expect(comparison.summary).toEqual(summarizeBatch(independent));
                expect(comparison.batch.runs.map(({ engineSeed, policySeed }) => ({ engineSeed, policySeed })))
                    .toEqual([0, 1].map(index => deriveRunSeeds(input.masterSeed, index)));
                comparison.batch.runs.forEach(run => expect(run.result.replay).toBeUndefined());
                const policyComparison = await executePolicyComparison({ ...batchInput, policies: [batchInput.policy] });
                expect(policyComparison.policies[0].summary).toEqual(comparison.summary);
                completed.push(entry);
            },
        });
        expect(result.entries).toEqual(completed);
        expect(result.entries.every(entry => !("batch" in entry) && !("runs" in entry))).toBe(true);
        const updates = onProgress.mock.calls.map(([update]) => update);
        expect(updates.map(update => update.overallCompleted)).toEqual(Array.from({ length: 32 }, (_, index) => index + 1));
        expect(updates.at(-1)).toMatchObject({ overallCompleted: 32, overallTotal: 32, configurationIndex: 15, configurationCount: 16 });
        const reversed = await executeMatrix({ ...selection, encounterIds: [...selection.encounterIds].reverse(), parties: [parties[0], parties[7]], policies: [...selection.policies].reverse() });
        const gameplay = (entries: MatrixEntry[]) => entries.map(({ timing, ...entry }) => entry).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        expect(gameplay(reversed.entries)).toEqual(gameplay(result.entries));
    });

    it("uses one persistent caller pool across configurations, matches serial, and leaves it open", async () => {
        const pool = new BatchWorkerPool(2);
        const run = vi.spyOn(pool, "run");
        const close = vi.spyOn(pool, "close");
        const selection = { ...input, parties: [parties[1], parties[9]], difficulties: ["standard", "mythic"] as const };
        try {
            const parallel = await executeMatrix({ ...selection, workers: 2 }, { pool,
                onConfigurationComplete(_entry, comparison, batchInput) { expect(comparison.batch).toEqual(runBatch(batchInput)); },
            });
            const serial = await executeMatrix(selection);
            expect(parallel.entries.map(({ timing, ...entry }) => entry)).toEqual(serial.entries.map(({ timing, ...entry }) => entry));
            expect(run).toHaveBeenCalledTimes(4);
            expect(close).not.toHaveBeenCalled();
        } finally { await pool.close(); }
    }, 20_000);

    it("closes an owned pool on callback failure", async () => {
        const close = vi.spyOn(BatchWorkerPool.prototype, "close");
        try {
            await expect(executeMatrix({ ...input, workers: 2 }, {
                onConfigurationComplete() { throw new Error("write failed"); },
            })).rejects.toThrow("write failed");
            expect(close).toHaveBeenCalledOnce();
        } finally { close.mockRestore(); }
    }, 20_000);
});

function fixture(winRate: number, party = parties[0], difficulty: DifficultyId = "standard", policyId = "basic", encounterId = "plains_1"): MatrixEntry {
    return { party, difficulty, policyId, encounterId, meanRounds: 5, timing: { runtimeMs: 0, meanPerRunMs: 0 },
        metrics: { runs: 100, winRate, meanDecisions: 20, meanDamage: 30, meanPeakBondage: 40, meanEscapes: 1, win95: { lower: 0.2, upper: 0.9 } } };
}

describe("matrix reports", () => {
    it("calculates party spreads and default reference differences separately for every group", () => {
        const entries = [fixture(0.9), fixture(0.3, parties[9]), fixture(0.5, parties[1]), fixture(0.1, parties[1], "mythic"), fixture(1, parties[1], "standard", "idle"), fixture(0.4, parties[1], "standard", "basic", "forest_1")];
        const reports = summarizePartyParity(entries);
        expect(reports).toHaveLength(4);
        expect(reports[0].highestWinRate).toBe(0.9);
        expect(reports[0].lowestWinRate).toBe(0.3);
        expect(reports[0].spreadPp).toBeCloseTo(60);
        expect(reports[0].rows[0].differencePp).toBeNull();
        expect(reports[0].rows[1].differencePp).toBeCloseTo(-60);
        expect(reports[1].referenceParty).toBeNull();
        expect(reports[1].rows[0].differencePp).toBeNull();
        const text = formatPartyParity(entries).join("\n");
        expect(text).toContain("Spread: 60.0 pp");
        expect(text).toContain("-60.0 pp");
        expect(text).toContain("reference party absent");
        expect(text).toContain("meanPeakBondage");
        expect(text).toContain("win95");
    });

    it("orders difficulties and labels changes across omitted levels, including increases", () => {
        const entries = [fixture(0.45, parties[0], "mythic"), fixture(1, parties[0], "casual"), fixture(0.55, parties[0], "extreme"), fixture(0.5, parties[0], "standard"), fixture(0.8, parties[1], "casual")];
        const reports = summarizeDifficultyProgression(entries);
        expect(reports).toHaveLength(2);
        expect(reports[0].rows.map(row => row.entry.difficulty)).toEqual(["casual", "standard", "extreme", "mythic"]);
        expect(reports[0].rows[0].changePp).toBeNull();
        expect(reports[0].rows[1].changePp).toBe(-50);
        expect(reports[0].rows[2].previousDifficulty).toBe("standard");
        expect(reports[0].rows[2].changePp).toBeCloseTo(5);
        expect(reports[0].rows[3].changePp).toBeCloseTo(-10);
        expect(formatDifficultyProgression(entries).join("\n")).toContain("+5.0 pp vs standard");
    });

    it("does not report observed rates or differences for empty batches", async () => {
        const result = await executeMatrix({ ...input, runs: 0, difficulties: "all" });
        expect(summarizePartyParity(result.entries)[0].spreadPp).toBeNull();
        expect(summarizeDifficultyProgression(result.entries)[0].rows.every(row => row.changePp === null)).toBe(true);
        expect(formatDifficultyProgression(result.entries).join("\n")).toContain("n/a");
    });
});

