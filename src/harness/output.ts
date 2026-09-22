import fs from "node:fs";
import path from "node:path";
import type { BatchInput } from "./batch/batch";
import type { BatchSummary } from "./batch/summary";
import type { SingleFightInput, SingleFightResult } from "./harness";

export function batchSummaryFilename(input: BatchInput): string {
    return [
        safeFilenamePart(input.encounterId),
        safeFilenamePart(input.policy.id),
        `master-${input.masterSeed}`,
        `runs-${input.runs}`,
        `max-${input.maxActions}`,
        "summary.json",
    ].join("-");
}

export function writeBatchSummary(
    input: BatchInput,
    summary: BatchSummary,
    outputDir = path.resolve("harness-output"),
): string {
    const outputPath = path.join(outputDir, batchSummaryFilename(input));
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), "utf8");
    return outputPath;
}

export function fightResultFilename(input: SingleFightInput): string {
    return [
        safeFilenamePart(input.encounterId),
        `engine-${input.engineSeed}`,
        safeFilenamePart(input.policy.id),
        `policy-${input.policySeed}`,
    ].join("-") + ".json";
}

export function writeFightResult(
    input: SingleFightInput,
    result: SingleFightResult,
    outputDir = path.resolve("harness-output"),
): string {
    const outputPath = path.join(outputDir, fightResultFilename(input));
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");
    return outputPath;
}

function safeFilenamePart(value: string): string {
    return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}
