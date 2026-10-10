import { describe, expect, it } from "vitest";
import type { ContentLibrary } from "../../src/engine/public/library";
import type {
    ActionInfo,
    ActionView,
    Binding,
    Enemy,
    GameState,
    Intention
} from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import {
    evaluateSmartDecision,
    stanceTrapScorer,
    STANDING_DEFENSE_PRESSURE_FRACTION,
    type ScoredSmartCandidate,
    type StanceTrapBreakdown,
} from "../../src/harness/policy/smart";
import { createEmptyContentLibrary } from "../helpers/library";
import { makePublicBinding, makePublicCharacter, makePublicEnemy, makePublicGameState } from "../helpers/publicTestData";
import { STANDARD_DIFFICULTY } from "../helpers/state";

const thresholds = {
    thresholds: { light: 10, moderate: 20, heavy: 30, severe: 50, overwhelming: 80 },
    max: 100,
} as const;

function binding(id: string, value: number): Binding {
    return makePublicBinding(id, { value, level: value >= 80 ? "overwhelming" : "heavy" });
}

function attack(damage = 5): ActionInfo {
    return {
        move: { id: "test-attack", targetSide: "enemy", targets: 1, type: "arms" },
        available: true,
        effects: [],
        targets: [{
            valid: true,
            target: "test-enemy",
            effects: [],
            damage: { hit: { chance: 100, min: damage, max: damage } },
        }],
    };
}

function enemy(intentions: Intention[] = [], id = "test-enemy"): Enemy {
    return makePublicEnemy(id, { intentions });
}

function targetedBindingIntention(amount: number, bindingId: string): Intention {
    return {
        resolved: false,
        move: `test-intention-${bindingId}`,
        targets: [{
            target: "test-hero",
            band: "hit",
            effects: [{ type: "binding", target: "test-hero", binding: bindingId, amount }],
        }],
        effects: [],
    };
}

function library(values: Binding[], vibrating = false): ContentLibrary {
    const result = createEmptyContentLibrary();
    result.characters["test-hero"] = {
        id: "test-hero", moves: ["test-attack"], passives: [], empoweredMoves: [],
    };
    result.moves["test-attack"] = {
        id: "test-attack", targetSide: "enemy", targets: 1, type: "arms", bindings: [],
    };
    for (const value of values) result.bindings[value.id] = { id: value.id };
    if (vibrating) {
        result.statuses.vibrating = {
            id: "vibrating",
            modifiers: [{}, { flags: ["blocksBonusEscape"] }],
        };
    }
    return result;
}

function context(options: {
    bindings?: Binding[];
    traps?: GameState["traps"];
    intentions?: Intention[];
    escapes?: ActionView["escapes"];
    moves?: ActionInfo[];
    vibrating?: boolean;
} = {}): PolicyContext {
    const bindings = options.bindings ?? [];
    const hero = makePublicCharacter("test-hero", {
        bindings: bindings, buffs: options.vibrating
            ? [{ id: "test-vibration", statuses: [{ id: "vibrating", value: 1 }] }]
            : []
    });
    const state: GameState = makePublicGameState({
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        difficulty: STANDARD_DIFFICULTY,
        characters: [hero],
        enemies: [enemy(options.intentions)],
        traps: options.traps ?? [],
        encounter: null,
    });
    return {
        state,
        actions: [{
            id: hero.id,
            available: true,
            moves: options.moves ?? [attack()],
            escapes: options.escapes ?? [],
            attack: { available: true },
            escape: { available: true },
            bonus: { available: true },
            stance: { available: true },
        }],
        thresholds,
        library: library(bindings, options.vibrating),
        random: {
            next: () => { throw new Error("stance scoring must not use random"); },
            integer: () => { throw new Error("stance scoring must not use random"); },
        },
    };
}

function escape(target: string, bindingId: string, amount: number): ActionView["escapes"][number] {
    return {
        available: true,
        target,
        binding: bindingId,
        effects: [{ type: "binding", target, binding: bindingId, amount }],
    };
}

function stanceCandidate(fixture: PolicyContext): ScoredSmartCandidate {
    const value = evaluateSmartDecision(fixture).candidates.find(
        (candidate) => candidate.action.type === "stance",
    );
    if (value === undefined) throw new Error("Expected a legal stance candidate");
    return value;
}

function diagnostics(fixture: PolicyContext): StanceTrapBreakdown {
    return stanceCandidate(fixture).components.stanceTrap.diagnostics as StanceTrapBreakdown;
}

describe("Smart stance and movement-trap reasoning", () => {
    it("keeps a clean character moving through a meaningful trap when offense is useful", () => {
        const fixture = context({ traps: [{ id: "test-trap", amount: 100 }] });
        const decision = evaluateSmartDecision(fixture);

        expect(diagnostics(fixture).estimatedMovementTrapPressure).toBe(0);
        expect(stanceCandidate(fixture).components.stanceTrap.raw).toBe(0);
        expect(decision.selected.action).toMatchObject({ type: "move" });
    });

    it("strongly prefers Standing for a heavily bound actor facing a meaningful trap", () => {
        const fixture = context({
            bindings: [binding("test-rope-a", 80), binding("test-rope-b", 80)],
            traps: [{ id: "test-trap", amount: 100 }],
        });
        const decision = evaluateSmartDecision(fixture);
        const detail = diagnostics(fixture);

        expect(detail.currentRecoveryDebt).toBe(400);
        expect(detail.dangerRatio).toBe(2);
        expect(detail.estimatedMovementTrapPressure).toBe(40);
        expect(decision.selected.action).toEqual({ type: "stance", actor: "test-hero" });
    });

    it("does not invent a Standing bonus for a heavily bound actor without a trap", () => {
        const fixture = context({ bindings: [binding("test-rope", 80)] });
        const detail = diagnostics(fixture);

        expect(detail.estimatedMovementTrapPressure).toBe(0);
        expect(detail.stanceAdjustment).toBe(0);
        expect(evaluateSmartDecision(fixture).selected.action).toMatchObject({ type: "move" });
    });

    it("uses End Turn instead of repeatedly toggling a zero-value stance", () => {
        const fixture = context({ moves: [] });

        expect(diagnostics(fixture).stanceAdjustment).toBe(0);
        expect(evaluateSmartDecision(fixture).selected.action).toEqual({ type: "endTurn" });
    });

    it("charges approximately zero defense cost when no intention targets the actor", () => {
        const fixture = context({
            intentions: [{
                resolved: false,
                move: "test-other-target",
                targets: [{ target: "someone-else", band: "hit", effects: [] }],
                effects: [],
            }],
        });

        expect(diagnostics(fixture).targetingIntentions).toEqual([]);
        expect(diagnostics(fixture).estimatedStandingDefensePressure).toBe(0);
    });

    it("charges Standing for meaningful currently targeted incoming pressure", () => {
        const fixture = context({
            intentions: [targetedBindingIntention(80, "test-incoming")],
        });
        const detail = diagnostics(fixture);

        expect(detail.targetingIntentions).toHaveLength(1);
        expect(detail.targetingIntentions[0].visiblePressure).toBe(200);
        expect(detail.estimatedStandingDefensePressure).toBe(
            200 * STANDING_DEFENSE_PRESSURE_FRACTION,
        );
        expect(detail.stanceAdjustment).toBe(-40);
    });
});

describe("Smart deliberate Standing double-escape planning", () => {
    const twoBindings = [binding("test-rope-a", 80), binding("test-rope-b", 80)];
    const twoEscapes = [
        escape("test-hero", "test-rope-a", -20),
        escape("test-hero", "test-rope-b", -20),
    ];

    it("favors Standing for two worthwhile escapes with no incoming targeting", () => {
        const fixture = context({ bindings: twoBindings, escapes: twoEscapes, moves: [] });
        const detail = diagnostics(fixture);

        expect(detail.firstEscape?.bindingId).toBe("test-rope-a");
        expect(detail.secondEscape?.bindingId).toBe("test-rope-b");
        expect(detail.bonusEscapeEligibleAfterFirst).toBe(true);
        expect(detail.plannedEscapeValue).toBeGreaterThan(detail.firstEscape!.weightedValue);
        expect(evaluateSmartDecision(fixture).selected.action)
            .toEqual({ type: "stance", actor: "test-hero" });
    });

    it("does not add a second-escape bonus when only one worthwhile escape exists", () => {
        const fixture = context({
            bindings: [binding("test-rope", 10)],
            escapes: [escape("test-hero", "test-rope", -10)],
            moves: [],
        });
        const detail = diagnostics(fixture);

        expect(detail.firstEscape).toBeDefined();
        expect(detail.secondEscape).toBeUndefined();
        expect(detail.bonusEscapeValue).toBe(0);
        expect(evaluateSmartDecision(fixture).selected.action).toMatchObject({ type: "escape" });
    });

    it("does not value a double escape while Vibrating blocks bonus escape", () => {
        const fixture = context({
            bindings: twoBindings,
            escapes: twoEscapes,
            moves: [],
            vibrating: true,
        });
        const detail = diagnostics(fixture);

        expect(detail.bonusEscapeEligibleAfterFirst).toBe(false);
        expect(detail.bonusEscapeBlockedBy).toContain("blocksBonusEscape");
        expect(detail.secondEscape).toBeUndefined();
        expect(evaluateSmartDecision(fixture).selected.action).toMatchObject({ type: "escape" });
    });

    it("projects a first escape that newly removes bonus-escape eligibility", () => {
        const fixture = context({ bindings: twoBindings, escapes: twoEscapes, moves: [] });
        fixture.library.statuses.vibrating = {
            id: "vibrating",
            modifiers: [{}, { flags: ["blocksBonusEscape"] }],
        };
        fixture.library.bindings["test-rope-a"].status = {
            severe: [{ id: "vibrating", level: 1 }],
        };
        const detail = diagnostics(fixture);

        expect(detail.firstEscape?.bindingId).toBe("test-rope-a");
        expect(detail.bonusEscapeBlockedBy).toContain("blocksBonusEscape");
        expect(detail.secondEscape).toBeUndefined();
        expect(evaluateSmartDecision(fixture).selected.action).toMatchObject({ type: "escape" });
    });

    it("lets dangerous targeted pressure make Standing not worth a second escape", () => {
        const intentions = Array.from({ length: 6 }, (_, index) =>
            targetedBindingIntention(100, `test-incoming-${index}`)
        );
        const fixture = context({ bindings: twoBindings, escapes: twoEscapes, intentions, moves: [] });
        const detail = diagnostics(fixture);

        expect(detail.bonusEscapeValue).toBeGreaterThan(0);
        expect(detail.estimatedStandingDefensePressure).toBeGreaterThan(detail.plannedEscapeValue);
        expect(evaluateSmartDecision(fixture).selected.action).toMatchObject({ type: "escape" });
    });

    it("lets a sufficiently valuable second escape outweigh Standing pressure", () => {
        const fixture = context({
            bindings: twoBindings,
            escapes: twoEscapes,
            intentions: [targetedBindingIntention(80, "test-incoming")],
            moves: [],
        });
        const detail = diagnostics(fixture);

        expect(detail.bonusEscapeValue).toBeGreaterThan(detail.estimatedStandingDefensePressure);
        expect(evaluateSmartDecision(fixture).selected.action)
            .toEqual({ type: "stance", actor: "test-hero" });
    });

    it("is deterministic and emits structured-cloneable stance diagnostics", () => {
        const fixture = context({ bindings: twoBindings, escapes: twoEscapes, moves: [] });
        const first = evaluateSmartDecision(fixture);
        const second = evaluateSmartDecision(fixture);

        expect(second).toEqual(first);
        expect(structuredClone(stanceCandidate(fixture).components.stanceTrap.diagnostics))
            .toEqual(stanceCandidate(fixture).components.stanceTrap.diagnostics);
        expect(stanceCandidate(fixture).components.stanceTrap.weight)
            .toBe(stanceTrapScorer.weight);
    });
});
