import fs from "node:fs";
import path from "node:path";
import type { BatchInput } from "./batch/batch";
import type { BatchSummary } from "./batch/summary";
import type { SingleFightInput, SingleFightResult } from "./harness";

export interface BatchRunOutputInput {
    masterSeed: number;
    runsPerEncounter: number;
    maxActions: number;
    parallelWorkers: number;
    encounters: readonly string[];
    policies: readonly string[];
}

export interface BatchRunManifest {
    startedAt: string;
    masterSeed: number;
    runsPerEncounter: number;
    maxActions: number;
    parallelWorkers: number;
    encounters: string[];
    policies: string[];
}

export interface BatchRunOutput {
    directoryPath: string;
    manifest: BatchRunManifest;
}

export interface BatchRunOutputOptions {
    outputRoot?: string;
    now?: () => Date;
}

/** Reserves one collision-safe directory and writes its reproducibility manifest. */
export function createBatchRunOutput(
    input: BatchRunOutputInput,
    options: BatchRunOutputOptions = {},
): BatchRunOutput {
    const outputRoot = options.outputRoot ?? path.resolve("harness-output");
    const startedAt = options.now?.() ?? new Date();
    const baseName = formatBatchRunDirectoryName(
        startedAt,
        input.encounters.length,
        input.policies.length,
    );
    const directoryPath = reserveDirectory(outputRoot, baseName);
    const manifest: BatchRunManifest = {
        startedAt: formatLocalDateTime(startedAt),
        masterSeed: input.masterSeed,
        runsPerEncounter: input.runsPerEncounter,
        maxActions: input.maxActions,
        parallelWorkers: input.parallelWorkers,
        encounters: [...input.encounters],
        policies: [...input.policies],
    };
    writeBatchRunManifest(directoryPath, manifest);
    return { directoryPath, manifest };
}

export function formatBatchRunDirectoryName(
    startedAt: Date,
    levelCount: number,
    policyCount: number,
): string {
    const date = [
        startedAt.getFullYear(),
        pad2(startedAt.getMonth() + 1),
        pad2(startedAt.getDate()),
    ].join("-");
    const time = [
        pad2(startedAt.getHours()),
        pad2(startedAt.getMinutes()),
        pad2(startedAt.getSeconds()),
    ].join("-");
    return `${date}_${time}_${levelCount}_${pluralize("level", levelCount)}`
        + `_${policyCount}_${pluralize("policy", policyCount)}`;
}

export function writeBatchRunManifest(
    outputDir: string,
    manifest: BatchRunManifest,
): string {
    const outputPath = path.join(outputDir, "run.json");
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), "utf8");
    return outputPath;
}

export function batchSummaryFilename(input: Pick<BatchInput, "encounterId" | "policy">): string {
    return `${safeFilenamePart(input.encounterId)}-${safeFilenamePart(input.policy.id)}.json`;
}

export function writeBatchSummary(
    input: BatchInput,
    summary: BatchSummary,
    outputDir: string,
): string {
    const outputPath = path.join(outputDir, batchSummaryFilename(input));
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

export function formatSavedSummaries(
    count: number,
    outputDir: string,
): string {
    const relativeDir = path.relative(process.cwd(), outputDir) || ".";
    const displayDir = relativeDir.replaceAll(path.sep, "/").replace(/\/$/, "") + "/";
    return `Saved ${count.toLocaleString("en-US")} ${pluralize("summary", count)} to:\n${displayDir}`;
}

function reserveDirectory(outputRoot: string, baseName: string): string {
    fs.mkdirSync(outputRoot, { recursive: true });
    for (let suffix = 1; ; suffix += 1) {
        const name = suffix === 1 ? baseName : `${baseName}_${suffix}`;
        const candidate = path.join(outputRoot, name);
        try {
            fs.mkdirSync(candidate);
            return candidate;
        } catch (error: unknown) {
            if (!isAlreadyExistsError(error)) throw error;
        }
    }
}

function formatLocalDateTime(value: Date): string {
    const date = [value.getFullYear(), pad2(value.getMonth() + 1), pad2(value.getDate())].join("-");
    const time = [pad2(value.getHours()), pad2(value.getMinutes()), pad2(value.getSeconds())].join(":");
    const offsetMinutes = -value.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absoluteOffset = Math.abs(offsetMinutes);
    const offset = `${sign}${pad2(Math.floor(absoluteOffset / 60))}:${pad2(absoluteOffset % 60)}`;
    return `${date}T${time}${offset}`;
}

function isAlreadyExistsError(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function pad2(value: number): string {
    return String(value).padStart(2, "0");
}

function pluralize(word: string, count: number): string {
    if (count === 1) return word;
    return word.endsWith("y") ? `${word.slice(0, -1)}ies` : `${word}s`;
}

function safeFilenamePart(value: string): string {
    return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}
