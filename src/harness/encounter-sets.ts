import { performance } from "node:perf_hooks";
import { runBatch } from "./batch";
import {
    executePolicyComparison,
    type PolicyComparisonResult,
} from "./comparison";
import type { FightPolicy } from "./harness";

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
    runBatch?: typeof runBatch;
    onProgress?: (progress: EncounterSetProgress) => void;
    onEncounterComplete?: (result: EncounterSetEncounterResult) => void;
}

/** Runs every encounter-policy pair as an isolated ordinary batch. */
export function executeEncounterSet(
    input: EncounterSetInput,
    options: EncounterSetExecutionOptions = {},
): EncounterSetResult {
    const now = options.now ?? (() => performance.now());
    const startedAt = now();
    const encounters: EncounterSetEncounterResult[] = [];
    const fightsPerEncounter = input.policies.length * input.runsPerEncounter;
    const overallTotal = input.encounterIds.length * fightsPerEncounter;

    input.encounterIds.forEach((encounterId, encounterIndex) => {
        const comparison = executePolicyComparison({
            encounterId,
            policies: input.policies,
            masterSeed: input.masterSeed,
            runs: input.runsPerEncounter,
            maxActions: input.maxActions,
        }, {
            now,
            runBatch: options.runBatch,
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
    });

    return { encounters, elapsedMs: Math.max(0, now() - startedAt) };
}
