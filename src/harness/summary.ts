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

export interface WilsonInterval {
    lower: number;
    upper: number;
}

export interface BatchComparisonMetrics {
    runs: number;
    winRate: number;
    meanDecisions: number | null;
    meanDamage: number | null;
    meanPeakBondage: number | null;
    meanEscapes: number | null;
    win95: WilsonInterval | null;
}

export interface RunReference {
    runIndex: number;
    engineSeed: number;
    policySeed: number;
    termination: SingleFightTermination;
    actionCount: number;
    round: number;
    damage: number;
    peakBondage: number;
    remainingEnemyHp: number;
}

/** Fixed-size forensic examples. No field grows with the number of failures. */
export interface ForensicExamples {
    shortestDefeat: RunReference | null;
    longestDefeat: RunReference | null;
    lowestDamageDefeat: RunReference | null;
    highestDamageDefeat: RunReference | null;
    closestDefeat: RunReference | null;
    furthestDefeat: RunReference | null;
    timeoutExample: RunReference | null;
    errorExample: RunReference | null;
}

export interface BatchSummary {
    encounterId: string;
    policyId: string;
    masterSeed: number;
    runCount: number;
    outcomes: OutcomeSummary;
    metrics: BatchComparisonMetrics;
    fightLength: FightLengthSummary;
    actionUsage: ActionUsageSummary;
    finalParty: Record<string, CharacterFinalConditionSummary>;
    forensicExamples: ForensicExamples;
}

interface MutableCharacterAggregate {
    observations: number;
    totalBinding: number;
    maxTotalBinding: number;
}

const WILSON_95_Z = 1.959963984540054;

/** Standard two-sided 95% Wilson score interval for a binomial proportion. */
export function wilsonScoreInterval(wins: number, runs: number): WilsonInterval | null {
    if (runs === 0) return null;
    if (!Number.isSafeInteger(runs) || runs < 0 || !Number.isSafeInteger(wins)
        || wins < 0 || wins > runs) {
        throw new RangeError("wins and runs must be safe integers with 0 <= wins <= runs");
    }

    const proportion = wins / runs;
    const zSquared = WILSON_95_Z ** 2;
    const denominator = 1 + (zSquared / runs);
    const center = (proportion + (zSquared / (2 * runs))) / denominator;
    const margin = (WILSON_95_Z / denominator) * Math.sqrt(
        (proportion * (1 - proportion) / runs) + (zSquared / (4 * runs ** 2)),
    );
    return {
        lower: wins === 0 ? 0 : Math.max(0, center - margin),
        upper: wins === runs ? 1 : Math.min(1, center + margin),
    };
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
    const damageValues: number[] = [];
    const peakBondageValues: number[] = [];
    const escapeValues: number[] = [];
    const actionUsage: ActionUsageSummary = {
        totalMoveActions: 0,
        moves: {},
        escapeActions: 0,
        stanceActions: 0,
        endTurnActions: 0,
    };
    const characterAggregates = new Map<string, MutableCharacterAggregate>();
    const forensicExamples: ForensicExamples = {
        shortestDefeat: null,
        longestDefeat: null,
        lowestDamageDefeat: null,
        highestDamageDefeat: null,
        closestDefeat: null,
        furthestDefeat: null,
        timeoutExample: null,
        errorExample: null,
    };

    for (const run of batch.runs) {
        const { result } = run;
        outcomeCounts[result.termination] += 1;
        // The reporting contract defines decisions as result.actionCount.
        actionCounts.push(result.actionCount);
        rounds.push(result.finalState.turn.round);
        damageValues.push(result.metrics.damage);
        peakBondageValues.push(result.metrics.peakBondage);
        escapeValues.push(result.metrics.escapes);

        aggregateActions(actionUsage, result.trace);
        aggregateFinalParty(characterAggregates, result.finalState.characters);

        const reference = toRunReference(run);
        if (result.termination === "defeat") {
            forensicExamples.shortestDefeat = prefer(reference, forensicExamples.shortestDefeat, "actionCount", "low");
            forensicExamples.longestDefeat = prefer(reference, forensicExamples.longestDefeat, "actionCount", "high");
            forensicExamples.lowestDamageDefeat = prefer(reference, forensicExamples.lowestDamageDefeat, "damage", "low");
            forensicExamples.highestDamageDefeat = prefer(reference, forensicExamples.highestDamageDefeat, "damage", "high");
            forensicExamples.closestDefeat = prefer(reference, forensicExamples.closestDefeat, "remainingEnemyHp", "low");
            forensicExamples.furthestDefeat = prefer(reference, forensicExamples.furthestDefeat, "remainingEnemyHp", "high");
        }
        if (result.termination === "maxActions") {
            forensicExamples.timeoutExample = preferLowestRunIndex(reference, forensicExamples.timeoutExample);
        }
        if (result.termination === "error") {
            forensicExamples.errorExample = preferLowestRunIndex(reference, forensicExamples.errorExample);
        }
    }

    const victories = outcomeCounts.victory;
    return {
        encounterId: batch.encounterId,
        policyId: batch.policyId,
        masterSeed: batch.masterSeed,
        runCount,
        outcomes: {
            victory: outcomeMetric(victories, runCount),
            defeat: outcomeMetric(outcomeCounts.defeat, runCount),
            maxActions: outcomeMetric(outcomeCounts.maxActions, runCount),
            error: outcomeMetric(outcomeCounts.error, runCount),
        },
        metrics: {
            runs: runCount,
            winRate: runCount === 0 ? 0 : victories / runCount,
            meanDecisions: arithmeticMean(actionCounts),
            meanDamage: arithmeticMean(damageValues),
            meanPeakBondage: arithmeticMean(peakBondageValues),
            meanEscapes: arithmeticMean(escapeValues),
            win95: wilsonScoreInterval(victories, runCount),
        },
        fightLength: {
            actionCount: summarizeDistribution(actionCounts),
            round: summarizeDistribution(rounds),
        },
        actionUsage,
        finalParty: finishFinalParty(characterAggregates),
        forensicExamples,
    };
}

function outcomeMetric(count: number, runCount: number): OutcomeMetric {
    return { count, rate: runCount === 0 ? 0 : count / runCount };
}

function arithmeticMean(values: readonly number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeDistribution(values: number[]): DistributionSummary | null {
    if (values.length === 0) return null;

    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
    const p90Index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(0.9 * sorted.length) - 1));

    return {
        min: sorted[0],
        mean: arithmeticMean(values)!,
        median,
        p90: sorted[p90Index],
        max: sorted[sorted.length - 1],
    };
}

function aggregateActions(summary: ActionUsageSummary, trace: BatchRun["result"]["trace"]): void {
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
        const totalBinding = character.bindings.reduce((sum, binding) => sum + binding.value, 0);
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
        damage: run.result.metrics.damage,
        peakBondage: run.result.metrics.peakBondage,
        remainingEnemyHp: run.result.finalState.enemies.reduce((total, enemy) => total + enemy.currHp, 0),
    };
}

function prefer(
    candidate: RunReference,
    current: RunReference | null,
    metric: "actionCount" | "damage" | "remainingEnemyHp",
    direction: "low" | "high",
): RunReference {
    if (current === null) return candidate;
    const difference = candidate[metric] - current[metric];
    if ((direction === "low" && difference < 0) || (direction === "high" && difference > 0)) {
        return candidate;
    }
    return difference === 0 && candidate.runIndex < current.runIndex ? candidate : current;
}

function preferLowestRunIndex(candidate: RunReference, current: RunReference | null): RunReference {
    return current === null || candidate.runIndex < current.runIndex ? candidate : current;
}
