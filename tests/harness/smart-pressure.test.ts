import { describe, expect, it } from "vitest";
import { STANDARD_DIFFICULTY } from "../helpers/state";
import type {
    ActionView,
    Binding,
    Character,
    Effect,
    GameState,
    ValidTarget,
} from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import { createEmptyContentLibrary } from "../helpers/library";
import {
    assessSmartBoard,
    evaluatePressureSourceProgress,
    evaluateSmartDecision,
    recoveryDebt,
    type PressureSourceProgressBreakdown,
    type SmartCandidate,
} from "../../src/harness/policy/smart";

const thresholds = { thresholds: { impossible: 80 }, max: 100 } as const;

function binding(id: string, value: number, tickEffects: Effect[] = []): Binding {
    return { id, value, level: "hard", data: {}, status: [], tickEffects };
}

function character(id: string, bindings: Binding[]): Character {
    return {
        id,
        acted: false,
        standing: false,
        bonusEscapes: 0,
        bindings,
        buffs: [],
        cooldowns: {},
        modifiers: {},
        blockedMoveTypes: [],
        data: {},
    };
}

function context(characters: Character[], actions: ActionView[] = []): PolicyContext {
    const state: GameState = {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        difficulty: STANDARD_DIFFICULTY,
        characters,
        enemies: [],
        traps: [],
        encounter: null,
    };
    return {
        state,
        actions,
        thresholds,
        library: createEmptyContentLibrary(),
        random: {
            next: () => { throw new Error("pressure scoring must not consume policy random"); },
            integer: () => { throw new Error("pressure scoring must not consume policy random"); },
        },
    };
}

function candidate(
    effects: Effect[] = [],
    targetEffects: Effect[][] = [],
    hits = 1,
): SmartCandidate {
    const targets: ValidTarget[] = targetEffects.map((targetEffects) => ({
        valid: true,
        target: "hero",
        effects: targetEffects,
    }));
    return { action: { type: "endTurn" }, effects, targets, hits };
}

function sourceTick(bindingId: string, amount: number, target = "hero"): Effect {
    return { type: "binding", target, binding: bindingId, amount };
}

function evaluate(fixture: PolicyContext, value: SmartCandidate): PressureSourceProgressBreakdown {
    return evaluatePressureSourceProgress(fixture, assessSmartBoard(fixture), value);
}

describe("Smart recurring binding pressure assessment", () => {
    it("does not create a pressure source for a binding without tick effects", () => {
        const fixture = context([character("hero", [binding("ordinary", 20)])]);

        expect(assessSmartBoard(fixture).bindingPressureSources).toEqual([]);
    });

    it("creates a source and values one recurrence as added recovery debt", () => {
        const fixture = context([character("hero", [
            binding("recurring", 20, [sourceTick("recurring", 5)]),
        ])]);

        expect(assessSmartBoard(fixture).bindingPressureSources).toEqual([{
            characterId: "hero",
            bindingId: "recurring",
            sourceValue: 20,
            tickPressure: recoveryDebt(25, thresholds) - recoveryDebt(20, thresholds),
        }]);
        expect(assessSmartBoard(fixture).bindingPressureSources[0].tickPressure)
            .toBeGreaterThan(0);
    });

    it("assigns higher pressure to a more dangerous one-tick effect", () => {
        const fixture = context([character("hero", [
            binding("small", 20, [sourceTick("small", 4)]),
            binding("large", 20, [sourceTick("large", 12)]),
        ])]);
        const [small, large] = assessSmartBoard(fixture).bindingPressureSources;

        expect(large.tickPressure).toBeGreaterThan(small.tickPressure);
    });

    it("values an identical tick more on an already heavily bound track", () => {
        const fixture = context([
            character("clean", [binding("source-clean", 10, [sourceTick("track", 10, "clean")])]),
            character("heavy", [
                binding("track", 70),
                binding("source-heavy", 10, [sourceTick("track", 10, "heavy")]),
            ]),
        ]);
        const [clean, heavy] = assessSmartBoard(fixture).bindingPressureSources;

        expect(heavy.tickPressure).toBeGreaterThan(clean.tickPressure);
    });

    it("projects every harmful tick effect across multiple targets and tracks", () => {
        const fixture = context([
            character("alpha", [binding("source", 20, [
                sourceTick("arms", 5, "alpha"),
                sourceTick("legs", 7, "alpha"),
                sourceTick("rope", 9, "beta"),
            ])]),
            character("beta", []),
        ]);
        const pressure = assessSmartBoard(fixture).bindingPressureSources[0].tickPressure;
        const expected = recoveryDebt(5, thresholds)
            + recoveryDebt(7, thresholds)
            + recoveryDebt(9, thresholds);

        expect(pressure).toBeCloseTo(expected, 10);
    });

    it("ignores non-binding tick effects in the one-tick pressure estimate", () => {
        const fixture = context([character("hero", [
            binding("damage-only", 20, [
                { type: "damage", target: "hero", amount: 99 },
                { type: "binding", target: "hero", binding: "unknown-amount" },
                sourceTick("enemy-target", 99, "not-a-character"),
            ]),
        ])]);
        const board = assessSmartBoard(fixture);

        expect(board.bindingPressureSources).toEqual([{
            characterId: "hero",
            bindingId: "damage-only",
            sourceValue: 20,
            tickPressure: 0,
        }]);
        expect(evaluate(fixture, candidate([
            sourceTick("damage-only", -20),
        ])).raw).toBe(0);
    });

    it("ignores harmless negative binding tick effects without offsetting harmful pressure", () => {
        const fixture = context([character("hero", [
            binding("ordinary", 50),
            binding("source", 20, [
                sourceTick("ordinary", -50),
                sourceTick("new-harm", 10),
            ]),
        ])]);

        expect(assessSmartBoard(fixture).bindingPressureSources[0].tickPressure)
            .toBeCloseTo(recoveryDebt(10, thresholds), 10);
    });
});

describe("Smart recurring binding pressure progress", () => {
    it("credits partial removal in proportion to the current source value", () => {
        const fixture = context([character("hero", [
            binding("source", 40, [sourceTick("source", 10)]),
        ])]);
        const result = evaluate(fixture, candidate([sourceTick("source", -10)]));
        const pressure = assessSmartBoard(fixture).bindingPressureSources[0].tickPressure;

        expect(result.raw).toBeCloseTo(pressure * 0.25, 10);
        expect(result.sources[0]).toMatchObject({
            currentValue: 40,
            projectedValue: 30,
            removed: 10,
            progressFraction: 0.25,
            tickPressure: pressure,
            contribution: result.raw,
        });
    });

    it("credits full removal with the source's full one-tick pressure", () => {
        const fixture = context([character("hero", [
            binding("source", 20, [sourceTick("source", 10)]),
        ])]);
        const board = assessSmartBoard(fixture);
        const result = evaluatePressureSourceProgress(
            fixture,
            board,
            candidate([sourceTick("source", -50)]),
        );

        expect(result.sources[0]).toMatchObject({
            projectedValue: 0,
            removed: 20,
            progressFraction: 1,
        });
        expect(result.raw).toBeCloseTo(board.bindingPressureSources[0].tickPressure, 10);
    });

    it("gives no progress credit when the recurring source is unchanged", () => {
        const fixture = context([character("hero", [
            binding("source", 20, [sourceTick("source", 10)]),
        ])]);

        expect(evaluate(fixture, candidate()).raw).toBe(0);
    });

    it("gives no source-progress credit for reducing an ordinary binding", () => {
        const fixture = context([character("hero", [binding("ordinary", 20)])]);

        expect(evaluate(fixture, candidate([sourceTick("ordinary", -20)]))).toEqual({
            sources: [],
            raw: 0,
        });
    });

    it("projects once-only and per-target effects with per-hit repetition", () => {
        const fixture = context([character("hero", [
            binding("source", 40, [sourceTick("source", 10)]),
        ])]);
        const result = evaluate(fixture, candidate(
            [sourceTick("source", -4)],
            [[sourceTick("source", -3)]],
            2,
        ));

        expect(result.sources[0]).toMatchObject({
            currentValue: 40,
            projectedValue: 30,
            removed: 10,
            progressFraction: 0.25,
        });
    });

    it("sums multiple pressure-source contributions independently", () => {
        const fixture = context([character("hero", [
            binding("first", 20, [sourceTick("first", 5)]),
            binding("second", 40, [sourceTick("second", 12)]),
        ])]);
        const result = evaluate(fixture, candidate([
            sourceTick("first", -10),
            sourceTick("second", -10),
        ]));

        expect(result.sources).toHaveLength(2);
        expect(result.sources[0].progressFraction).toBe(0.5);
        expect(result.sources[1].progressFraction).toBe(0.25);
        expect(result.raw).toBeCloseTo(
            result.sources[0].contribution + result.sources[1].contribution,
            10,
        );
    });

    it("publishes the typed per-source breakdown on forensic score diagnostics", () => {
        const recurring = binding("source", 20, [sourceTick("source", 5)]);
        const actions: ActionView[] = [{
            id: "hero",
            available: true,
            moves: [],
            escapes: [{
                available: true,
                target: "hero",
                binding: "source",
                effects: [sourceTick("source", -10)],
            }],
            stance: { available: false, reason: "moveUnavailable" },
        }];
        const decision = evaluateSmartDecision(context([character("hero", [recurring])], actions));
        const escape = decision.candidates.find(({ action }) => action.type === "escape");
        const diagnostics = escape?.components.pressureSourceProgress
            .diagnostics as PressureSourceProgressBreakdown;

        expect(diagnostics).toEqual({
            sources: [{
                characterId: "hero",
                bindingId: "source",
                currentValue: 20,
                projectedValue: 10,
                removed: 10,
                progressFraction: 0.5,
                tickPressure: decision.board.bindingPressureSources[0].tickPressure,
                contribution: decision.board.bindingPressureSources[0].tickPressure * 0.5,
            }],
            raw: decision.board.bindingPressureSources[0].tickPressure * 0.5,
        });
    });
});
