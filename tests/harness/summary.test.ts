import { describe, expect, it } from "vitest";
import type {
    Character,
    GameView,
    PlayerAction,
} from "../../src/engine/public/types";
import type { BatchResult, BatchRun } from "../../src/harness/batch";
import type {
    FightReplay,
    SingleFightTermination,
} from "../../src/harness/harness";
import { summarizeBatch } from "../../src/harness/summary";

interface RunFixture {
    runIndex: number;
    termination: SingleFightTermination;
    round: number;
    trace: PlayerAction[];
    bindings: Record<string, number[]>;
}

const endTurn = (): PlayerAction => ({ type: "endTurn" });
const move = (id: string): PlayerAction => ({
    type: "move",
    actor: "ko",
    move: id,
    targets: ["enemy"],
});

function character(id: string, bindingValues: number[]): Character {
    return {
        id,
        acted: false,
        standing: true,
        bonusEscapes: 0,
        bindings: bindingValues.map((value, index) => ({
            id: `binding-${index}`,
            value,
            level: "easy",
            data: {},
            status: [],
        })),
        buffs: [],
        modifiers: {},
        blockedMoveTypes: [],
        data: {},
    };
}

function view(round: number, bindings: Record<string, number[]>): GameView {
    return {
        turn: { round, step: 1, phase: "player", outcome: "ongoing" },
        characters: Object.entries(bindings).map(([id, values]) => character(id, values)),
        enemies: [],
        traps: [],
        encounter: null,
        actions: [],
    };
}

function run(fixture: RunFixture): BatchRun {
    const finalState = view(fixture.round, fixture.bindings);
    if (fixture.termination === "victory" || fixture.termination === "defeat") {
        finalState.turn.outcome = fixture.termination;
    }

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
            finalState,
            actionCount: fixture.trace.length,
            trace: fixture.trace,
        },
    };
}

function fixtureBatch(): BatchResult {
    return {
        encounterId: "fixture",
        policyId: "fixture-policy",
        masterSeed: 99,
        runs: [
            run({
                runIndex: 5,
                termination: "victory",
                round: 2,
                trace: [
                    move("telekinesis"),
                    endTurn(),
                    { type: "stance", actor: "ko" },
                    move("whiteFlame"),
                ],
                bindings: { ko: [2, 3], matsuko: [0] },
            }),
            run({
                runIndex: 3,
                termination: "defeat",
                round: 1,
                trace: [
                    { type: "escape", actor: "ko", target: "ko", binding: "rope" },
                    endTurn(),
                ],
                bindings: { ko: [10], matsuko: [4] },
            }),
            run({
                runIndex: 8,
                termination: "error",
                round: 5,
                trace: [
                    move("telekinesis"),
                    move("telekinesis"),
                    endTurn(),
                    endTurn(),
                    endTurn(),
                    endTurn(),
                    endTurn(),
                    endTurn(),
                ],
                bindings: { ko: [1], matsuko: [3] },
            }),
            run({
                runIndex: 1,
                termination: "maxActions",
                round: 3,
                trace: [move("whiteFlame"), endTurn()],
                bindings: { ko: [7], matsuko: [8] },
            }),
        ],
    };
}

describe("batch summary", () => {
    it("preserves compact batch identity and counts every outcome", () => {
        const summary = summarizeBatch(fixtureBatch());

        expect(summary).toMatchObject({
            encounterId: "fixture",
            policyId: "fixture-policy",
            masterSeed: 99,
            runCount: 4,
        });
        expect(summary.outcomes).toEqual({
            victory: { count: 1, rate: 0.25 },
            defeat: { count: 1, rate: 0.25 },
            maxActions: { count: 1, rate: 0.25 },
            error: { count: 1, rate: 0.25 },
        });
    });

    it("summarizes action counts with midpoint median and nearest-rank p90", () => {
        expect(summarizeBatch(fixtureBatch()).fightLength.actionCount).toEqual({
            min: 2,
            mean: 4,
            median: 3,
            p90: 8,
            max: 8,
        });
    });

    it("summarizes final round numbers", () => {
        expect(summarizeBatch(fixtureBatch()).fightLength.round).toEqual({
            min: 1,
            mean: 2.75,
            median: 2.5,
            p90: 5,
            max: 5,
        });
    });

    it("aggregates action usage exclusively from traces", () => {
        expect(summarizeBatch(fixtureBatch()).actionUsage).toEqual({
            totalMoveActions: 5,
            moves: { telekinesis: 3, whiteFlame: 2 },
            escapeActions: 1,
            stanceActions: 1,
            endTurnActions: 9,
        });
    });

    it("aggregates final total binding per character", () => {
        expect(summarizeBatch(fixtureBatch()).finalParty).toEqual({
            ko: {
                observations: 4,
                averageTotalBinding: 5.75,
                maxTotalBinding: 10,
            },
            matsuko: {
                observations: 4,
                averageTotalBinding: 3.75,
                maxTotalBinding: 8,
            },
        });
    });

    it("returns every defeat, error, and max-actions reference", () => {
        const interesting = summarizeBatch(fixtureBatch()).interestingRuns;

        expect(interesting.defeats).toEqual([{
            runIndex: 3,
            engineSeed: 1003,
            policySeed: 2003,
            termination: "defeat",
            actionCount: 2,
            round: 1,
        }]);
        expect(interesting.errors.map(({ runIndex }) => runIndex)).toEqual([8]);
        expect(interesting.maxActions.map(({ runIndex }) => runIndex)).toEqual([1]);
    });

    it("returns lightweight shortest and longest references", () => {
        const interesting = summarizeBatch(fixtureBatch()).interestingRuns;

        expect(interesting.shortest).toMatchObject({ runIndex: 1, actionCount: 2 });
        expect(interesting.longest).toMatchObject({ runIndex: 8, actionCount: 8 });
        expect(interesting.shortest).not.toHaveProperty("result");
        expect(interesting.longest).not.toHaveProperty("replay");
    });

    it("chooses the lowest run index for both shortest and longest ties", () => {
        const batch = fixtureBatch();
        batch.runs = [
            run({ runIndex: 9, termination: "victory", round: 1, trace: [endTurn()], bindings: {} }),
            run({ runIndex: 2, termination: "victory", round: 1, trace: [endTurn()], bindings: {} }),
        ];

        const interesting = summarizeBatch(batch).interestingRuns;
        expect(interesting.shortest?.runIndex).toBe(2);
        expect(interesting.longest?.runIndex).toBe(2);
    });

    it("defines empty-batch rates, distributions, and references", () => {
        const batch: BatchResult = {
            encounterId: "empty",
            policyId: "none",
            masterSeed: 7,
            runs: [],
        };

        expect(summarizeBatch(batch)).toEqual({
            encounterId: "empty",
            policyId: "none",
            masterSeed: 7,
            runCount: 0,
            outcomes: {
                victory: { count: 0, rate: 0 },
                defeat: { count: 0, rate: 0 },
                maxActions: { count: 0, rate: 0 },
                error: { count: 0, rate: 0 },
            },
            fightLength: { actionCount: null, round: null },
            actionUsage: {
                totalMoveActions: 0,
                moves: {},
                escapeActions: 0,
                stanceActions: 0,
                endTurnActions: 0,
            },
            finalParty: {},
            interestingRuns: {
                defeats: [],
                errors: [],
                maxActions: [],
                shortest: null,
                longest: null,
            },
        });
    });

    it("produces the same summary with or without replay data", () => {
        const withoutReplay = fixtureBatch();
        const withReplay = structuredClone(withoutReplay);
        for (const { result } of withReplay.runs) {
            const replay: FightReplay = {
                initialState: structuredClone(result.finalState),
                steps: [],
            };
            result.replay = replay;
        }

        expect(summarizeBatch(withReplay)).toEqual(summarizeBatch(withoutReplay));
    });

    it("does not mutate its input", () => {
        const batch = fixtureBatch();
        const before = structuredClone(batch);

        summarizeBatch(batch);

        expect(batch).toEqual(before);
    });
});
