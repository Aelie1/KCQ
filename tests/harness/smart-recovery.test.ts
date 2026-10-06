import { describe, expect, it } from "vitest";
import type {
    ActionInfo,
    ActionView,
    Binding,
    Character,
    Effect,
    Enemy,
    GameState,
} from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import {
    assessSmartBoard,
    BINDING_RECOVERY_WEIGHT,
    evaluateBindingRecovery,
    evaluateSmartDecision,
    generateSmartCandidates,
    recoveryDebt,
} from "../../src/harness/policy/smart";
import { createEmptyContentLibrary } from "../helpers/library";
import { makePublicActionView, makePublicBinding, makePublicCharacter, makePublicEnemy, makePublicGameState } from "../helpers/publicTestData";
import { STANDARD_DIFFICULTY } from "../helpers/state";

const thresholds = { thresholds: { overwhelming: 80 }, max: 100 } as const;

function binding(id: string, value: number): Binding {
    return makePublicBinding(id, { value, level: "heavy" });
}

function enemy(incoming = 0, unknown = false): Enemy {
    const effects: Effect[] = [];
    if (incoming > 0) {
        effects.push({ type: "binding", target: "hero", binding: "selected", amount: incoming });
    }
    if (unknown) {
        effects.push({ type: "binding", target: "hero", binding: "selected" });
    }
    return makePublicEnemy("enemy", {
        intentions: effects.length === 0 ? [] : [{ move: "pressure", targets: [], effects }],
    });
}

function actionView(id: string, values: Partial<Omit<ActionView, "id">> = {}): ActionView {
    return makePublicActionView(id, {
        stance: { available: false, reason: "moveUnavailable" },
        ...values,
    });
}

function context(
    characters: Character[],
    actions: ActionView[],
    incoming = 0,
    unknown = false,
): PolicyContext {
    const state: GameState = makePublicGameState({
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        difficulty: STANDARD_DIFFICULTY,
        characters,
        enemies: [enemy(incoming, unknown)],
        traps: [],
        encounter: null,
    });
    return {
        state,
        actions,
        thresholds,
        library: createEmptyContentLibrary(),
        random: {
            next: () => { throw new Error("recovery scoring must not consume policy random"); },
            integer: () => { throw new Error("recovery scoring must not consume policy random"); },
        },
    };
}

function escapeEffects(
    selectedRemoval: number,
    spread: number,
    spreadTarget = "hero",
    selectedTarget = "hero",
): Effect[] {
    return [
        { type: "binding", target: selectedTarget, binding: "selected", amount: -selectedRemoval },
        { type: "binding", target: spreadTarget, binding: "splash", amount: spread },
    ];
}

function escapeView(effects: Effect[], target = "hero", actor = "hero"): ActionView {
    return actionView(actor, {
        escapes: [{ available: true, target, binding: "selected", effects }],
    });
}

function weightedEscapeScore(fixture: PolicyContext): number {
    const decision = evaluateSmartDecision(fixture);
    const escape = decision.candidates.find(({ action }) => action.type === "escape");
    if (!escape) throw new Error("missing synthetic escape candidate");
    return escape.components.bindingRecovery.score;
}

function recoveryCase(
    selected: number,
    remaining: number,
    spread: number,
    destination = 0,
    incoming = 0,
): PolicyContext {
    const bindings = [binding("selected", selected)];
    if (destination > 0) bindings.push(binding("splash", destination));
    return context(
        [makePublicCharacter("hero", { bindings: bindings })],
        [escapeView(escapeEffects(selected - remaining, spread))],
        incoming,
    );
}

describe("Smart 4 recovery-debt formula", () => {
    it("uses the specified convex curve and linear continuation", () => {
        expect(recoveryDebt(-5, thresholds)).toBe(0);
        expect(recoveryDebt(30, thresholds)).toBeCloseTo(36.328125, 8);
        expect(recoveryDebt(80, thresholds)).toBe(200);
        expect(recoveryDebt(90, thresholds)).toBe(255);
        expect(recoveryDebt(120, thresholds)).toBe(recoveryDebt(100, thresholds));
    });

    it.each([
        ["efficient early cleanup", 30, 0, 1, 31.31],
        ["ordinary Heavy cleanup", 30, 12, 5, 16.74],
        ["ugly Overwhelming cleanup", 80, 75, 5, 31.64],
        ["severe-to-cheap transfer", 80, 70, 12, 55.81],
        ["net-positive raw bondage at very high level", 90, 85, 8, 33.07],
    ])("characterizes %s", (_name, selected, remaining, spread, expected) => {
        expect(weightedEscapeScore(recoveryCase(selected, remaining, spread)))
            .toBeCloseTo(expected, 2);
    });

    it("scores the same splash progressively worse on more burdened destinations", () => {
        const scores = [0, 10, 20, 30, 40].map((destination) =>
            weightedEscapeScore(recoveryCase(80, 70, 12, destination))
        );
        expect(scores.every((score, index) => index === 0 || score < scores[index - 1]))
            .toBe(true);
    });

    it("increases urgency with known selected-track pressure and ignores unknown pressure", () => {
        const expected = [16.74, 24.36, 36.23, 53.85];
        const scores = [0, 10, 20, 30].map((incoming) =>
            weightedEscapeScore(recoveryCase(30, 12, 5, 0, incoming))
        );
        scores.forEach((score, index) => expect(score).toBeCloseTo(expected[index], 2));
        expect(weightedEscapeScore(context(
            [makePublicCharacter("hero", { bindings: [binding("selected", 30)] })],
            [escapeView(escapeEffects(18, 5))],
            0,
            true,
        ))).toBeCloseTo(expected[0], 2);
    });

    it("exposes the selected-track urgency breakdown", () => {
        const fixture = recoveryCase(30, 12, 5, 0, 20);
        const board = assessSmartBoard(fixture);
        const candidate = generateSmartCandidates(fixture)[0];
        const result = evaluateBindingRecovery(fixture, board, candidate);

        expect(result).toMatchObject({ selectedProjectedValue: 50 });
        expect(result.selectedDebt).toBeCloseTo(recoveryDebt(50, thresholds), 8);
        expect(result.recoveryGain).toBeGreaterThan(0);
        expect(result.raw * BINDING_RECOVERY_WEIGHT).toBeCloseTo(36.23, 2);
    });

    it("does not let harmless low cleanup dominate worthwhile offense", () => {
        const strike: ActionInfo = {
            move: { id: "strike", targetSide: "enemy", targets: 1, type: "arms" },
            available: true,
            effects: [],
            targets: [{
                valid: true,
                target: "enemy",
                effects: [],
                damage: { hit: { chance: 100, min: 10, max: 10 } },
            }],
        };
        const fixture = context(
            [makePublicCharacter("hero", { bindings: [binding("selected", 5)] })],
            [actionView("hero", {
                moves: [strike],
                escapes: [{
                    available: true,
                    target: "hero",
                    binding: "selected",
                    effects: [{
                        type: "binding", target: "hero", binding: "selected", amount: -5,
                    }],
                }],
            })],
        );

        expect(evaluateSmartDecision(fixture).selected.action).toMatchObject({ move: "strike" });
    });

    it("scores the complete preview rather than only selected-binding removal", () => {
        const fixture = context(
            [makePublicCharacter("hero", { bindings: [binding("selected", 80)] })],
            [actionView("hero", {
                escapes: [
                    {
                        available: true, target: "hero", binding: "selected",
                        effects: escapeEffects(10, 2),
                    },
                    {
                        available: true, target: "hero", binding: "selected",
                        effects: escapeEffects(10, 20),
                    },
                ]
            })],
        );
        const decision = evaluateSmartDecision(fixture);

        expect(decision.candidates[0].components.bindingRecovery.score)
            .toBeGreaterThan(decision.candidates[1].components.bindingRecovery.score);
        expect(decision.selected).toBe(decision.candidates[0]);
    });

    it("applies numeric preview effects in order with per-effect bounds", () => {
        const fixture = context(
            [makePublicCharacter("hero", { bindings: [binding("selected", 10)] })],
            [escapeView([
                { type: "binding", target: "hero", binding: "selected", amount: -20 },
                { type: "binding", target: "hero", binding: "selected", amount: 5 },
            ])],
        );
        const board = assessSmartBoard(fixture);
        const result = evaluateBindingRecovery(
            fixture,
            board,
            generateSmartCandidates(fixture)[0],
        );

        expect(result.escapedDebt).toBeCloseTo(recoveryDebt(5, thresholds), 8);
    });

    it("keeps harmful escape recovery gain negative", () => {
        expect(weightedEscapeScore(recoveryCase(10, 9, 50))).toBeLessThan(0);
    });

    it("retains a deterministic severe-cleanup characterization without project memory", () => {
        const states = [90, 85, 80, 75, 70];
        const scores = states.map((value) =>
            weightedEscapeScore(recoveryCase(value, value - 5, 5))
        );
        const expected = [38.3406, 36.0233, 31.6406, 25.8775, 21.0183];
        scores.forEach((score, index) => expect(score).toBeCloseTo(expected[index], 4));
    });
});

describe("Smart 4 assist decisions", () => {
    it("chooses an assist when its preview removes more severe recovery debt", () => {
        const self = makePublicCharacter("helper", { bindings: [binding("selected", 30)] });
        const ally = makePublicCharacter("ally", { bindings: [binding("selected", 80)] });
        const fixture = context([self, ally], [actionView("helper", {
            escapes: [
                {
                    available: true,
                    target: "helper",
                    binding: "selected",
                    effects: [
                        { type: "binding", target: "helper", binding: "selected", amount: -18 },
                        { type: "binding", target: "helper", binding: "splash", amount: 5 },
                    ],
                },
                {
                    available: true,
                    target: "ally",
                    binding: "selected",
                    effects: [
                        { type: "binding", target: "ally", binding: "selected", amount: -10 },
                        { type: "binding", target: "helper", binding: "splash", amount: 12 },
                    ],
                },
            ]
        })]);

        expect(evaluateSmartDecision(fixture).selected.action).toEqual({
            type: "escape", actor: "helper", target: "ally", binding: "selected",
        });
    });

    it("prefers self-escape when the assist preview spreads too much onto the helper", () => {
        const fixture = context(
            [
                makePublicCharacter("helper", { bindings: [binding("selected", 30)] }),
                makePublicCharacter("ally", { bindings: [binding("selected", 80)] }),
            ],
            [actionView("helper", {
                escapes: [
                    {
                        available: true,
                        target: "helper",
                        binding: "selected",
                        effects: escapeEffects(30, 1, "helper", "helper"),
                    },
                    {
                        available: true,
                        target: "ally",
                        binding: "selected",
                        effects: [
                            { type: "binding", target: "ally", binding: "selected", amount: -10 },
                            { type: "binding", target: "helper", binding: "splash", amount: 50 },
                        ],
                    },
                ]
            })],
        );

        expect(evaluateSmartDecision(fixture).selected.action).toEqual({
            type: "escape", actor: "helper", target: "helper", binding: "selected",
        });
    });
});
