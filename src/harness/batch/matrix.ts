import { performance } from "node:perf_hooks";
import type { KCQCharacter } from "../../content";
import type { DifficultyId } from "../../engine/public/types";
import { createStockEngine } from "../../stock";
import { enumerateHarnessParties, harnessDifficulties, resolveFightConfiguration, type FightConfiguration } from "../configuration";
import type { FightPolicy } from "../harness";
import { getPolicy } from "../policies";
import { deriveRunSeeds, type BatchInput } from "./batch";
import { executePolicyComparison, type PolicyComparisonEntry, type PolicyComparisonExecutionOptions, type PolicyTiming } from "./comparison";
import { BatchWorkerPool, effectiveWorkerCount } from "./parallel-batch";
import type { BatchComparisonMetrics } from "./summary";

export interface MatrixInput {
    encounterIds: readonly string[];
    parties?: "all" | readonly (readonly KCQCharacter[])[];
    difficulties?: "all" | readonly DifficultyId[];
    policies: readonly FightPolicy[];
    masterSeed: number;
    runs: number;
    maxActions: number;
    workers?: number;
}

export interface ResolvedMatrixInput extends Omit<MatrixInput, "parties" | "difficulties" | "workers"> {
    parties: readonly (readonly KCQCharacter[])[];
    difficulties: readonly DifficultyId[];
    workers: number;
}

export interface MatrixEntry extends FightConfiguration {
    encounterId: string;
    policyId: string;
    metrics: BatchComparisonMetrics;
    meanRounds: number | null;
    timing: PolicyTiming;
}

export interface MatrixProgress extends FightConfiguration {
    encounterId: string;
    policyId: string;
    configurationIndex: number;
    configurationCount: number;
    configurationCompleted: number;
    configurationTotal: number;
    overallCompleted: number;
    overallTotal: number;
}

export interface MatrixResult {
    configuration: ResolvedMatrixInput;
    entries: MatrixEntry[];
    elapsedMs: number;
}

export interface MatrixExecutionOptions extends Pick<PolicyComparisonExecutionOptions, "now" | "runBatch" | "pool"> {
    onProgress?: (progress: MatrixProgress) => void;
    /** Awaited before the next batch. Write summaries/sample replays here, then release run data. */
    onConfigurationComplete?: (entry: MatrixEntry, comparison: PolicyComparisonEntry, input: BatchInput) => void | Promise<void>;
}

/** Validate the entire selection before creating workers or executing any fight. */
export function resolveMatrixInput(input: MatrixInput): ResolvedMatrixInput {
    deriveRunSeeds(input.masterSeed, 0);
    const parallelWorkers = effectiveWorkerCount(input.workers ?? 1, input.runs);
    if (!Number.isSafeInteger(input.maxActions) || input.maxActions < 0) {
        throw new Error("maxActions must be a non-negative safe integer");
    }
    const available = createStockEngine(0).listEncounters();
    if (!Array.isArray(input.encounterIds) || input.encounterIds.length === 0) throw new Error("Select at least one encounter");
    for (const id of input.encounterIds) {
        if (!available.includes(id)) throw new Error(`Unknown encounter ID: ${id}`);
    }
    if (!Array.isArray(input.policies) || input.policies.length === 0) throw new Error("Select at least one policy");
    for (const policy of input.policies) {
        if (!policy || typeof policy.id !== "string" || typeof policy.chooseAction !== "function") throw new Error("Invalid policy");
        if (parallelWorkers > 1 && getPolicy(policy.id) !== policy) {
            throw new Error(`Parallel batches require a registered policy object; received ${policy.id}`);
        }
    }
    const parties = input.parties === "all" ? enumerateHarnessParties()
        : input.parties === undefined ? [resolveFightConfiguration({}).party] : input.parties;
    if (!Array.isArray(parties) || parties.length === 0) throw new Error("Select at least one party");
    const validatedParties = parties.map(party => resolveFightConfiguration({ party }).party);
    const difficulties = input.difficulties === "all" ? [...harnessDifficulties]
        : input.difficulties === undefined ? ["standard" as const] : input.difficulties;
    if (!Array.isArray(difficulties) || difficulties.length === 0) throw new Error("Select at least one difficulty");
    difficulties.forEach(difficulty => resolveFightConfiguration({ difficulty }));
    // Explicit parties retain Cycle 1 order. Repeated identical selections execute once.
    const uniqueParties = [...new Map(validatedParties.map(party => [party.join("/"), party])).values()];
    const uniquePolicies = new Map<string, FightPolicy>();
    for (const policy of input.policies) {
        if (uniquePolicies.has(policy.id) && uniquePolicies.get(policy.id) !== policy) throw new Error(`Duplicate policy ID: ${policy.id}`);
        uniquePolicies.set(policy.id, policy);
    }
    const resolved: ResolvedMatrixInput = {
        encounterIds: [...new Set(input.encounterIds)], parties: uniqueParties,
        difficulties: harnessDifficulties.filter(difficulty => difficulties.includes(difficulty)),
        policies: [...uniquePolicies.values()], masterSeed: input.masterSeed, runs: input.runs,
        maxActions: input.maxActions, workers: input.workers ?? 1,
    };
    if (!Number.isSafeInteger(matrixConfigurationCount(resolved) * input.runs)) throw new Error("Matrix run total exceeds safe integer range");
    return resolved;
}

export function matrixConfigurationCount(input: ResolvedMatrixInput): number {
    return input.encounterIds.length * input.parties.length * input.difficulties.length * input.policies.length;
}

/** One ordinary policy comparison at a time, retaining only compact rows across batches. */
export async function executeMatrix(input: MatrixInput, options: MatrixExecutionOptions = {}): Promise<MatrixResult> {
    const configuration = resolveMatrixInput(input);
    const now = options.now ?? (() => performance.now());
    const startedAt = now();
    const entries: MatrixEntry[] = [];
    const count = matrixConfigurationCount(configuration);
    const workers = effectiveWorkerCount(configuration.workers, configuration.runs);
    const ownedPool = !options.pool && !options.runBatch && workers > 1 ? new BatchWorkerPool(workers) : undefined;
    try {
        for (const encounterId of configuration.encounterIds) {
            for (const party of configuration.parties) {
                for (const difficulty of configuration.difficulties) {
                    for (const policy of configuration.policies) {
                        const configurationIndex = entries.length;
                        const batchInput: BatchInput = { encounterId, party, difficulty, policy,
                            masterSeed: configuration.masterSeed, runs: configuration.runs, maxActions: configuration.maxActions, replay: false };
                        const comparison = await executePolicyComparison({ ...batchInput, policies: [policy], workers: configuration.workers }, {
                            now, runBatch: options.runBatch, pool: options.pool ?? ownedPool,
                            onProgress(progress) {
                                options.onProgress?.({ encounterId, party, difficulty, policyId: policy.id,
                                    configurationIndex, configurationCount: count,
                                    configurationCompleted: progress.policyCompleted, configurationTotal: configuration.runs,
                                    overallCompleted: configurationIndex * configuration.runs + progress.policyCompleted,
                                    overallTotal: count * configuration.runs });
                            },
                        });
                        const completed = comparison.policies[0];
                        const entry: MatrixEntry = { encounterId, party: [...party], difficulty, policyId: policy.id,
                            metrics: completed.summary.metrics, meanRounds: completed.summary.fightLength.round?.mean ?? null,
                            timing: completed.timing };
                        await options.onConfigurationComplete?.(entry, completed, batchInput);
                        entries.push(entry);
                    }
                }
            }
        }
        return { configuration, entries, elapsedMs: Math.max(0, now() - startedAt) };
    } finally {
        await ownedPool?.close();
    }
}
