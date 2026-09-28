import {
    runSingleFight,
    type FightMetrics,
    type SingleFightInput,
    type SingleFightResult,
    type SingleFightTermination,
} from "../harness";
import type { BatchInput, BatchResult, BatchRun } from "./batch";

export type ReplaySampleLabel =
    | "representative-win"
    | "representative-loss"
    | "stressed-win"
    | "promising-loss";

export interface ReplaySampleSelection {
    label: ReplaySampleLabel;
    runIndex: number;
    engineSeed: number;
    policySeed: number;
    termination: SingleFightTermination;
    decisions: number;
    rounds: number;
    damage: number;
    peakBondage: number;
}

export interface CapturedReplaySample extends ReplaySampleSelection {
    input: SingleFightInput;
    result: SingleFightResult;
}

export type SingleFightRunner = (input: SingleFightInput) => SingleFightResult;

/**
 * Selects at most two stable run identities without retaining or inspecting replay data.
 * Non-terminal runs are deliberately excluded because the requested sample labels describe
 * wins and losses; ordinary valid batches consist of those outcomes.
 */
export function selectReplaySamples(runs: readonly BatchRun[]): ReplaySampleSelection[] {
    const victories = runs.filter(({ result }) => result.termination === "victory");
    const defeats = runs.filter(({ result }) => result.termination === "defeat");

    if (victories.length > 0 && defeats.length > 0) {
        return [
            selection("representative-win", representative(victories)),
            selection("representative-loss", representative(defeats)),
        ];
    }

    if (victories.length > 0) {
        const representativeRun = representative(victories);
        const stressedRun = [...victories]
            .filter((run) => run.runIndex !== representativeRun.runIndex)
            .sort(compareStressedVictory)[0];
        return [
            selection("representative-win", representativeRun),
            ...(stressedRun ? [selection("stressed-win", stressedRun)] : []),
        ];
    }

    if (defeats.length > 0) {
        const representativeRun = representative(defeats);
        const promisingRun = [...defeats]
            .filter((run) => run.runIndex !== representativeRun.runIndex)
            .sort(comparePromisingDefeat)[0];
        return [
            selection("representative-loss", representativeRun),
            ...(promisingRun ? [selection("promising-loss", promisingRun)] : []),
        ];
    }

    return [];
}

/** Reruns only the selected deterministic engine/policy seed pairs with replay capture enabled. */
export function captureReplaySamples(
    input: BatchInput,
    batch: BatchResult,
    runner: SingleFightRunner = runSingleFight,
): CapturedReplaySample[] {
    return selectReplaySamples(batch.runs).map((selected) => {
        const replayInput: SingleFightInput = {
            encounterId: input.encounterId,
            engineSeed: selected.engineSeed,
            policySeed: selected.policySeed,
            maxActions: input.maxActions,
            policy: input.policy,
            replay: true,
        };
        const result = runner(replayInput);
        if (!result.replay) {
            throw new Error(
                `Replay capture produced no replay for batch run ${selected.runIndex}`,
            );
        }
        return { ...selected, input: replayInput, result };
    });
}

function representative(runs: readonly BatchRun[]): BatchRun {
    const sortedDecisions = runs
        .map(({ result }) => result.actionCount)
        .sort((left, right) => left - right);
    const middle = Math.floor(sortedDecisions.length / 2);
    const median = sortedDecisions.length % 2 === 0
        ? (sortedDecisions[middle - 1] + sortedDecisions[middle]) / 2
        : sortedDecisions[middle];

    return [...runs].sort((left, right) => {
        const distanceDifference = Math.abs(left.result.actionCount - median)
            - Math.abs(right.result.actionCount - median);
        return distanceDifference || compareRunIdentity(left, right);
    })[0];
}

function compareStressedVictory(left: BatchRun, right: BatchRun): number {
    return descendingMetric(left.result.metrics, right.result.metrics, "peakBondage")
        || (right.result.actionCount - left.result.actionCount)
        || compareRunIdentity(left, right);
}

function comparePromisingDefeat(left: BatchRun, right: BatchRun): number {
    return descendingMetric(left.result.metrics, right.result.metrics, "damage")
        || (right.result.actionCount - left.result.actionCount)
        || compareRunIdentity(left, right);
}

function descendingMetric(
    left: FightMetrics,
    right: FightMetrics,
    metric: "damage" | "peakBondage",
): number {
    return right[metric] - left[metric];
}

function compareRunIdentity(left: BatchRun, right: BatchRun): number {
    return (left.runIndex - right.runIndex)
        || (left.engineSeed - right.engineSeed)
        || (left.policySeed - right.policySeed);
}

function selection(label: ReplaySampleLabel, run: BatchRun): ReplaySampleSelection {
    return {
        label,
        runIndex: run.runIndex,
        engineSeed: run.engineSeed,
        policySeed: run.policySeed,
        termination: run.result.termination,
        decisions: run.result.actionCount,
        rounds: run.result.finalState.turn.round,
        damage: run.result.metrics.damage,
        peakBondage: run.result.metrics.peakBondage,
    };
}
