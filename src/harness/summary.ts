import type { BatchResult, BatchRun } from "./batch";
import type { SingleFightTermination } from "./harness";

export interface OutcomeMetric {
    count: number;
    /** Fraction of all runs, from 0 to 1. Zero when the batch is empty. */
    rate: number;
}

export interface OutcomeSummary {
    victory: OutcomeMetric;
    defeat: OutcomeMetric;
    maxActions: OutcomeMetric;
    error: OutcomeMetric;
}

export interface DistributionSummary {
    min: number;
    mean: number;
    median: number;
    p90: number;
    max: number;
}

export interface FightLengthSummary {
    actionCount: DistributionSummary | null;
    round: DistributionSummary | null;
}

export interface ActionUsageSummary {
    totalMoveActions: number;
    moves: Record<string, number>;
    escapeActions: number;
    stanceActions: number;
    endTurnActions: number;
}

export interface CharacterFinalConditionSummary {
    /** Number of final states in which this character was present. */
    observations: number;
    averageTotalBinding: number;
    maxTotalBinding: number;
}

export interface RunReference {
    runIndex: number;
    engineSeed: number;
    policySeed: number;
    termination: SingleFightTermination;
    actionCount: number;
    round: number;
}

export interface InterestingRunSummary {
    defeats: RunReference[];
    errors: RunReference[];
    maxActions: RunReference[];
    /** Lowest runIndex among fights tied for the shortest action count. */
    shortest: RunReference | null;
    /** Lowest runIndex among fights tied for the longest action count. */
    longest: RunReference | null;
}

export interface BatchSummary {
    encounterId: string;
    policyId: string;
    masterSeed: number;
    runCount: number;
    outcomes: OutcomeSummary;
    fightLength: FightLengthSummary;
    actionUsage: ActionUsageSummary;
    finalParty: Record<string, CharacterFinalConditionSummary>;
    interestingRuns: InterestingRunSummary;
}

interface MutableCharacterAggregate {
    observations: number;
    totalBinding: number;
    maxTotalBinding: number;
}

/** Summarizes only facts already present in a batch result. */
export function summarizeBatch(batch: BatchResult): BatchSummary {
    const runCount = batch.runs.length;
    const outcomeCounts: Record<SingleFightTermination, number> = {
        victory: 0,
        defeat: 0,
        maxActions: 0,
        error: 0,
    };
    const actionCounts: number[] = [];
    const rounds: number[] = [];
    const actionUsage: ActionUsageSummary = {
        totalMoveActions: 0,
        moves: {},
        escapeActions: 0,
        stanceActions: 0,
        endTurnActions: 0,
    };
    const characterAggregates = new Map<string, MutableCharacterAggregate>();
    const interestingRuns: InterestingRunSummary = {
        defeats: [],
        errors: [],
        maxActions: [],
        shortest: null,
        longest: null,
    };

    for (const run of batch.runs) {
        const { result } = run;
        outcomeCounts[result.termination] += 1;
        actionCounts.push(result.actionCount);
        rounds.push(result.finalState.turn.round);

        aggregateActions(actionUsage, result.trace);
        aggregateFinalParty(characterAggregates, result.finalState.characters);

        const reference = toRunReference(run);
        if (result.termination === "defeat") interestingRuns.defeats.push(reference);
        if (result.termination === "error") interestingRuns.errors.push(reference);
        if (result.termination === "maxActions") interestingRuns.maxActions.push(reference);

        if (isPreferredShortest(reference, interestingRuns.shortest)) {
            interestingRuns.shortest = reference;
        }
        if (isPreferredLongest(reference, interestingRuns.longest)) {
            interestingRuns.longest = reference;
        }
    }

    return {
        encounterId: batch.encounterId,
        policyId: batch.policyId,
        masterSeed: batch.masterSeed,
        runCount,
        outcomes: {
            victory: outcomeMetric(outcomeCounts.victory, runCount),
            defeat: outcomeMetric(outcomeCounts.defeat, runCount),
            maxActions: outcomeMetric(outcomeCounts.maxActions, runCount),
            error: outcomeMetric(outcomeCounts.error, runCount),
        },
        fightLength: {
            actionCount: summarizeDistribution(actionCounts),
            round: summarizeDistribution(rounds),
        },
        actionUsage,
        finalParty: finishFinalParty(characterAggregates),
        interestingRuns,
    };
}

function outcomeMetric(count: number, runCount: number): OutcomeMetric {
    return { count, rate: runCount === 0 ? 0 : count / runCount };
}

function summarizeDistribution(values: number[]): DistributionSummary | null {
    if (values.length === 0) return null;

    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];

    // Nearest-rank percentile: value at ceil(p * N) - 1 in ascending order.
    const p90Index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(0.9 * sorted.length) - 1));

    return {
        min: sorted[0],
        mean: values.reduce((sum, value) => sum + value, 0) / values.length,
        median,
        p90: sorted[p90Index],
        max: sorted[sorted.length - 1],
    };
}

function aggregateActions(
    summary: ActionUsageSummary,
    trace: BatchRun["result"]["trace"],
): void {
    for (const action of trace) {
        switch (action.type) {
            case "move":
                summary.totalMoveActions += 1;
                summary.moves[action.move] = (summary.moves[action.move] ?? 0) + 1;
                break;
            case "escape":
                summary.escapeActions += 1;
                break;
            case "stance":
                summary.stanceActions += 1;
                break;
            case "endTurn":
                summary.endTurnActions += 1;
                break;
        }
    }
}

function aggregateFinalParty(
    aggregates: Map<string, MutableCharacterAggregate>,
    characters: BatchRun["result"]["finalState"]["characters"],
): void {
    for (const character of characters) {
        const totalBinding = character.bindings.reduce(
            (sum, binding) => sum + binding.value,
            0,
        );
        const aggregate = aggregates.get(character.id);
        if (aggregate) {
            aggregate.observations += 1;
            aggregate.totalBinding += totalBinding;
            aggregate.maxTotalBinding = Math.max(aggregate.maxTotalBinding, totalBinding);
        } else {
            aggregates.set(character.id, {
                observations: 1,
                totalBinding,
                maxTotalBinding: totalBinding,
            });
        }
    }
}

function finishFinalParty(
    aggregates: Map<string, MutableCharacterAggregate>,
): Record<string, CharacterFinalConditionSummary> {
    const result: Record<string, CharacterFinalConditionSummary> = {};
    for (const id of [...aggregates.keys()].sort()) {
        const aggregate = aggregates.get(id)!;
        result[id] = {
            observations: aggregate.observations,
            averageTotalBinding: aggregate.totalBinding / aggregate.observations,
            maxTotalBinding: aggregate.maxTotalBinding,
        };
    }
    return result;
}

function toRunReference(run: BatchRun): RunReference {
    return {
        runIndex: run.runIndex,
        engineSeed: run.engineSeed,
        policySeed: run.policySeed,
        termination: run.result.termination,
        actionCount: run.result.actionCount,
        round: run.result.finalState.turn.round,
    };
}

function isPreferredShortest(candidate: RunReference, current: RunReference | null): boolean {
    return current === null
        || candidate.actionCount < current.actionCount
        || (candidate.actionCount === current.actionCount && candidate.runIndex < current.runIndex);
}

function isPreferredLongest(candidate: RunReference, current: RunReference | null): boolean {
    return current === null
        || candidate.actionCount > current.actionCount
        || (candidate.actionCount === current.actionCount && candidate.runIndex < current.runIndex);
}
