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
    assessSustainedEnemyPressure,
    evaluateIncomingThreat,
    evaluateSmartDecision,
    evaluateSustainedPressureProgress,
    generateSmartCandidates,
    rainmakerBandProbabilities,
    SUSTAINED_PRESSURE_PROGRESS_WEIGHT,
    sustainedPressureProgressScorer,
} from "../../src/harness/policy/smart";
import { createEmptyContentLibrary } from "../helpers/library";

const LATEX_TRACKS = ["latexHead", "latexArms", "latexTorso", "latexLegs"];

function binding(id: string, value: number): Binding {
    return { id, value, level: "none", data: {}, status: [], tickEffects: [] };
}

function character(
    id: string,
    bindingValue = 0,
    defense = 0,
): Character {
    return {
        id,
        acted: false,
        standing: false,
        bonusEscapes: 0,
        bindings: LATEX_TRACKS.map((track) => binding(track, bindingValue)),
        buffs: [],
        cooldowns: {},
        modifiers: defense === 0 ? {} : { defense },
        blockedMoveTypes: [],
        data: {},
    };
}

function enemy(
    id: string,
    currHp = 100,
    committedEffects: Effect[] = [],
): Enemy {
    return {
        id,
        rank: "minion",
        maxHp: 200,
        currHp,
        currDef: 0,
        intentions: committedEffects.length === 0 ? [] : [{
            move: "synthetic-intention",
            targets: [],
            effects: committedEffects,
        }],
        buffs: [],
        cooldowns: {},
    };
}

function attack(damageByEnemy: Readonly<Record<string, number>>): ActionInfo {
    return {
        move: {
            id: "synthetic-attack",
            targetSide: "enemy",
            targets: 1,
            type: "arms",
        },
        available: true,
        effects: [],
        targets: Object.entries(damageByEnemy).map(([target, damage]) => ({
            valid: true,
            target,
            effects: [],
            ...(damage > 0 ? {
                damage: { hit: { chance: 100, min: damage, max: damage } },
            } : {}),
        })),
    };
}

function context(
    characters: Character[],
    enemies: Enemy[] = [enemy("rainmaker")],
    damageByEnemy: Readonly<Record<string, number>> = { rainmaker: 20 },
): PolicyContext {
    const state: GameState = {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        characters,
        enemies,
        traps: [],
        encounter: null,
    };
    const actions: ActionView[] = [{
        id: characters[0]?.id ?? "hero",
        available: true,
        moves: [attack(damageByEnemy)],
        escapes: [],
        stance: { available: false, reason: "moveUnavailable" },
    }];
    return {
        state,
        actions,
        thresholds: { thresholds: { impossible: 80 }, max: 100 },
        library: createEmptyContentLibrary(),
        random: {
            next: () => { throw new Error("sustained-pressure scoring must not use RNG"); },
            integer: () => { throw new Error("sustained-pressure scoring must not use RNG"); },
        },
    };
}

function moveCandidates(fixture: PolicyContext) {
    return generateSmartCandidates(fixture).filter(
        (candidate) => candidate.action.type === "move",
    );
}

describe("Smart sustained enemy pressure", () => {
    it("forecasts positive Rainmaker pressure on a normal party board", () => {
        const pressure = assessSustainedEnemyPressure(context([
            character("hero"),
            character("ally"),
        ]));

        expect(pressure).toHaveLength(1);
        expect(pressure[0].enemyId).toBe("rainmaker");
        expect(pressure[0].pressurePerTurn).toBeGreaterThan(0);
        expect(pressure[0].characters.every(
            (entry) => entry.pressurePerTurn > 0,
        )).toBe(true);
        expect(pressure[0].quietTurnProbability).toBeCloseTo(0.25);
    });

    it("increases contextually when the same Rain lands on severe bindings", () => {
        const normal = assessSustainedEnemyPressure(
            context([character("hero", 0)]),
        )[0];
        const severe = assessSustainedEnemyPressure(
            context([character("hero", 70)]),
        )[0];

        expect(severe.pressurePerTurn).toBeGreaterThan(normal.pressurePerTurn);
    });

    it("uses public Defense to reshape Rainmaker accuracy", () => {
        expect(rainmakerBandProbabilities(0)).toEqual({
            miss: 50,
            graze: 30,
            hit: 15,
            crit: 5,
        });
        const exposed = rainmakerBandProbabilities(-2);
        expect(exposed.miss).toBe(40);
        expect(exposed.hit).toBe(35);

        const normalPressure = assessSustainedEnemyPressure(
            context([character("hero")]),
        )[0].pressurePerTurn;
        const exposedPressure = assessSustainedEnemyPressure(
            context([character("hero", 0, -2)]),
        )[0].pressurePerTurn;
        expect(exposedPressure).toBeGreaterThan(normalPressure);
    });

    it("credits partial damage against Rainmaker", () => {
        const fixture = context([character("hero")]);
        const result = evaluateSustainedPressureProgress(
            fixture,
            moveCandidates(fixture)[0],
        );

        expect(result.enemies[0]).toMatchObject({
            enemyId: "rainmaker",
            expectedDamage: 20,
            currentHp: 100,
            progressFraction: 0.2,
        });
        expect(result.enemies[0].contribution).toBeCloseTo(
            result.enemies[0].pressurePerTurn * 0.2,
        );
        expect(result.raw).toBeGreaterThan(0);
    });

    it("favors Rainmaker over an otherwise equivalent unmodeled enemy", () => {
        const fixture = context(
            [character("hero")],
            [enemy("ordinary"), enemy("rainmaker")],
            { ordinary: 20, rainmaker: 20 },
        );
        const decision = evaluateSmartDecision(
            fixture,
            [sustainedPressureProgressScorer],
        );
        const [ordinary, rainmaker] = decision.candidates.filter(
            (candidate) => candidate.action.type === "move",
        );

        expect(ordinary.components.sustainedPressureProgress.raw).toBe(0);
        expect(rainmaker.components.sustainedPressureProgress.raw).toBeGreaterThan(0);
        expect(rainmaker.components.sustainedPressureProgress.weight)
            .toBe(SUSTAINED_PRESSURE_PROGRESS_WEIGHT);
        expect(decision.selected.action).toMatchObject({ targets: ["rainmaker"] });
    });

    it("caps lethal progress at one full turn of pressure", () => {
        const fixture = context(
            [character("hero")],
            [enemy("rainmaker", 30)],
            { rainmaker: 100 },
        );
        const result = evaluateSustainedPressureProgress(
            fixture,
            moveCandidates(fixture)[0],
        );

        expect(result.enemies[0].progressFraction).toBe(1);
        expect(result.enemies[0].contribution)
            .toBeCloseTo(result.enemies[0].pressurePerTurn);
    });

    it("does not alter incomingThreat's lethal-only behavior", () => {
        const fixture = context(
            [character("hero", 60)],
            [enemy("rainmaker", 100, [{
                type: "binding",
                target: "hero",
                binding: "latexHead",
                amount: 20,
            }])],
            { rainmaker: 99 },
        );
        const candidate = moveCandidates(fixture)[0];
        const incoming = evaluateIncomingThreat(
            fixture,
            assessSmartBoard(fixture),
            candidate,
        );
        const sustained = evaluateSustainedPressureProgress(fixture, candidate);

        expect(incoming.enemies[0].expectedLethal).toBe(false);
        expect(incoming.raw).toBe(0);
        expect(sustained.raw).toBeGreaterThan(0);
    });

    it("awards no bonus to a non-damaging move targeting Rainmaker", () => {
        const fixture = context(
            [character("hero")],
            [enemy("rainmaker")],
            { rainmaker: 0 },
        );
        const result = evaluateSustainedPressureProgress(
            fixture,
            moveCandidates(fixture)[0],
        );

        expect(result.enemies[0]).toMatchObject({
            expectedDamage: 0,
            progressFraction: 0,
            contribution: 0,
        });
        expect(result.raw).toBe(0);
    });

    it("emits deterministic structured-cloneable scorer diagnostics", () => {
        const fixture = context([character("hero")]);
        const first = evaluateSmartDecision(
            fixture,
            [sustainedPressureProgressScorer],
        );
        const second = evaluateSmartDecision(
            fixture,
            [sustainedPressureProgressScorer],
        );

        expect(second).toEqual(first);
        const diagnostics = first.candidates[0]
            .components.sustainedPressureProgress.diagnostics;
        expect(structuredClone(diagnostics)).toEqual(diagnostics);
    });
});
