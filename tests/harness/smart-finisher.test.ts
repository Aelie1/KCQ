import { describe, expect, it } from "vitest";
import type {
    ActionInfo,
    ActionView,
    Binding,
    Character,
    Effect,
    Enemy,
    GameState,
    PreviewInfo,
} from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import { createEmptyContentLibrary } from "../helpers/library";
import {
    evaluateSmartDecision,
    type ScoredSmartCandidate,
} from "../../src/harness/policy/smart";

function enemy(id: string, currHp: number, maxHp = currHp): Enemy {
    return {
        id,
        rank: "enemy",
        maxHp,
        currHp,
        currDef: 0,
        intentions: [],
        buffs: [],
        cooldowns: {},
    };
}

function binding(id: string, value: number): Binding {
    return { id, value, level: "impossible", data: {}, status: [], tickEffects: [] };
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

function target(id: string, damage: number, effects: Effect[] = []): PreviewInfo {
    return {
        valid: true,
        target: id,
        effects,
        damage: { hit: { chance: 100, min: damage, max: damage } },
    };
}

function move(
    id: string,
    previews: PreviewInfo[],
    targetCount: number | "all" = 1,
    values: Partial<ActionInfo> = {},
): ActionInfo {
    return {
        move: { id, targetSide: "enemy", targets: targetCount, type: "arms" },
        available: true,
        targets: previews,
        effects: [],
        ...values,
    };
}

function actionView(values: Partial<Omit<ActionView, "id">> = {}): ActionView {
    return {
        id: "hero",
        available: true,
        moves: [],
        escapes: [],
        stance: { available: false, reason: "moveUnavailable" },
        ...values,
    };
}

function context(
    enemies: Enemy[],
    actions: ActionView[],
    hero = character(),
): PolicyContext {
    const state: GameState = {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        characters: [hero],
        enemies,
        traps: [],
        encounter: null,
    };
    return {
        state,
        actions,
        thresholds: { thresholds: { impossible: 80 }, max: 100 },
        library: createEmptyContentLibrary(),
        random: {
            next: () => { throw new Error("finisher scoring must not consume policy random"); },
            integer: () => { throw new Error("finisher scoring must not consume policy random"); },
        },
    };
}

function attackCandidates(fixture: PolicyContext): ScoredSmartCandidate[] {
    return evaluateSmartDecision(fixture).candidates.filter(
        (candidate) => candidate.action.type === "move",
    );
}

describe("Smart finisher pressure", () => {
    it("prefers equal damage against lower absolute remaining HP", () => {
        const fixture = context(
            [enemy("enemyA", 50), enemy("enemyB", 200)],
            [actionView({
                moves: [move("strike", [
                    target("enemyA", 25),
                    target("enemyB", 25),
                ])]
            })],
        );
        const decision = evaluateSmartDecision(fixture);
        const [againstA, againstB] = attackCandidates(fixture);

        expect(againstA.components.expectedDamage.raw).toBe(25);
        expect(againstB.components.expectedDamage.raw).toBe(25);
        expect(againstA.components.finisherPressure.raw).toBe(12.5);
        expect(againstB.components.finisherPressure.raw).toBe(3.125);
        expect(decision.selected.action).toMatchObject({ targets: ["enemyA"] });
    });

    it("characterizes the forest Fairy regression values", () => {
        const fixture = context(
            [enemy("fairy", 51), enemy("skunk", 186)],
            [actionView({
                moves: [move("strike", [
                    target("fairy", 32.5),
                    target("skunk", 32.5),
                ])]
            })],
        );
        const decision = evaluateSmartDecision(fixture);
        const [fairy, skunk] = attackCandidates(fixture);

        expect(fairy.components.expectedDamage.raw).toBe(32.5);
        expect(skunk.components.expectedDamage.raw).toBe(32.5);
        expect(fairy.components.finisherPressure.raw).toBeCloseTo(20.71, 2);
        expect(skunk.components.finisherPressure.raw).toBeCloseTo(5.68, 2);
        expect(fairy.total).toBeCloseTo(53.21, 2);
        expect(skunk.total).toBeCloseTo(38.18, 2);
        expect(decision.selected.action).toMatchObject({ targets: ["fairy"] });
    });

    it("caps finisher pressure at expected damage", () => {
        const [candidate] = attackCandidates(context(
            [enemy("target", 10)],
            [actionView({ moves: [move("strike", [target("target", 30)])] })],
        ));

        expect(candidate.components.expectedDamage.raw).toBe(30);
        expect(candidate.components.finisherPressure.raw).toBe(30);
    });

    it("approaches finishing range smoothly and caps once HP is at most damage", () => {
        const hitPoints = [100, 80, 40, 20, 10];
        const fixture = context(
            hitPoints.map((hp) => enemy(`enemy-${hp}`, hp)),
            [actionView({
                moves: [move(
                    "strike",
                    hitPoints.map((hp) => target(`enemy-${hp}`, 20)),
                )]
            })],
        );

        expect(attackCandidates(fixture).map(
            (candidate) => candidate.components.finisherPressure.raw,
        )).toEqual([4, 5, 10, 20, 20]);
    });

    it("uses absolute HP rather than percentage health", () => {
        const fixture = context(
            [enemy("enemyA", 177, 200), enemy("enemyB", 231, 300)],
            [actionView({
                moves: [move("strike", [
                    target("enemyA", 20),
                    target("enemyB", 20),
                ])]
            })],
        );
        const decision = evaluateSmartDecision(fixture);
        const [againstA, againstB] = attackCandidates(fixture);

        expect(againstA.components.finisherPressure.raw)
            .toBeGreaterThan(againstB.components.finisherPressure.raw);
        expect(decision.selected.action).toMatchObject({ targets: ["enemyA"] });
    });

    it("sums multi-target pressure independently per enemy", () => {
        const [candidate] = attackCandidates(context(
            [enemy("enemyA", 25), enemy("enemyB", 100)],
            [actionView({
                moves: [move("sweep", [
                    target("enemyA", 20),
                    target("enemyB", 20),
                ], 2)]
            })],
        ));

        expect(candidate.components.expectedDamage.raw).toBe(40);
        expect(candidate.components.finisherPressure.raw).toBe(20);
    });

    it("isolates unequal per-enemy damage across every supported preview scope", () => {
        const strike = move(
            "split",
            [target("enemyA", 5, [
                { type: "damage", target: "enemyB", amount: 3 },
            ])],
            1,
            { effects: [{ type: "damage", target: "enemyA", amount: 2 }] },
        );
        strike.move.hits = 2;
        const [candidate] = attackCandidates(context(
            [enemy("enemyA", 24), enemy("enemyB", 12)],
            [actionView({ moves: [strike] })],
        ));

        // enemyA D=2+(5*2)=12 => 6; enemyB D=3*2=6 => 3.
        expect(candidate.components.expectedDamage.raw).toBe(18);
        expect(candidate.components.finisherPressure.raw).toBe(9);
    });

    it("leaves materially stronger recovery ahead of a low-HP attack", () => {
        const fixture = context(
            [enemy("target", 10)],
            [actionView({
                moves: [move("strike", [target("target", 10)])],
                escapes: [{
                    available: true,
                    target: "hero",
                    binding: "selected",
                    effects: [
                        { type: "binding", target: "hero", binding: "selected", amount: -10 },
                        { type: "binding", target: "hero", binding: "splash", amount: 12 },
                    ],
                }],
            })],
            character([binding("selected", 80)]),
        );
        const decision = evaluateSmartDecision(fixture);
        const attack = decision.candidates.find(({ action }) => action.type === "move")!;
        const escape = decision.candidates.find(({ action }) => action.type === "escape")!;

        expect(attack.total).toBe(
            attack.components.expectedDamage.score
            + attack.components.finisherPressure.score
            + attack.components.tempoKnowledge.score,
        );
        expect(attack.components.tempoKnowledge.score).toBeGreaterThan(0);
        expect(escape.components.bindingRecovery.score).toBeCloseTo(55.81, 2);
        expect(decision.selected).toBe(escape);
    });

    it("returns zero for escapes and end turn even without a living damage target", () => {
        const fixture = context(
            [enemy("defeated", 0, 20)],
            [actionView({
                escapes: [{
                    available: true,
                    target: "hero",
                    binding: "selected",
                    effects: [{ type: "damage", target: "defeated", amount: 100 }],
                }]
            })],
        );
        const decision = evaluateSmartDecision(fixture);

        expect(decision.candidates.map(
            (candidate) => candidate.components.finisherPressure.raw,
        )).toEqual([0, 0]);
    });
});
