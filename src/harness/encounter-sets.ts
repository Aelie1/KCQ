import { performance } from "node:perf_hooks";
import { runBatch, type BatchResult } from "./batch";
import type { FightPolicy } from "./harness";
import { summarizeBatch, type BatchSummary } from "./summary";

export const encounterSets = {
    n123: ["plains_1", "plains_2", "plains_3"],
    h123: ["forest_1", "forest_2", "forest_3"],
    all6: [
        "plains_1",
        "plains_2",
        "plains_3",
        "forest_1",
        "forest_2",
        "forest_3",
    ],
} as const;

export type EncounterSetId = keyof typeof encounterSets;

export interface EncounterSetInput {
    encounterIds: readonly string[];
    policy: FightPolicy;
    masterSeed: number;
    runsPerEncounter: number;
    maxActions: number;
}

export interface EncounterSetProgress {
    encounterId: string;
    encounterCompleted: number;
    encounterTotal: number;
    overallCompleted: number;
    overallTotal: number;
}

export interface EncounterSetEncounterResult {
    encounterId: string;
    batch: BatchResult;
    summary: BatchSummary;
    elapsedMs: number;
}

export interface EncounterSetResult {
    encounters: EncounterSetEncounterResult[];
    elapsedMs: number;
}

export interface EncounterSetExecutionOptions {
    now?: () => number;
    runBatch?: typeof runBatch;
    onProgress?: (progress: EncounterSetProgress) => void;
    onEncounterComplete?: (result: EncounterSetEncounterResult) => void;
}

/** Runs each encounter as its own ordinary, independent batch. */
export function executeEncounterSet(
    input: EncounterSetInput,
    options: EncounterSetExecutionOptions = {},
): EncounterSetResult {
    const now = options.now ?? (() => performance.now());
    const executeBatch = options.runBatch ?? runBatch;
    const setStartedAt = now();
    const encounters: EncounterSetEncounterResult[] = [];
    const overallTotal = input.encounterIds.length * input.runsPerEncounter;

    for (let encounterIndex = 0; encounterIndex < input.encounterIds.length; encounterIndex += 1) {
        const encounterId = input.encounterIds[encounterIndex];
        const batchStartedAt = now();
        const batch = executeBatch({
            encounterId,
            policy: input.policy,
            masterSeed: input.masterSeed,
            runs: input.runsPerEncounter,
            maxActions: input.maxActions,
            replay: false,
        }, {
            onProgress(completed, total): void {
                options.onProgress?.({
                    encounterId,
                    encounterCompleted: completed,
                    encounterTotal: total,
                    overallCompleted: (encounterIndex * input.runsPerEncounter) + completed,
                    overallTotal,
                });
            },
        });
        const result: EncounterSetEncounterResult = {
            encounterId,
            batch,
            summary: summarizeBatch(batch),
            elapsedMs: Math.max(0, now() - batchStartedAt),
        };
        encounters.push(result);
        options.onEncounterComplete?.(result);
    }

    return { encounters, elapsedMs: Math.max(0, now() - setStartedAt) };
}
