import { describe, expect, it, vi } from "vitest";
import { makePublicGameState } from "../helpers/publicTestData";
import type { GameState } from "../../src/engine/public/types";
import type { BatchInput, BatchResult, BatchRun } from "../../src/harness/batch/batch";
import {
    captureReplaySamples,
    selectReplaySamples,
} from "../../src/harness/batch/replay-samples";
import { summarizeBatch } from "../../src/harness/batch/summary";
import type { SingleFightResult, SingleFightTermination } from "../../src/harness/harness";
import { basicPolicy } from "../../src/harness/policy/basic";

describe("automatic batch replay samples", () => {
    it("selects a representative win and representative loss from mixed outcomes", () => {
        const runs = [
            run(0, "victory", 1),
            run(1, "victory", 5),
            run(2, "victory", 12),
            run(3, "defeat", 2),
            run(4, "defeat", 8),
        ];

        expect(selectReplaySamples(runs).map(({ label, runIndex }) => ({ label, runIndex })))
            .toEqual([
                { label: "representative-win", runIndex: 1 },
                { label: "representative-loss", runIndex: 3 },
            ]);
    });

    it("selects a representative and the highest-stress distinct victory", () => {
        const runs = [
            run(0, "victory", 1, { peakBondage: 4 }),
            run(1, "victory", 5, { peakBondage: 5 }),
            run(2, "victory", 9, { peakBondage: 20 }),
        ];

        expect(selectReplaySamples(runs).map(({ label, runIndex }) => ({ label, runIndex })))
            .toEqual([
                { label: "representative-win", runIndex: 1 },
                { label: "stressed-win", runIndex: 2 },
            ]);
    });

    it("selects a representative and the highest-damage distinct defeat", () => {
        const runs = [
            run(0, "defeat", 2, { damage: 3 }),
            run(1, "defeat", 6, { damage: 8 }),
            run(2, "defeat", 10, { damage: 30 }),
        ];

        expect(selectReplaySamples(runs).map(({ label, runIndex }) => ({ label, runIndex })))
            .toEqual([
                { label: "representative-loss", runIndex: 1 },
                { label: "promising-loss", runIndex: 2 },
            ]);
    });

    it("uses the next-best edge candidate when the representative is the extreme", () => {
        const wins = [
            run(0, "victory", 1, { peakBondage: 5 }),
            run(1, "victory", 5, { peakBondage: 100 }),
            run(2, "victory", 9, { peakBondage: 20 }),
        ];
        const losses = [
            run(0, "defeat", 1, { damage: 5 }),
            run(1, "defeat", 5, { damage: 100 }),
            run(2, "defeat", 9, { damage: 20 }),
        ];

        expect(selectReplaySamples(wins).map(({ runIndex }) => runIndex)).toEqual([1, 2]);
        expect(selectReplaySamples(losses).map(({ runIndex }) => runIndex)).toEqual([1, 2]);
    });

    it("is deterministic and independent of worker completion order", () => {
        const ordered = [
            run(0, "victory", 4, { peakBondage: 9 }),
            run(1, "defeat", 3, { damage: 11 }),
            run(2, "victory", 8, { peakBondage: 2 }),
            run(3, "defeat", 7, { damage: 18 }),
        ];
        const shuffled = [ordered[3], ordered[1], ordered[2], ordered[0]];

        expect(selectReplaySamples(shuffled)).toEqual(selectReplaySamples(ordered));
        expect(selectReplaySamples(ordered)).toEqual(selectReplaySamples(ordered));
    });

    it("reruns only selected identities with their original engine and policy seeds", () => {
        const batchInput = input();
        const batch = result([
            run(0, "victory", 2),
            run(1, "defeat", 3),
            run(2, "victory", 7),
        ]);
        const runner = vi.fn((fightInput) => ({
            ...batch.runs.find(({ engineSeed }) => engineSeed === fightInput.engineSeed)!.result,
            replay: { initialState: state("ongoing", 1), initialActions: [], steps: [] },
        }));

        const samples = captureReplaySamples(batchInput, batch, runner);

        expect(runner).toHaveBeenCalledTimes(2);
        expect(runner.mock.calls.map(([fightInput]) => fightInput)).toEqual(
            samples.map((sample) => ({
                encounterId: batchInput.encounterId,
                engineSeed: sample.engineSeed,
                policySeed: sample.policySeed,
                maxActions: batchInput.maxActions,
                policy: batchInput.policy,
                replay: true,
            })),
        );
    });

    it("does not mutate the batch or change its aggregate summary", () => {
        const batchInput = input();
        const batch = result([
            run(0, "victory", 2),
            run(1, "defeat", 3),
        ]);
        const before = summarizeBatch(batch);
        const runner = vi.fn((fightInput) => ({
            ...batch.runs.find(({ engineSeed }) => engineSeed === fightInput.engineSeed)!.result,
            replay: { initialState: state("ongoing", 1), initialActions: [], steps: [] },
        }));

        captureReplaySamples(batchInput, batch, runner);

        expect(summarizeBatch(batch)).toEqual(before);
        expect(batch.runs.every(({ result: fight }) => fight.replay === undefined)).toBe(true);
    });

    it("returns one representative replay for a single-run batch", () => {
        expect(selectReplaySamples([run(7, "defeat", 4)]).map(({ label, runIndex }) => ({
            label,
            runIndex,
        }))).toEqual([{ label: "representative-loss", runIndex: 7 }]);
    });
});

function input(): BatchInput {
    return {
        encounterId: "plains_1",
        policy: basicPolicy,
        masterSeed: 91,
        runs: 3,
        maxActions: 100,
        replay: false,
    };
}

function result(runs: BatchRun[]): BatchResult {
    return {
        encounterId: "plains_1",
        policyId: basicPolicy.id,
        masterSeed: 91,
        runs,
    };
}

function run(
    runIndex: number,
    termination: SingleFightTermination,
    decisions: number,
    metrics: Partial<SingleFightResult["metrics"]> = {},
): BatchRun {
    const engineSeed = 1_000 + runIndex;
    const policySeed = 2_000 + runIndex;
    return {
        runIndex,
        engineSeed,
        policySeed,
        result: {
            encounterId: "plains_1",
            engineSeed,
            policyId: basicPolicy.id,
            policySeed,
            termination,
            finalState: state(termination === "victory" ? "victory" : "defeat", decisions),
            actionCount: decisions,
            metrics: {
                decisions,
                damage: metrics.damage ?? decisions,
                peakBondage: metrics.peakBondage ?? decisions,
                escapes: metrics.escapes ?? 0,
            },
            trace: Array.from({ length: decisions }, () => ({ type: "endTurn" } as const)),
        },
    };
}

function state(outcome: GameState["turn"]["outcome"], round: number): GameState {
    return makePublicGameState({
        turn: { round, step: 1, phase: "player", outcome },
    });
}
