import { describe, expect, it } from "vitest";
import type { Character, Enemy, GameView, PlayerAction } from "../../src/engine/public/types";
import type { BatchResult, BatchRun } from "../../src/harness/batch";
import type { FightReplay, SingleFightTermination } from "../../src/harness/harness";
import { summarizeBatch, wilsonScoreInterval } from "../../src/harness/summary";

interface RunFixture {
    runIndex: number;
    termination: SingleFightTermination;
    actionCount: number;
    damage: number;
    peakBondage: number;
    escapes?: number;
    remainingEnemyHp: number;
    round?: number;
}

const endTurn = (): PlayerAction => ({ type: "endTurn" });

function character(id: string, bindingValues: number[]): Character {
    return {
        id, acted: false, standing: true, bonusEscapes: 0,
        bindings: bindingValues.map((value, index) => ({
            id: `binding-${index}`, value, level: "easy", data: {}, status: [],
        })),
        buffs: [], modifiers: {}, blockedMoveTypes: [], data: {},
    };
}

function enemy(currHp: number): Enemy {
    return {
        id: `enemy-${currHp}`, rank: "enemy", maxHp: 100, currHp, currDef: 0,
        intentions: [], buffs: [], cooldowns: {},
    };
}

function view(fixture: RunFixture): GameView {
    return {
        turn: {
            round: fixture.round ?? 1,
            step: 1,
            phase: "player",
            outcome: fixture.termination === "victory" || fixture.termination === "defeat"
                ? fixture.termination
                : "ongoing",
        },
        characters: [character("ko", [fixture.peakBondage / 2])],
        enemies: fixture.remainingEnemyHp === 0 ? [] : [enemy(fixture.remainingEnemyHp)],
        traps: [], encounter: null, actions: [],
    };
}

function run(fixture: RunFixture): BatchRun {
    const trace = Array.from({ length: fixture.actionCount }, endTurn);
    return {
        runIndex: fixture.runIndex,
        engineSeed: 1_000 + fixture.runIndex,
        policySeed: 2_000 + fixture.runIndex,
        result: {
            encounterId: "fixture",
            engineSeed: 1_000 + fixture.runIndex,
            policyId: "fixture-policy",
            policySeed: 2_000 + fixture.runIndex,
            termination: fixture.termination,
            finalState: view(fixture),
            actionCount: fixture.actionCount,
            metrics: {
                decisions: fixture.actionCount,
                damage: fixture.damage,
                peakBondage: fixture.peakBondage,
                escapes: fixture.escapes ?? 0,
            },
            trace,
        },
    };
}

function batch(runs: BatchRun[]): BatchResult {
    return { encounterId: "fixture", policyId: "fixture-policy", masterSeed: 99, runs };
}

function fixtureBatch(): BatchResult {
    return batch([
        run({ runIndex: 0, termination: "victory", actionCount: 2, damage: 100, peakBondage: 4, escapes: 0, remainingEnemyHp: 0, round: 2 }),
        run({ runIndex: 5, termination: "defeat", actionCount: 3, damage: 20, peakBondage: 8, escapes: 1, remainingEnemyHp: 50, round: 3 }),
        run({ runIndex: 1, termination: "maxActions", actionCount: 4, damage: 40, peakBondage: 12, escapes: 2, remainingEnemyHp: 30, round: 4 }),
        run({ runIndex: 8, termination: "error", actionCount: 1, damage: 0, peakBondage: 0, escapes: 1, remainingEnemyHp: 90, round: 1 }),
    ]);
}

describe("batch summary metrics", () => {
    it("counts outcomes and computes all comparison means across every run", () => {
        const summary = summarizeBatch(fixtureBatch());
        expect(summary).toMatchObject({
            encounterId: "fixture", policyId: "fixture-policy", masterSeed: 99, runCount: 4,
            outcomes: {
                victory: { count: 1, rate: 0.25 },
                defeat: { count: 1, rate: 0.25 },
                maxActions: { count: 1, rate: 0.25 },
                error: { count: 1, rate: 0.25 },
            },
            metrics: {
                runs: 4,
                winRate: 0.25,
                meanDecisions: 2.5,
                meanDamage: 40,
                meanPeakBondage: 6,
                meanEscapes: 1,
            },
        });
    });

    it("keeps existing distributions, action usage, and final-party summaries", () => {
        const summary = summarizeBatch(fixtureBatch());
        expect(summary.fightLength.actionCount).toEqual({ min: 1, mean: 2.5, median: 2.5, p90: 4, max: 4 });
        expect(summary.fightLength.round).toEqual({ min: 1, mean: 2.5, median: 2.5, p90: 4, max: 4 });
        expect(summary.actionUsage.endTurnActions).toBe(10);
        expect(summary.finalParty.ko).toEqual({ observations: 4, averageTotalBinding: 3, maxTotalBinding: 6 });
    });

    it("uses a Wilson 95% interval for ordinary, zero-win, and all-win proportions", () => {
        expect(wilsonScoreInterval(52, 100)).toEqual({
            lower: expect.closeTo(0.423165, 5),
            upper: expect.closeTo(0.615354, 5),
        });
        expect(wilsonScoreInterval(0, 10)).toEqual({
            lower: 0,
            upper: expect.closeTo(0.277533, 5),
        });
        expect(wilsonScoreInterval(10, 10)).toEqual({
            lower: expect.closeTo(0.722467, 5),
            upper: 1,
        });
        expect(wilsonScoreInterval(0, 0)).toBeNull();
    });

    it("selects every defeat example by its documented metric", () => {
        const summary = summarizeBatch(batch([
            run({ runIndex: 5, termination: "defeat", actionCount: 2, damage: 20, peakBondage: 1, remainingEnemyHp: 50 }),
            run({ runIndex: 3, termination: "defeat", actionCount: 4, damage: 10, peakBondage: 1, remainingEnemyHp: 20 }),
            run({ runIndex: 8, termination: "defeat", actionCount: 6, damage: 30, peakBondage: 1, remainingEnemyHp: 70 }),
        ])).forensicExamples;

        expect(summary.shortestDefeat?.runIndex).toBe(5);
        expect(summary.longestDefeat?.runIndex).toBe(8);
        expect(summary.lowestDamageDefeat?.runIndex).toBe(3);
        expect(summary.highestDamageDefeat?.runIndex).toBe(8);
        expect(summary.closestDefeat?.runIndex).toBe(3);
        expect(summary.furthestDefeat?.runIndex).toBe(8);
        expect(summary.closestDefeat).toMatchObject({ damage: 10, peakBondage: 1, remainingEnemyHp: 20 });
        expect(summary.closestDefeat).not.toHaveProperty("result");
    });

    it("breaks every defeat-example tie with the lowest run index", () => {
        const forensic = summarizeBatch(batch([
            run({ runIndex: 9, termination: "defeat", actionCount: 2, damage: 20, peakBondage: 1, remainingEnemyHp: 50 }),
            run({ runIndex: 2, termination: "defeat", actionCount: 2, damage: 20, peakBondage: 1, remainingEnemyHp: 50 }),
        ])).forensicExamples;
        for (const name of [
            "shortestDefeat", "longestDefeat", "lowestDamageDefeat",
            "highestDamageDefeat", "closestDefeat", "furthestDefeat",
        ] as const) {
            expect(forensic[name]?.runIndex).toBe(2);
        }
    });

    it("selects the lowest run index for timeout and error examples", () => {
        const forensic = summarizeBatch(batch([
            run({ runIndex: 7, termination: "maxActions", actionCount: 1, damage: 0, peakBondage: 0, remainingEnemyHp: 1 }),
            run({ runIndex: 1, termination: "maxActions", actionCount: 1, damage: 0, peakBondage: 0, remainingEnemyHp: 1 }),
            run({ runIndex: 8, termination: "error", actionCount: 1, damage: 0, peakBondage: 0, remainingEnemyHp: 1 }),
            run({ runIndex: 0, termination: "error", actionCount: 1, damage: 0, peakBondage: 0, remainingEnemyHp: 1 }),
        ])).forensicExamples;
        expect(forensic.timeoutExample?.runIndex).toBe(1);
        expect(forensic.errorExample?.runIndex).toBe(0);
    });

    it("has no unbounded failure arrays and defines empty-batch values without NaN", () => {
        const summary = summarizeBatch(batch([]));
        expect(summary.metrics).toEqual({
            runs: 0, winRate: 0, meanDecisions: null, meanDamage: null,
            meanPeakBondage: null, meanEscapes: null, win95: null,
        });
        expect(summary.fightLength).toEqual({ actionCount: null, round: null });
        expect(Object.values(summary.forensicExamples).every((value) => value === null)).toBe(true);
        expect(JSON.stringify(summary)).not.toMatch(/"(?:defeats|errors|maxActions)":\s*\[/);
    });

    it("is replay-independent and does not mutate batch input", () => {
        const original = fixtureBatch();
        const withReplay = structuredClone(original);
        for (const { result } of withReplay.runs) {
            const replay: FightReplay = { initialState: structuredClone(result.finalState), steps: [] };
            result.replay = replay;
        }
        const before = structuredClone(withReplay);
        expect(summarizeBatch(withReplay)).toEqual(summarizeBatch(original));
        expect(withReplay).toEqual(before);
    });
});
