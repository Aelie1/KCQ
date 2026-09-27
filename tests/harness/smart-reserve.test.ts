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
    evaluateReserveSpending,
    evaluateSmartDecision,
    expectedDamageScorer,
    finisherPressureScorer,
    generateSmartCandidates,
    type SmartCandidate,
} from "../../src/harness/policy/smart";

function binding(value: number): Binding {
    return { id: "rope", value, level: "hard", data: {}, status: [], tickEffects: [] };
}

function character(bindings: Binding[] = []): Character {
    return {
        id: "hero",
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

function enemy(id: string, currHp = 100): Enemy {
    return {
        id,
        rank: "enemy",
        maxHp: 100,
        currHp,
        currDef: 0,
        intentions: [],
        buffs: [],
        cooldowns: {},
    };
}

function move(id: string, effects: Effect[] = []): ActionInfo {
    return {
        move: { id, targetSide: "enemy", targets: 0, type: "arms" },
        available: true,
        effects,
        targets: [{ valid: true, target: null, effects: [] }],
    };
}

function view(moves: ActionInfo[]): ActionView {
    return {
        id: "hero",
        available: true,
        moves,
        escapes: [],
        stance: { available: false, reason: "moveUnavailable" },
    };
}

function context(
    spenderEffects: Effect[],
    enemies: Enemy[] = [enemy("enemy-1")],
    bindings: Binding[] = [],
): PolicyContext {
    const state: GameState = {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        characters: [character(bindings)],
        enemies,
        traps: [],
        encounter: null,
    };
    return {
        state,
        actions: [view([
            move("spender", spenderEffects),
            move("future-option"),
        ])],
        thresholds: { thresholds: { impossible: 80 }, max: 100 },
        random: {
            next: () => { throw new Error("Reserve scoring must not use random"); },
            integer: () => { throw new Error("Reserve scoring must not use random"); },
        },
    };
}

function blockFutureOption(): Effect {
    return {
        type: "buff",
        target: "hero",
        buff: "synthetic-spent-reserve",
        operation: "add",
        moveList: { blockedMoves: ["future-option"] },
    };
}

function damage(target: string, amount: number): Effect {
    return { type: "damage", target, amount };
}

function spender(fixture: PolicyContext): SmartCandidate {
    return generateSmartCandidates(fixture)[0];
}

describe("Smart reserve spending", () => {
    it("leaves candidates that lose no future options completely unaffected", () => {
        const fixture = context([damage("enemy-1", 50)]);
        const candidate = spender(fixture);
        const breakdown = evaluateReserveSpending(fixture, candidate);
        const normalOffense = evaluateSmartDecision(
            fixture,
            [expectedDamageScorer, finisherPressureScorer],
        ).candidates[0].total;
        const production = evaluateSmartDecision(fixture).candidates[0];

        expect(breakdown).toEqual({
            lostOptions: 0,
            offensiveValue: 0,
            expectedKills: 0,
            offensiveJustification: 0,
            raw: 0,
        });
        expect(production.components.reserveSpending.score).toBe(0);
        expect(production.total).toBe(normalOffense);
    });

    it("cancels expected damage and finisher pressure for nonlethal reserve spending", () => {
        const fixture = context([blockFutureOption(), damage("enemy-1", 50)]);
        const breakdown = evaluateReserveSpending(fixture, spender(fixture));
        const scored = evaluateSmartDecision(fixture).candidates[0];

        expect(breakdown).toEqual({
            lostOptions: 1,
            offensiveValue: 75,
            expectedKills: 0,
            offensiveJustification: 0,
            raw: -75,
        });
        expect(scored.components.reserveSpending.score).toBe(
            -(scored.components.expectedDamage.score
                + scored.components.finisherPressure.score),
        );
    });

    it("preserves half of offensive value when exactly one enemy is killed", () => {
        const fixture = context([blockFutureOption(), damage("enemy-1", 100)]);
        const breakdown = evaluateReserveSpending(fixture, spender(fixture));

        expect(breakdown).toEqual({
            lostOptions: 1,
            offensiveValue: 200,
            expectedKills: 1,
            offensiveJustification: 0.5,
            raw: -100,
        });
        expect(breakdown.offensiveValue + breakdown.raw).toBe(100);
    });

    it("preserves all offensive value when two or more enemies are killed", () => {
        const fixture = context([
            blockFutureOption(),
            damage("enemy-1", 100),
            damage("enemy-2", 100),
        ], [enemy("enemy-1"), enemy("enemy-2")]);
        const breakdown = evaluateReserveSpending(fixture, spender(fixture));

        expect(breakdown).toEqual({
            lostOptions: 1,
            offensiveValue: 400,
            expectedKills: 2,
            offensiveJustification: 1,
            raw: 0,
        });
    });

    it("does not suppress binding recovery when nonlethal offense is cancelled", () => {
        const fixture = context([
            blockFutureOption(),
            damage("enemy-1", 50),
            { type: "binding", target: "hero", binding: "rope", amount: -80 },
        ], [enemy("enemy-1")], [binding(80)]);
        const scored = evaluateSmartDecision(fixture).candidates[0];

        expect(scored.components.reserveSpending.score).toBe(
            -(scored.components.expectedDamage.score
                + scored.components.finisherPressure.score),
        );
        expect(scored.components.bindingRecovery.score).toBeGreaterThan(0);
        expect(scored.total).toBe(
            scored.components.bindingRecovery.score
            + scored.components.futureMoveOptions.score,
        );
        expect(scored.total).toBeGreaterThan(0);
    });

    it("adds no penalty to a denial-like non-offensive reserve spender", () => {
        const fixture = context([
            blockFutureOption(),
            { type: "binding", target: "hero", binding: "rope", amount: -80 },
        ], [enemy("enemy-1")], [binding(80)]);
        const scored = evaluateSmartDecision(fixture).candidates[0];

        expect(evaluateReserveSpending(fixture, spender(fixture))).toEqual({
            lostOptions: 1,
            offensiveValue: 0,
            expectedKills: 0,
            offensiveJustification: 0,
            raw: 0,
        });
        expect(scored.components.reserveSpending.score).toBe(0);
        expect(scored.components.bindingRecovery.score).toBeGreaterThan(0);
        expect(scored.components.futureMoveOptions.score).toBe(-20);
        expect(scored.total).toBe(
            scored.components.bindingRecovery.score
            + scored.components.futureMoveOptions.score,
        );
    });
});
