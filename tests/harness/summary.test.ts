import { describe, expect, it } from "vitest";
import type { Character, Enemy, GameState, PlayerAction } from "../../src/engine/public/types";
import type { BatchResult, BatchRun } from "../../src/harness/batch/batch";
import { summarizeBatch, wilsonScoreInterval } from "../../src/harness/batch/summary";
import type { FightReplay, SingleFightResult, SingleFightTermination } from "../../src/harness/harness";
import type { DetailedCombatMetrics } from "../../src/harness/metrics";
import { STANDARD_DIFFICULTY } from "../helpers/state";

interface RunFixture {
    runIndex: number;
    termination: SingleFightTermination;
    actionCount: number;
    damage: number;
    peakBondage: number;
    escapes?: number;
    remainingEnemyHp: number;
    round?: number;
    detailedCombat?: DetailedCombatMetrics;
}

const endTurn = (): PlayerAction => ({ type: "endTurn" });

function character(id: string, bindingValues: number[]): Character {
    return {
        id, acted: false, standing: true, bonusEscapes: 0,
        bindings: bindingValues.map((value, index) => ({
            id: `binding-${index}`, value, level: "light", data: {}, status: [], tickEffects: [],
        })),
        buffs: [], cooldowns: {}, modifiers: {}, blockedMoveTypes: [], data: {},
    };
}

function enemy(currHp: number): Enemy {
    return {
        id: `enemy-${currHp}`, defId: "enemy", rank: "enemy", maxHp: 100, currHp, currDef: 0,
        intentions: [], buffs: [], cooldowns: {},
    };
}

function view(fixture: RunFixture): GameState {
    return {
        turn: {
            round: fixture.round ?? 1,
            step: 1,
            phase: "player",
            outcome: fixture.termination === "victory" || fixture.termination === "defeat"
                ? fixture.termination
                : "ongoing",
        },
        difficulty: STANDARD_DIFFICULTY,
        characters: [character("ko", [fixture.peakBondage / 2])],
        enemies: fixture.remainingEnemyHp === 0 ? [] : [enemy(fixture.remainingEnemyHp)],
        traps: [], encounter: null,
    };
}

function run(fixture: RunFixture): BatchRun {
    const trace = Array.from({ length: fixture.actionCount }, endTurn);
    const result: SingleFightResult = {
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
    };
    if (fixture.detailedCombat) {
        // This summary fixture intentionally supplies only the collector consumed here.
        // @ts-expect-error The production runner always supplies every core collector.
        result.collectorMetrics = { detailedCombat: fixture.detailedCombat };
    }
    return {
        runIndex: fixture.runIndex,
        engineSeed: 1_000 + fixture.runIndex,
        policySeed: 2_000 + fixture.runIndex,
        result,
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
            run({ runIndex: 0, termination: "victory", actionCount: 1, damage: 0, peakBondage: 1, remainingEnemyHp: 0 }),
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

    it("selects every victory example with the corresponding defeat metric", () => {
        const summary = summarizeBatch(batch([
            run({ runIndex: 5, termination: "victory", actionCount: 2, damage: 20, peakBondage: 1, remainingEnemyHp: 50 }),
            run({ runIndex: 3, termination: "victory", actionCount: 4, damage: 10, peakBondage: 1, remainingEnemyHp: 20 }),
            run({ runIndex: 8, termination: "victory", actionCount: 6, damage: 30, peakBondage: 1, remainingEnemyHp: 70 }),
            run({ runIndex: 0, termination: "defeat", actionCount: 10, damage: 100, peakBondage: 1, remainingEnemyHp: 100 }),
        ])).forensicExamples;

        expect(summary.shortestVictory?.runIndex).toBe(5);
        expect(summary.longestVictory?.runIndex).toBe(8);
        expect(summary.lowestDamageVictory?.runIndex).toBe(3);
        expect(summary.highestDamageVictory?.runIndex).toBe(8);
        expect(summary.closestVictory?.runIndex).toBe(3);
        expect(summary.furthestVictory?.runIndex).toBe(8);
        expect(summary.closestVictory).toMatchObject({
            runIndex: 3,
            engineSeed: 1_003,
            policySeed: 2_003,
            termination: "victory",
            damage: 10,
            peakBondage: 1,
            remainingEnemyHp: 20,
        });
        expect(summary.closestVictory).not.toHaveProperty("result");
    });

    it("leaves all victory examples null when there are no victories", () => {
        const forensic = summarizeBatch(batch([
            run({ runIndex: 1, termination: "defeat", actionCount: 2, damage: 20, peakBondage: 1, remainingEnemyHp: 50 }),
        ])).forensicExamples;

        for (const name of [
            "shortestVictory", "longestVictory", "lowestDamageVictory",
            "highestDamageVictory", "closestVictory", "furthestVictory",
        ] as const) {
            expect(forensic[name]).toBeNull();
        }
    });

    it("retains one rare victory in every victory example slot", () => {
        const forensic = summarizeBatch(batch([
            run({ runIndex: 999, termination: "victory", actionCount: 7, damage: 100, peakBondage: 6, remainingEnemyHp: 0, round: 4 }),
            run({ runIndex: 1, termination: "defeat", actionCount: 2, damage: 20, peakBondage: 1, remainingEnemyHp: 50 }),
        ])).forensicExamples;

        for (const name of [
            "shortestVictory", "longestVictory", "lowestDamageVictory",
            "highestDamageVictory", "closestVictory", "furthestVictory",
        ] as const) {
            expect(forensic[name]).toMatchObject({
                runIndex: 999,
                engineSeed: 1_999,
                policySeed: 2_999,
                termination: "victory",
            });
        }
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

    it("breaks every victory-example tie with the lowest run index", () => {
        const forensic = summarizeBatch(batch([
            run({ runIndex: 9, termination: "victory", actionCount: 2, damage: 20, peakBondage: 1, remainingEnemyHp: 50 }),
            run({ runIndex: 2, termination: "victory", actionCount: 2, damage: 20, peakBondage: 1, remainingEnemyHp: 50 }),
        ])).forensicExamples;
        for (const name of [
            "shortestVictory", "longestVictory", "lowestDamageVictory",
            "highestDamageVictory", "closestVictory", "furthestVictory",
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
            const replay: FightReplay = { initialState: structuredClone(result.finalState), initialActions: [], steps: [] };
            result.replay = replay;
        }
        const before = structuredClone(withReplay);
        expect(summarizeBatch(withReplay)).toEqual(summarizeBatch(original));
        expect(withReplay).toEqual(before);
    });

    it("aggregates compact detailed combat counters and derives per-use averages", () => {
        const detailed = (uses: number, damage: number, modifier: number): DetailedCombatMetrics => ({
            escapeSequences: { single: 1, double: 1, byActor: { ko: { single: 1, double: 1 } } },
            skunkings: { total: 1, byCharacter: { ko: 1 } },
            rescues: { total: 1, byCharacter: { ko: 1 }, byMove: { telekinesis: 1 } },
            playerMoves: {
                stop: {
                    uses,
                    totalDamage: damage,
                    accuracy: {
                        stat: "hit",
                        modifierTotal: modifier * uses,
                        modifierUses: uses,
                        minModifier: modifier,
                        maxModifier: modifier,
                        usesByModifier: { [String(modifier)]: uses },
                        results: { miss: 1, graze: 0, hit: uses - 1, crit: 0, none: 0 },
                    },
                    totalBondageRemoved: 2,
                    totalBondageBlocked: 4,
                },
            },
            bondageRemoved: { escapes: 5, skills: 2, rescues: 3, unattributed: 1 },
            bondageBlocked: { unattributed: 2 },
            bondageReceived: {
                moves: { latexRegeneration: 10 },
                ticks: { latexCollar: 2 },
                traps: { trapPuddle: 3 },
                unattributed: 1,
            },
            skunkExplosion: {
                intentionsQueued: 2,
                killedBeforeUse: 1,
                uses: 1,
                cancelledBeforeUse: 0,
                hpAtTrigger: {},
                unspentCharactersAtTrigger: {},
                hpAndUnspentAtTrigger: {},
            },
        });
        const summary = summarizeBatch(batch([
            run({ runIndex: 0, termination: "victory", actionCount: 1, damage: 10, peakBondage: 1, remainingEnemyHp: 0, detailedCombat: detailed(2, 12, -8) }),
            run({ runIndex: 1, termination: "defeat", actionCount: 1, damage: 20, peakBondage: 2, remainingEnemyHp: 10, detailedCombat: detailed(1, 3, 2) }),
        ]));

        expect(summary).toMatchObject({
            escapeSequences: { single: 2, double: 2, byActor: { ko: { single: 2, double: 2 } } },
            skunkings: { total: 2, byCharacter: { ko: 2 } },
            rescues: { total: 2, byCharacter: { ko: 2 }, byMove: { telekinesis: 2 } },
            playerMoves: {
                stop: {
                    uses: 3,
                    damage: { total: 15, averagePerUse: 5 },
                    accuracy: {
                        stat: "hit",
                        averageModifier: -14 / 3,
                        minModifier: -8,
                        maxModifier: 2,
                        usesByModifier: { "2": 1, "-8": 2 },
                        results: { miss: 2, graze: 0, hit: 1, crit: 0, none: 0 },
                    },
                    bondageRemoved: { total: 4, averagePerUse: 4 / 3 },
                    bondageBlocked: { total: 8, averagePerUse: 8 / 3 },
                },
            },
            bondageRemoved: { escapes: 10, skills: 4, rescues: 6, unattributed: 2 },
            bondageBlocked: { unattributed: 4 },
            bondageReceived: {
                moves: { latexRegeneration: 20 },
                ticks: { latexCollar: 4 },
                traps: { trapPuddle: 6 },
                unattributed: 2,
            },
            skunkExplosion: {
                intentionsQueued: 4,
                killedBeforeUse: 2,
                uses: 2,
                cancelledBeforeUse: 0,
            },
        });
        expect(structuredClone(summary)).toEqual(summary);
        expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    });

    it("aggregates exact enemy instance lifetimes and derives sorted averages", () => {
        const detailed = (
            enemyLifetimes: NonNullable<DetailedCombatMetrics["enemyLifetimes"]>,
        ): DetailedCombatMetrics => ({
            escapeSequences: { single: 0, double: 0, byActor: {} },
            skunkings: { total: 0, byCharacter: {} },
            rescues: { total: 0, byCharacter: {}, byMove: {} },
            playerMoves: {},
            bondageRemoved: { escapes: 0, skills: 0, rescues: 0, unattributed: 0 },
            bondageBlocked: { unattributed: 0 },
            bondageReceived: { moves: {}, ticks: {}, traps: {}, unattributed: 0 },
            enemyLifetimes,
            skunkExplosion: {
                intentionsQueued: 0,
                killedBeforeUse: 0,
                uses: 0,
                cancelledBeforeUse: 0,
                hpAtTrigger: {},
                unspentCharactersAtTrigger: {},
                hpAndUnspentAtTrigger: {},
            },
        });
        const summary = summarizeBatch(batch([
            run({
                runIndex: 0,
                termination: "victory",
                actionCount: 1,
                damage: 10,
                peakBondage: 0,
                remainingEnemyHp: 0,
                detailedCombat: detailed({
                    skunk1: { totalRounds: 3, observations: 1, defeated: 1, survivedToEnd: 0 },
                    queen1: { totalRounds: 6, observations: 1, defeated: 0, survivedToEnd: 1 },
                }),
            }),
            run({
                runIndex: 1,
                termination: "defeat",
                actionCount: 1,
                damage: 5,
                peakBondage: 0,
                remainingEnemyHp: 10,
                detailedCombat: detailed({
                    skunk1: { totalRounds: 5, observations: 1, defeated: 0, survivedToEnd: 1 },
                }),
            }),
        ]));

        expect(summary.enemyLifetimes).toEqual({
            queen1: {
                observations: 1,
                defeated: 0,
                survivedToEnd: 1,
                averageRoundsAlive: 6,
            },
            skunk1: {
                observations: 2,
                defeated: 1,
                survivedToEnd: 1,
                averageRoundsAlive: 4,
            },
        });
    });
});
