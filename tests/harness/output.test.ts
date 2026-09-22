import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BatchInput, BatchResult } from "../../src/harness/batch/batch";
import { summarizeBatch } from "../../src/harness/batch/summary";
import {
    batchSummaryFilename,
    createBatchRunOutput,
    formatBatchRunDirectoryName,
    writeBatchSummary,
} from "../../src/harness/output";
import { firstPolicy } from "../../src/harness/policy/first";

describe("batch run output", () => {
    let outputRoot: string;

    beforeEach(() => {
        outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kcq-output-test-"));
    });

    afterEach(() => {
        fs.rmSync(outputRoot, { recursive: true, force: true });
    });

    it("formats local 24-hour timestamps and singular/plural counts", () => {
        expect(formatBatchRunDirectoryName(new Date(2026, 8, 21, 0, 5, 6), 1, 1))
            .toBe("2026-09-21_00-05-06_1_level_1_policy");
        expect(formatBatchRunDirectoryName(new Date(2026, 8, 21, 12, 15, 4), 1, 4))
            .toBe("2026-09-21_12-15-04_1_level_4_policies");
        expect(formatBatchRunDirectoryName(new Date(2026, 8, 21, 21, 3, 32), 3, 10))
            .toBe("2026-09-21_21-03-32_3_levels_10_policies");
    });

    it("uses deterministic suffixes for directory and file collisions without overwriting", () => {
        const now = new Date(2026, 8, 21, 21, 3, 32);
        const input = runInput();
        const first = createBatchRunOutput(input, { outputRoot, now: () => now });
        const second = createBatchRunOutput(input, { outputRoot, now: () => now });
        const blockedThirdPath = `${first.directoryPath}_3`;
        fs.writeFileSync(blockedThirdPath, "keep me", "utf8");

        const next = createBatchRunOutput(input, { outputRoot, now: () => now });

        expect(path.basename(first.directoryPath)).toBe("2026-09-21_21-03-32_3_levels_2_policies");
        expect(path.basename(second.directoryPath)).toBe("2026-09-21_21-03-32_3_levels_2_policies_2");
        expect(path.basename(next.directoryPath)).toBe("2026-09-21_21-03-32_3_levels_2_policies_4");
        expect(fs.readFileSync(blockedThirdPath, "utf8")).toBe("keep me");
        expect(fs.statSync(first.directoryPath).isDirectory()).toBe(true);
        expect(fs.statSync(second.directoryPath).isDirectory()).toBe(true);
        expect(fs.statSync(next.directoryPath).isDirectory()).toBe(true);
    });

    it("writes one manifest and simplified, safely sanitized summaries in the run directory", () => {
        const startedAt = new Date(2026, 8, 21, 16, 17, 42);
        const output = createBatchRunOutput({
            masterSeed: 4,
            runsPerEncounter: 1_000,
            maxActions: 1_000,
            parallelWorkers: 8,
            encounters: ["plains_1"],
            policies: ["first"],
        }, { outputRoot, now: () => startedAt });
        const input: BatchInput = {
            encounterId: "plains_1",
            policy: firstPolicy,
            masterSeed: 4,
            runs: 1_000,
            maxActions: 1_000,
            replay: false,
        };
        const batch: BatchResult = {
            encounterId: input.encounterId,
            policyId: input.policy.id,
            masterSeed: input.masterSeed,
            runs: [],
        };
        const summary = summarizeBatch(batch);

        const summaryPath = writeBatchSummary(input, summary, output.directoryPath);

        expect(path.basename(output.directoryPath))
            .toBe("2026-09-21_16-17-42_1_level_1_policy");
        expect(path.basename(summaryPath)).toBe("plains_1-first.json");
        expect(fs.readFileSync(summaryPath, "utf8")).toBe(JSON.stringify(summary, null, 2));
        expect(JSON.parse(fs.readFileSync(path.join(output.directoryPath, "run.json"), "utf8")))
            .toEqual({
                startedAt: expect.stringMatching(/^2026-09-21T16:17:42[+-]\d{2}:\d{2}$/),
                masterSeed: 4,
                runsPerEncounter: 1_000,
                maxActions: 1_000,
                parallelWorkers: 8,
                encounters: ["plains_1"],
                policies: ["first"],
            });
        expect(fs.readdirSync(output.directoryPath).sort()).toEqual(["plains_1-first.json", "run.json"]);
        expect(batchSummaryFilename({ encounterId: "../odd/encounter", policy: firstPolicy }))
            .toBe(".._odd_encounter-first.json");
    });
});

function runInput() {
    return {
        masterSeed: 4,
        runsPerEncounter: 1_000,
        maxActions: 1_000,
        parallelWorkers: 8,
        encounters: ["plains_1", "plains_2", "plains_3"],
        policies: ["first", "random"],
    } as const;
}
