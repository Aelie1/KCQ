import { performance } from "node:perf_hooks";
import type { FightPolicy } from "../harness";
import { runBatch } from "./batch";
import {
    BatchWorkerPool,
    effectiveWorkerCount,
    type BatchWorkerRunner,
} from "./parallel-batch";
import {
    executePolicyComparison,
    type PolicyComparisonResult,
} from "./comparison";

export const encounterSets = {
    n123: ["plains_1", "plains_2", "plains_3"],
    h123: ["forest_1", "forest_2", "forest_3"],
    all6: ["plains_1", "plains_2", "plains_3", "forest_1", "forest_2", "forest_3"],
} as const;

export type EncounterSetId = keyof typeof encounterSets;

export interface EncounterSetInput {
    encounterIds: readonly string[];
    policies: readonly FightPolicy[];
    masterSeed: number;
    runsPerEncounter: number;
    maxActions: number;
    workers?: number;
}

export interface EncounterSetProgress {
    encounterId: string;
    policyId: string;
    encounterIndex: number;
    encounterCount: number;
    policyCompleted: number;
    policyTotal: number;
    overallCompleted: number;
    overallTotal: number;
}

export interface EncounterSetEncounterResult {
    encounterId: string;
    comparison: PolicyComparisonResult;
}

export interface EncounterSetResult {
    encounters: EncounterSetEncounterResult[];
    elapsedMs: number;
}

export interface EncounterSetExecutionOptions {
    now?: () => number;
    runBatch?: (
        input: Parameters<typeof runBatch>[0],
        options: Parameters<typeof runBatch>[1],
    ) => ReturnType<typeof runBatch> | Promise<ReturnType<typeof runBatch>>;
    onProgress?: (progress: EncounterSetProgress) => void;
    onEncounterComplete?: (result: EncounterSetEncounterResult) => void;
    /** A caller-owned pool, reused by every encounter and policy. */
    pool?: BatchWorkerRunner;
}

/** Runs every encounter-policy pair as an isolated ordinary batch. */
export async function executeEncounterSet(
    input: EncounterSetInput,
    options: EncounterSetExecutionOptions = {},
): Promise<EncounterSetResult> {
    const now = options.now ?? (() => performance.now());
    const startedAt = now();
    const encounters: EncounterSetEncounterResult[] = [];
    const fightsPerEncounter = input.policies.length * input.runsPerEncounter;
    const overallTotal = input.encounterIds.length * fightsPerEncounter;
    const parallelWorkers = effectiveWorkerCount(input.workers ?? 1, input.runsPerEncounter);
    const ownedPool = options.runBatch === undefined
        && options.pool === undefined
        && parallelWorkers > 1
        ? new BatchWorkerPool(parallelWorkers)
        : undefined;
    const pool = options.pool ?? ownedPool;

    try {
        for (let encounterIndex = 0; encounterIndex < input.encounterIds.length; encounterIndex += 1) {
            const encounterId = input.encounterIds[encounterIndex];
            const comparison = await executePolicyComparison({
                encounterId,
                policies: input.policies,
                masterSeed: input.masterSeed,
                runs: input.runsPerEncounter,
                maxActions: input.maxActions,
                workers: input.workers,
            }, {
                now,
                runBatch: options.runBatch,
                pool,
                onProgress(progress): void {
                    options.onProgress?.({
                        encounterId,
                        policyId: progress.policyId,
                        encounterIndex,
                        encounterCount: input.encounterIds.length,
                        policyCompleted: progress.policyCompleted,
                        policyTotal: progress.policyTotal,
                        overallCompleted: (encounterIndex * fightsPerEncounter) + progress.overallCompleted,
                        overallTotal,
                    });
                },
            });
            const result = { encounterId, comparison };
            encounters.push(result);
            options.onEncounterComplete?.(result);
        }

        return { encounters, elapsedMs: Math.max(0, now() - startedAt) };
    } finally {
        await ownedPool?.close();
    }
}
