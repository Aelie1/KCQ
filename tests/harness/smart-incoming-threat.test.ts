import { describe, expect, it } from "vitest";
import type {
    ActionInfo,
    ActionView,
    Binding,
    Character,
    Effect,
    Enemy,
    GameState,
    Intention,
} from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import {
    assessSmartBoard,
    evaluateIncomingThreat,
    evaluateSmartDecision,
    generateSmartCandidates,
    INCOMING_THREAT_WEIGHT,
    incomingThreatScorer,
    recoveryDebt,
} from "../../src/harness/policy/smart";
import { createEmptyContentLibrary } from "../helpers/library";

function binding(id: string, value: number): Binding {
    return { id, value, level: "none", data: {}, status: [], tickEffects: [] };
}

function character(id: string, bindings: Binding[] = []): Character {
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

function intention(effects: Effect[]): Intention {
    return { move: "synthetic-threat", targets: [], effects };
}

function enemy(id: string, effects: Effect[] = [], currHp = 100): Enemy {
    return {
        id,
        rank: "enemy",
        maxHp: 100,
        currHp,
        currDef: 0,
        intentions: effects.length > 0 ? [intention(effects)] : [],
        buffs: [],
        cooldowns: {},
    };
}

function attack(
    damageByEnemy: Readonly<Record<string, number>>,
    targets: number | "all" = 1,
): ActionInfo {
    return {
        move: { id: "synthetic-attack", targetSide: "enemy", targets, type: "arms" },
        available: true,
        effects: [],
        targets: Object.entries(damageByEnemy).map(([target, damage]) => ({
            valid: true,
            target,
            effects: [],
            damage: { hit: { chance: 100, min: damage, max: damage } },
        })),
    };
}

function context(
    characters: Character[],
    enemies: Enemy[],
    damageByEnemy: Readonly<Record<string, number>>,
    targets: number | "all" = 1,
): PolicyContext {
    const state: GameState = {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        characters,
        enemies,
        traps: [],
        encounter: null,
    };
    const actions: ActionView[] = [{
        id: characters[0]?.id ?? "synthetic-hero",
        available: true,
        moves: [attack(damageByEnemy, targets)],
        escapes: [],
        stance: { available: false, reason: "moveUnavailable" },
    }];
    return {
        state,
        actions,
        thresholds: { thresholds: { impossible: 80 }, max: 100 },
        library: createEmptyContentLibrary(),
        random: {
            next: () => { throw new Error("incoming-threat scoring must not use random"); },
            integer: () => { throw new Error("incoming-threat scoring must not use random"); },
        },
    };
}

function moveCandidates(fixture: PolicyContext) {
    return generateSmartCandidates(fixture).filter(
        (candidate) => candidate.action.type === "move",
    );
}

function breakdown(fixture: PolicyContext, candidateIndex = 0) {
    return evaluateIncomingThreat(
        fixture,
        assessSmartBoard(fixture),
        moveCandidates(fixture)[candidateIndex],
    );
}

function bind(target: string, bindingId: string, amount?: number): Effect {
    return { type: "binding", target, binding: bindingId, amount };
}

describe("Smart generic incoming-threat targeting", () => {
    it("prefers an otherwise equivalent attack against the threatening enemy", () => {
        const fixture = context(
            [character("synthetic-hero")],
            [
                enemy("enemy-a", [], 20),
                enemy("enemy-b", [bind("synthetic-hero", "synthetic-rope", 20)], 20),
            ],
            { "enemy-a": 20, "enemy-b": 20 },
        );

        const decision = evaluateSmartDecision(fixture);
        const [againstA, againstB] = decision.candidates.filter(
            (candidate) => candidate.action.type === "move",
        );
        expect(againstA.components.incomingThreat.raw).toBe(0);
        expect(againstB.components.incomingThreat.raw).toBeGreaterThan(0);
        expect(againstB.components.incomingThreat.weight).toBe(INCOMING_THREAT_WEIGHT);
        expect(decision.selected.action).toMatchObject({ targets: ["enemy-b"] });
    });

    it("assigns more threat to a larger recovery-debt increase", () => {
        const fixture = context(
            [character("synthetic-hero")],
            [
                enemy("enemy-a", [bind("synthetic-hero", "synthetic-rope", 5)]),
                enemy("enemy-b", [bind("synthetic-hero", "synthetic-rope", 20)]),
            ],
            { "enemy-a": 100, "enemy-b": 100 },
        );

        expect(breakdown(fixture, 1).raw).toBeGreaterThan(breakdown(fixture, 0).raw);
    });

    it("values equal pressure more on an already severe binding track", () => {
        const fixture = context(
            [
                character("light", [binding("synthetic-rope", 0)]),
                character("severe", [binding("synthetic-rope", 60)]),
            ],
            [
                enemy("enemy-a", [bind("light", "synthetic-rope", 10)]),
                enemy("enemy-b", [bind("severe", "synthetic-rope", 10)]),
            ],
            { "enemy-a": 100, "enemy-b": 100 },
        );

        expect(breakdown(fixture, 1).raw).toBeGreaterThan(breakdown(fixture, 0).raw);
    });

    it("naturally accumulates threat across multiple characters", () => {
        const fixture = context(
            [character("hero"), character("ally")],
            [
                enemy("enemy-a", [bind("hero", "synthetic-rope", 10)]),
                enemy("enemy-b", [
                    bind("hero", "synthetic-rope", 10),
                    bind("ally", "synthetic-rope", 10),
                ]),
            ],
            { "enemy-a": 100, "enemy-b": 100 },
        );

        expect(breakdown(fixture, 1).raw).toBeCloseTo(breakdown(fixture, 0).raw * 2);
    });

    it("naturally accumulates pressure across multiple binding tracks", () => {
        const fixture = context(
            [character("synthetic-hero")],
            [
                enemy("enemy-a", [bind("synthetic-hero", "synthetic-rope", 10)]),
                enemy("enemy-b", [
                    bind("synthetic-hero", "synthetic-rope", 10),
                    bind("synthetic-hero", "synthetic-silk", 10),
                ]),
            ],
            { "enemy-a": 100, "enemy-b": 100 },
        );

        expect(breakdown(fixture, 1).raw).toBeCloseTo(breakdown(fixture, 0).raw * 2);
    });

    it("scores zero without known incoming binding pressure", () => {
        const fixture = context(
            [character("synthetic-hero")],
            [enemy("enemy-a")],
            { "enemy-a": 100 },
        );

        expect(breakdown(fixture)).toEqual({ enemies: [], raw: 0 });
    });

    it("gives nonlethal damage zero score even against a very dangerous enemy", () => {
        const fixture = context(
            [character("synthetic-hero", [binding("synthetic-rope", 70)])],
            [enemy("enemy-a", [bind("synthetic-hero", "synthetic-rope", 30)])],
            { "enemy-a": 99 },
        );

        const result = breakdown(fixture);
        expect(result.enemies[0]).toMatchObject({
            expectedDamage: 99,
            currentHp: 100,
            expectedLethal: false,
            contribution: 0,
        });
        expect(result.enemies[0].threat).toBeGreaterThan(100);
        expect(result.raw).toBe(0);
    });

    it("gives expected-lethal damage the enemy's full threat score", () => {
        const fixture = context(
            [character("synthetic-hero")],
            [enemy("enemy-a", [bind("synthetic-hero", "synthetic-rope", 20)], 40)],
            { "enemy-a": 40 },
        );

        const result = breakdown(fixture);
        expect(result.enemies[0]).toMatchObject({
            expectedDamage: 40,
            currentHp: 40,
            expectedLethal: true,
        });
        expect(result.raw).toBeCloseTo(result.enemies[0].threat);
    });

    it("gives damage just below remaining HP zero threat score", () => {
        const fixture = context(
            [character("synthetic-hero")],
            [enemy("enemy-a", [bind("synthetic-hero", "synthetic-rope", 20)])],
            { "enemy-a": 99 },
        );

        const result = breakdown(fixture);
        expect(result.enemies[0].expectedLethal).toBe(false);
        expect(result.raw).toBe(0);
    });

    it("gives damage equal to remaining HP full threat score", () => {
        const fixture = context(
            [character("synthetic-hero")],
            [enemy("enemy-a", [bind("synthetic-hero", "synthetic-rope", 20)])],
            { "enemy-a": 100 },
        );

        const result = breakdown(fixture);
        expect(result.enemies[0].expectedLethal).toBe(true);
        expect(result.raw).toBeCloseTo(result.enemies[0].threat);
    });

    it("gives damage above remaining HP full threat score", () => {
        const fixture = context(
            [character("synthetic-hero")],
            [enemy("enemy-a", [bind("synthetic-hero", "synthetic-rope", 20)])],
            { "enemy-a": 101 },
        );

        const result = breakdown(fixture);
        expect(result.enemies[0].expectedLethal).toBe(true);
        expect(result.raw).toBeCloseTo(result.enemies[0].threat);
    });

    it("does not reward removing a large fraction of enemy HP without an expected kill", () => {
        const fixture = context(
            [character("synthetic-hero")],
            [enemy("enemy-a", [bind("synthetic-hero", "synthetic-rope", 50)])],
            { "enemy-a": 90 },
        );

        const result = breakdown(fixture);
        expect(result.enemies[0]).toMatchObject({
            expectedDamage: 90,
            currentHp: 100,
            expectedLethal: false,
            contribution: 0,
        });
        expect(result.raw).toBe(0);
    });

    it("collects threat only from the threatening enemy it can expected-kill", () => {
        const fixture = context(
            [character("synthetic-hero")],
            [
                enemy("enemy-a", [bind("synthetic-hero", "synthetic-rope", 10)], 30),
                enemy("enemy-b", [bind("synthetic-hero", "synthetic-silk", 20)], 50),
            ],
            { "enemy-a": 30, "enemy-b": 49 },
            "all",
        );

        const result = breakdown(fixture);
        expect(result.enemies.map(({ expectedLethal, contribution }) => ({
            expectedLethal,
            contribution,
        }))).toEqual([
            { expectedLethal: true, contribution: result.enemies[0].threat },
            { expectedLethal: false, contribution: 0 },
        ]);
        expect(result.raw).toBeCloseTo(result.enemies[0].threat);
    });

    it("lets an AoE collect each enemy's threat only when lethal to that enemy", () => {
        const fixture = context(
            [character("synthetic-hero")],
            [
                enemy("enemy-a", [bind("synthetic-hero", "synthetic-rope", 10)], 30),
                enemy("enemy-b", [bind("synthetic-hero", "synthetic-silk", 20)], 40),
            ],
            { "enemy-a": 30, "enemy-b": 40 },
            "all",
        );

        const result = breakdown(fixture);
        expect(result.enemies.every(({ expectedLethal }) => expectedLethal)).toBe(true);
        expect(result.raw).toBeCloseTo(
            result.enemies.reduce((total, value) => total + value.threat, 0),
        );
    });

    it("keeps the existing convex recovery-debt threat calculation unchanged", () => {
        const currentValue = 60;
        const incoming = 10;
        const fixture = context(
            [character("synthetic-hero", [binding("synthetic-rope", currentValue)])],
            [enemy("enemy-a", [bind("synthetic-hero", "synthetic-rope", incoming)])],
            { "enemy-a": 100 },
        );

        const result = breakdown(fixture);
        const expectedBaseline = recoveryDebt(currentValue, fixture.thresholds);
        const expectedProjected = recoveryDebt(currentValue + incoming, fixture.thresholds);
        expect(result.enemies[0]).toMatchObject({
            baselineDebt: expectedBaseline,
            projectedDebt: expectedProjected,
            threat: expectedProjected - expectedBaseline,
        });
    });

    it("retains unknown binding effects diagnostically without numeric threat", () => {
        const fixture = context(
            [character("synthetic-hero")],
            [
                enemy("enemy-a", [
                    bind("synthetic-hero", "synthetic-rope", 10),
                    bind("synthetic-hero", "synthetic-mystery"),
                ]),
                enemy("enemy-b", [bind("synthetic-hero", "synthetic-rope", 10)]),
            ],
            { "enemy-a": 100, "enemy-b": 100 },
        );

        const withUnknown = breakdown(fixture, 0).enemies[0];
        const withoutUnknown = breakdown(fixture, 1).enemies[1];
        expect(withUnknown.unknownIncomingBindingEffects).toBe(1);
        expect(withUnknown.bindingTargets[0].bindings).toContainEqual({
            bindingId: "synthetic-mystery",
            known: 0,
            unknownEffects: 1,
        });
        expect(withUnknown.threat).toBeCloseTo(withoutUnknown.threat);
    });

    it("retains incoming traps diagnostically without numeric threat", () => {
        const fixture = context(
            [character("synthetic-hero")],
            [
                enemy("enemy-a", [
                    bind("synthetic-hero", "synthetic-rope", 10),
                    { type: "trap", trap: "synthetic-trap", amount: 7 },
                ]),
                enemy("enemy-b", [bind("synthetic-hero", "synthetic-rope", 10)]),
            ],
            { "enemy-a": 100, "enemy-b": 100 },
        );

        const withTrap = breakdown(fixture, 0).enemies[0];
        const withoutTrap = breakdown(fixture, 1).enemies[1];
        expect(withTrap.totalIncomingTrapAmount).toBe(7);
        expect(withTrap.threat).toBeCloseTo(withoutTrap.threat);
    });

    it("does not let a nonlethal threat bonus displace a useful recovery action", () => {
        const fixture = context(
            [character("synthetic-hero", [binding("synthetic-rope", 60)])],
            [enemy("enemy-a", [bind("synthetic-hero", "synthetic-rope", 40)], 2)],
            { "enemy-a": 1 },
        );
        fixture.actions[0].escapes.push({
            available: true,
            target: "synthetic-hero",
            binding: "synthetic-rope",
            effects: [bind("synthetic-hero", "synthetic-rope", -5)],
        });

        const decision = evaluateSmartDecision(fixture);
        const attackCandidate = decision.candidates.find(
            (candidate) => candidate.action.type === "move",
        );
        const escapeCandidate = decision.candidates.find(
            (candidate) => candidate.action.type === "escape",
        );
        expect(attackCandidate?.components.incomingThreat.raw).toBe(0);
        expect(escapeCandidate?.components.bindingRecovery.raw).toBeGreaterThan(0);
        expect(decision.selected.action).toMatchObject({ type: "escape" });
    });

    it("can prefer an expected-lethal attack that prevents the committed threat", () => {
        const fixture = context(
            [character("synthetic-hero", [binding("synthetic-rope", 60)])],
            [enemy("enemy-a", [bind("synthetic-hero", "synthetic-rope", 40)], 2)],
            { "enemy-a": 2 },
        );
        fixture.actions[0].escapes.push({
            available: true,
            target: "synthetic-hero",
            binding: "synthetic-rope",
            effects: [bind("synthetic-hero", "synthetic-rope", -5)],
        });

        const decision = evaluateSmartDecision(fixture);
        const attackCandidate = decision.candidates.find(
            (candidate) => candidate.action.type === "move",
        );
        expect(attackCandidate?.components.incomingThreat.raw).toBeGreaterThan(0);
        expect(decision.selected.action).toMatchObject({ type: "move" });
    });

    it("is deterministic, avoids policy RNG, and emits structured-cloneable diagnostics", () => {
        const fixture = context(
            [character("synthetic-hero")],
            [enemy("enemy-a", [bind("synthetic-hero", "synthetic-rope", 10)])],
            { "enemy-a": 30 },
        );

        const first = evaluateSmartDecision(fixture);
        const second = evaluateSmartDecision(fixture);
        expect(second).toEqual(first);
        expect(structuredClone(first.candidates[0].components.incomingThreat.diagnostics))
            .toEqual(first.candidates[0].components.incomingThreat.diagnostics);
        expect(Object.keys(first.candidates[0].components)).toEqual([
            "expectedDamage",
            "linkedThreat",
            "incomingThreat",
            "bindingRecovery",
            "bindingMoveAccess",
            "pressureSourceProgress",
            "finisherPressure",
            "futureMoveOptions",
            "reserveSpending",
        ]);

        const focused = evaluateSmartDecision(fixture, [incomingThreatScorer]);
        expect(focused.candidates[0].components.incomingThreat.score)
            .toBe(focused.candidates[0].components.incomingThreat.raw * INCOMING_THREAT_WEIGHT);
    });
});
