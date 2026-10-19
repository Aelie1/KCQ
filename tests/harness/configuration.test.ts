import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createEngine, type KCQCharacter } from "../../src/content";
import type { DifficultyId } from "../../src/engine/public/types";
import { runBatch, type BatchInput } from "../../src/harness/batch/batch";
import { executeEncounterSet } from "../../src/harness/batch/encounter-sets";
import { BatchWorkerPool, runBatchParallel } from "../../src/harness/batch/parallel-batch";
import { captureReplaySamples } from "../../src/harness/batch/replay-samples";
import { summarizeBatch } from "../../src/harness/batch/summary";
import { formatBatchSummary } from "../../src/harness/batch/summary-format";
import { parseBatchArguments, parseBatchCommandArguments } from "../../src/harness/cli/batch-cli";
import { parseCompareCommandArguments } from "../../src/harness/cli/compare-cli";
import { extractConfigurationArguments } from "../../src/harness/cli/configuration-cli";
import { harnessDifficulties, type FightConfigurationInput } from "../../src/harness/configuration";
import { runSingleFight, type FightPolicy } from "../../src/harness/harness";
import { batchSummaryFilename, createBatchRunOutput, fightResultFilename, writeBatchSummary, writeReplaySamples } from "../../src/harness/output";
import { basicPolicy } from "../../src/harness/policy/basic";
import { escapePolicy } from "../../src/harness/policy/escape";
import { idlePolicy } from "../../src/harness/policy/idle";
import { smartPolicy } from "../../src/harness/policy/smart";
import { stockCampaign, stockCharacters } from "../../src/stock";

const parties: readonly (readonly KCQCharacter[])[] = [
    ["ko", "matsuko", "hinari"], ["ko", "matsuko", "naruyo"], ["ko", "matsuko", "sakari"],
    ["ko", "hinari", "naruyo"], ["ko", "hinari", "sakari"], ["ko", "naruyo", "sakari"],
    ["matsuko", "hinari", "naruyo"], ["matsuko", "hinari", "sakari"],
    ["matsuko", "naruyo", "sakari"], ["hinari", "naruyo", "sakari"],
];
const selected = { party: ["sakari", "naruyo", "ko"], difficulty: "mythic" } as const;
const fightInput = {
    encounterId: "plains_1", engineSeed: 12345, policySeed: 0, maxActions: 2, policy: idlePolicy,
};
const batchInput: BatchInput = {
    encounterId: "forest_1", masterSeed: 456, runs: 2, maxActions: 6, policy: basicPolicy,
};

describe("harness party and difficulty configuration", () => {
    it.each(parties.map(party => ({ party })))("runs only the selected characters: $party", ({ party }) => {
        const policy: FightPolicy = {
            id: "catalog-observer",
            chooseAction(context) {
                expect(Object.keys(context.library.characters)).toEqual(party);
                return { type: "endTurn" };
            },
        };
        const result = runSingleFight({ ...fightInput, party, policy, replay: true });
        expect(result.termination).toBe("maxActions");
        expect(result.actionCount).toBe(2);
        expect(result.party).toEqual(party);
        expect(result.finalState.characters.map(character => character.id)).toEqual(party);
        expect(result.replay!.initialState.characters.map(character => character.id)).toEqual(party);
    });

    it.each(harnessDifficulties)("runs at %s identically to the public engine API", difficulty => {
        const engine = createEngine(selected.party, stockCampaign, fightInput.engineSeed);
        engine.setDifficulty(difficulty);
        selected.party.forEach(id => engine.loadCharacter(id));
        engine.loadEncounter("forest_1");
        const result = runSingleFight({ ...fightInput, ...selected, encounterId: "forest_1", difficulty, replay: true });
        expect(result.termination).toBe("maxActions");
        expect(result.difficulty).toBe(difficulty);
        expect(result.replay!.initialState).toEqual(engine.getGameState());
        expect(result.replay!.initialActions).toEqual(engine.getActionView());
        result.trace.forEach(action => expect(engine.executeAction(action).success).toBe(true));
        expect(result.finalState).toEqual(engine.getGameState());
    });

    it("retains difficulty-specific fairy attacks", () => {
        const run = (difficulty: DifficultyId) => runSingleFight({
            ...fightInput, ...selected, difficulty, encounterId: "forest_1", maxActions: 1, replay: true,
        });
        const standard = run("standard");
        const mythic = run("mythic");
        const bindingMagic = (result: typeof standard) => result.replay!.steps.flatMap(step =>
            step.success ? step.frames.map(frame => frame.event) : []
        ).filter(event => event.type === "useMove" && event.move === "bindingMagic");
        expect(bindingMagic(standard)).toHaveLength(0);
        expect(bindingMagic(mythic)).toHaveLength(1);
    });

    const invalid: Array<[FightConfigurationInput, RegExp]> = [
        [{ party: [] }, /exactly three/],
        [{ party: ["ko", "hinari"] }, /exactly three/],
        [{ party: ["ko", "hinari", "matsuko", "sakari"] }, /exactly three/],
        [{ party: ["ko", "ko", "hinari"] }, /duplicate/],
        [{ party: ["ko", "hinari", "unknown" as KCQCharacter] }, /Unknown party character ID: unknown/],
        [{ party: ["ko", "hinari", "toString" as KCQCharacter] }, /Unknown party character ID: toString/],
        [{ difficulty: "impossible" as DifficultyId }, /Unknown difficulty ID: impossible/],
    ];
    it.each(invalid)("rejects invalid configuration %j before single or batch execution", async (configuration, message) => {
        expect(() => runSingleFight({ ...fightInput, ...configuration })).toThrow(message);
        expect(() => runBatch({ ...batchInput, runs: 0, ...configuration })).toThrow(message);
        await expect(runBatchParallel({ ...batchInput, ...configuration }, { workers: 2 })).rejects.toThrow(message);
        await expect(executeEncounterSet({
            encounterIds: [], policies: [], masterSeed: 1, runsPerEncounter: 0, maxActions: 0, ...configuration,
        })).rejects.toThrow(message);
    });

    it("produces identical default and explicit configuration results with current gameplay", () => {
        const input = { ...fightInput, policy: basicPolicy, maxActions: 1000, replay: true };
        const result = runSingleFight(input);
        expect(result.party).toEqual(stockCharacters);
        expect(result.difficulty).toBe("standard");
        expect(result).toEqual(runSingleFight({ ...input, party: stockCharacters, difficulty: "standard" }));
        // Full result baseline updated for Ko's binding-removal preview on Fairy Transformation.
        // Comparing the original configuration-support revision isolates the changes to that preview.
        const { party, difficulty, ...legacyResult } = result;
        expect(createHash("sha256").update(JSON.stringify(legacyResult)).digest("hex"))
            .toBe("d26939c99b7f2be0cf0e56b7e1dcc4071b90a3954f04f9fb5c68e9787e7ea422");
        expect(runBatch(batchInput)).toEqual(runBatch({ ...batchInput, party: stockCharacters, difficulty: "standard" }));
    });

    it("preserves party order and detaches result metadata from caller arrays", () => {
        const party = [...selected.party];
        const result = runBatch({ ...batchInput, party, runs: 0 });
        party.reverse();
        expect(result.party).toEqual(selected.party);
    });

    it("keeps persistent workers equivalent to serial fights across configurations and policies", async () => {
        const pool = new BatchWorkerPool(2);
        try {
            for (const [index, policy] of [basicPolicy, escapePolicy, smartPolicy, idlePolicy].entries()) {
                const input = { ...batchInput, party: parties[index + 6], difficulty: harnessDifficulties[index + 1], policy, replay: true };
                const serial = runBatch(input);
                expect(await runBatchParallel(input, { workers: 2, pool })).toEqual(serial);
                expect(serial.runs.map(({ result }) => result.termination)).not.toContain("error");
                const summary = summarizeBatch(serial);
                expect(summary.party).toEqual(input.party);
                expect(summary.difficulty).toBe(input.difficulty);
                expect(formatBatchSummary(summary).join("\n"))
                    .toContain(`Party: ${input.party.join(", ")} / Difficulty: ${input.difficulty}`);
            }
        } finally {
            await pool.close();
        }
    }, 20_000);

    it("propagates one configuration through encounter and policy comparisons with unchanged seed identities", async () => {
        const input = {
            encounterIds: ["plains_1", "forest_1"], policies: [basicPolicy, escapePolicy],
            masterSeed: 456, runsPerEncounter: 2, maxActions: 2, workers: 2, ...selected,
        };
        const result = await executeEncounterSet(input);
        expect(result).toMatchObject(selected);
        for (const { encounterId, comparison } of result.encounters) {
            expect(comparison).toMatchObject(selected);
            for (const [index, entry] of comparison.policies.entries()) {
                const reference = runBatch({ ...batchInput, encounterId, maxActions: 2, ...selected, policy: input.policies[index] });
                expect(entry.batch).toEqual(reference);
                expect(entry.summary).toEqual(summarizeBatch(reference));
            }
            expect(comparison.policies[0].batch.runs.map(({ engineSeed, policySeed }) => [engineSeed, policySeed]))
                .toEqual(comparison.policies[1].batch.runs.map(({ engineSeed, policySeed }) => [engineSeed, policySeed]));
        }
    }, 20_000);

    it("saves configured metadata and replay reruns with the original battle state and seeds", () => {
        const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kcq-config-test-"));
        try {
            const input = { ...batchInput, ...selected, encounterId: "plains_1", policy: idlePolicy, maxActions: 100 };
            const batch = runBatch(input);
            const output = createBatchRunOutput({
                ...selected, masterSeed: input.masterSeed, runsPerEncounter: input.runs,
                maxActions: input.maxActions, parallelWorkers: 1, encounters: [input.encounterId], policies: [input.policy.id],
            }, { outputRoot });
            const summaryPath = writeBatchSummary(input, summarizeBatch(batch), output.directoryPath);
            expect(JSON.parse(fs.readFileSync(summaryPath, "utf8"))).toMatchObject(selected);
            expect(JSON.parse(fs.readFileSync(path.join(output.directoryPath, "run.json"), "utf8"))).toMatchObject(selected);
            expect(path.basename(summaryPath)).toBe("plains_1-idle-sakari-naruyo-ko-mythic.json");
            // Capture uses the completed batch's effective configuration even if omitted by the caller.
            const samples = captureReplaySamples({ ...input, party: undefined, difficulty: undefined }, batch);
            expect(samples.length).toBeGreaterThan(0);
            for (const sample of samples) {
                const original = batch.runs[sample.runIndex];
                const { replay, ...withoutReplay } = sample.result;
                expect(withoutReplay).toEqual(original.result);
                expect(sample.input).toMatchObject(selected);
                const engine = createEngine(selected.party, stockCampaign, original.engineSeed);
                engine.setDifficulty(selected.difficulty);
                selected.party.forEach(id => engine.loadCharacter(id));
                engine.loadEncounter(input.encounterId);
                expect(replay!.initialState).toEqual(engine.getGameState());
                expect(replay!.initialActions).toEqual(engine.getActionView());
            }
            const saved = writeReplaySamples(samples, output.directoryPath);
            expect(saved).toHaveLength(samples.length);
            saved.forEach(sample => {
                expect(path.basename(sample.outputPath)).toContain("sakari-naruyo-ko-mythic");
                const result = JSON.parse(fs.readFileSync(sample.outputPath, "utf8"));
                expect(result).toMatchObject(selected);
                expect(result.replay.initialState.difficulty.id).toBe("mythic");
                expect(result.replay.initialState.characters.map((character: { id: string }) => character.id)).toEqual(selected.party);
            });
        } finally {
            fs.rmSync(outputRoot, { recursive: true, force: true });
        }
    });

    it("keeps default filenames and distinguishes non-default party order and difficulty", () => {
        const defaults = { party: stockCharacters, difficulty: "standard" } as const;
        expect(batchSummaryFilename(batchInput)).toBe("forest_1-basic.json");
        expect(batchSummaryFilename({ ...batchInput, ...defaults })).toBe(batchSummaryFilename(batchInput));
        expect(fightResultFilename({ ...fightInput, ...defaults })).toBe(fightResultFilename(fightInput));
        const input = { ...fightInput, ...selected };
        expect(fightResultFilename(input)).not.toBe(fightResultFilename(fightInput));
        expect(fightResultFilename(input)).not.toBe(fightResultFilename({ ...input, party: [...selected.party].reverse() }));
        expect(fightResultFilename(input)).not.toBe(fightResultFilename({ ...input, difficulty: "extreme" }));
    });
});

describe("single-configuration CLI flags", () => {
    it("accepts inline or separated flags while retaining positional arguments and replay filters", () => {
        const options = ["--party", "sakari,naruyo,ko", "--difficulty=mythic"];
        expect(extractConfigurationArguments(options)).toEqual({ args: [], configuration: selected });
        expect(parseBatchArguments(["forest_1", "456", "basic", "2", ...options])).toMatchObject(selected);
        expect(parseBatchCommandArguments(["--difficulty", "mythic", "forest_1", "456", "basic", "2", "6", "2", "--party=sakari,naruyo,ko"]))
            .toMatchObject({ input: { ...selected, maxActions: 6, masterSeed: 456 }, workers: 2 });
        expect(parseCompareCommandArguments(["forest_1", "456", "all", "2", ...options, "--replay-levels=none"]))
            .toMatchObject({ ...selected, replayEncounterIds: [] });
    });

    it.each([
        [["--party", "ko,ko,hinari"], /duplicate/],
        [["--party=ko,hinari"], /exactly three/],
        [["--party=ko,hinari,unknown"], /Unknown party character/],
        [["--party=ko,,hinari"], /Unknown party character/],
        [["--difficulty=standard,mythic"], /Unknown difficulty/],
        [["--difficulty", "unknown"], /Unknown difficulty/],
        [["--difficulty"], /requires a value/],
        [["--party="], /requires a value/],
        [["--party", "--difficulty=mythic"], /requires a value/],
        [["--difficulty=standard", "--difficulty=mythic"], /only once/],
        [["--party=ko,hinari,matsuko", "--party=ko,naruyo,sakari"], /only once/],
    ] as const)("rejects invalid flags %j", (options, message) => {
        expect(() => parseBatchCommandArguments(["plains_1", "1", "basic", "2", ...options])).toThrow(message);
        expect(() => parseCompareCommandArguments(["plains_1", "1", "all", "2", ...options])).toThrow(message);
    });
});
