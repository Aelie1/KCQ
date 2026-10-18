import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { executeMatrix, type MatrixInput } from "../../src/harness/batch/matrix";
import { formatPartyParity } from "../../src/harness/batch/matrix-reports";
import { captureReplaySamples } from "../../src/harness/batch/replay-samples";
import { runHarnessLauncher } from "../../src/harness/cli/launcher";
import { enumerateHarnessParties } from "../../src/harness/configuration";
import { appendMatrixEntry, createMatrixConfigurationDirectory, createMatrixRunOutput, writeBatchSummary, writeMatrixReports, writeReplaySamples } from "../../src/harness/output";
import { idlePolicy } from "../../src/harness/policy/idle";

const parties = enumerateHarnessParties();

describe("matrix output and interactive workflows", () => {
    it("writes reproducible metadata, unique summaries, incremental rows and correctly configured replay samples", async () => {
        const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kcq-matrix-"));
        try {
            const selection: MatrixInput = { encounterIds: ["plains_1"], masterSeed: 321,
                parties: [parties[2], parties[9]], difficulties: ["extreme", "mythic"], policies: [idlePolicy], runs: 1, maxActions: 100 };
            const options = { outputRoot, now: () => new Date("2026-10-18T12:00:00Z") };
            const output = createMatrixRunOutput(selection, options);
            expect(createMatrixRunOutput(selection, options).directoryPath).not.toBe(output.directoryPath);
            expect(JSON.parse(fs.readFileSync(path.join(output.directoryPath, "run.json"), "utf8"))).toMatchObject({
                encounterIds: ["plains_1"], parties: selection.parties, difficulties: selection.difficulties, policies: ["idle"],
                masterSeed: 321, runs: 1, maxActions: 100, workers: 1, seedMapping: "deriveRunSeeds(masterSeed, runIndex)",
            });
            const paths: string[] = [];
            let index = 0;
            const result = await executeMatrix(selection, {
                onConfigurationComplete(entry, comparison, batchInput) {
                    const directory = createMatrixConfigurationDirectory(index++, output.directoryPath);
                    paths.push(writeBatchSummary(batchInput, comparison.summary, directory));
                    appendMatrixEntry(entry, output.directoryPath);
                    const samples = captureReplaySamples(batchInput, comparison.batch);
                    expect(samples).toHaveLength(1);
                    for (const sample of samples) {
                        const { replay, ...gameplay } = sample.result;
                        expect(gameplay).toEqual(comparison.batch.runs[sample.runIndex].result);
                        expect(sample.input.party).toEqual(entry.party);
                        expect(sample.input.difficulty).toBe(entry.difficulty);
                        expect(replay!.initialState.characters.map(character => character.id)).toEqual(entry.party);
                        expect(replay!.initialState.difficulty.id).toBe(entry.difficulty);
                    }
                    paths.push(...writeReplaySamples(samples, directory).map(sample => sample.outputPath));
                },
            });
            expect(new Set(paths).size).toBe(8);
            expect(fs.readFileSync(path.join(output.directoryPath, "matrix.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line))).toEqual(result.entries);
            const reportPath = writeMatrixReports(formatPartyParity(result.entries), output.directoryPath);
            expect(fs.readFileSync(reportPath, "utf8")).toContain("Party parity:");
        } finally { fs.rmSync(outputRoot, { recursive: true, force: true }); }
    });

    it.each([
        ["5", "a", "standard", 10, 1],
        ["6", "1", "a", 1, 5],
        ["7", "1,10", "1,5", 2, 2],
    ])("launcher workflow %s selects the requested axes and saves reports", async (workflow, partyAnswer, difficultyAnswer, partyCount, difficultyCount) => {
        const answers = [String(workflow), "1,2", String(partyAnswer), String(difficultyAnswer), "basic", "7", "1", "1", "1", "4"];
        const write = vi.fn();
        const mkdir = vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
        const writeFile = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
        const append = vi.spyOn(fs, "appendFileSync").mockImplementation(() => {});
        const matrix = vi.fn(executeMatrix);
        try {
            await runHarnessLauncher({ question: async () => {
                if (!answers.length) throw new Error("Unexpected prompt");
                return answers.shift()!;
            }, write }, { executeMatrix: matrix });
            expect(matrix).toHaveBeenCalledOnce();
            const selected = matrix.mock.calls[0][0];
            expect(selected.parties).toHaveLength(Number(partyCount));
            expect(selected.difficulties).toHaveLength(Number(difficultyCount));
            expect(selected.encounterIds).toHaveLength(2);
            expect(append).toHaveBeenCalledTimes(2 * Number(partyCount) * Number(difficultyCount));
            expect(writeFile.mock.calls.some(([file]) => String(file).endsWith("reports.txt"))).toBe(true);
            expect(write.mock.calls.map(([line]) => line).join("")).toContain(workflow === "6" ? "Difficulty progression:" : "Party parity:");
        } finally { mkdir.mockRestore(); writeFile.mockRestore(); append.mockRestore(); }
    });
});
