import { describe, expect, it } from "vitest";
import { STANDARD_DIFFICULTY } from "../helpers/state";
import type {
    ActionInfo,
    ActionView,
    Binding,
    Buff,
    Character,
    Effect,
    Enemy,
    GameState,
} from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import {
    assessSmartBoard,
    evaluateKitKnowledge,
    evaluateSmartDecision,
    generateSmartCandidates,
    POWER_OF_DENIAL_EMERGENCY_BINDING_BONUS,
    POWER_OF_DENIAL_PLAYER_RESERVE_PENALTY,
    POWER_OF_DENIAL_RAINMAKER_BONUS,
    POWER_OF_DENIAL_RESCUE_BONUS,
} from "../../src/harness/policy/smart";
import { createEmptyContentLibrary } from "../helpers/library";

const POWER_OF_DENIAL = "powerOfDenial";

function binding(id: string, value: number): Binding {
    return { id, value, level: value >= 80 ? "impossible" : "extreme", data: {}, status: [], tickEffects: [] };
}

function character(id: string, values: Partial<Character> = {}): Character {
    return {
        id,
        acted: false,
        standing: false,
        bonusEscapes: 0,
        bindings: [],
        buffs: [],
        cooldowns: {},
        modifiers: {},
        blockedMoveTypes: [],
        data: {},
        ...values,
    };
}

function enemy(id: string, values: Partial<Enemy> = {}): Enemy {
    const defId = /^(fairy|queen|rainmaker|skunk|skunkette)\d+$/.exec(id)?.[1] ?? id;
    return {
        id,
        defId,
        rank: "enemy",
        maxHp: 200,
        currHp: 200,
        currDef: 0,
        intentions: [],
        buffs: [],
        cooldowns: {},
        ...values,
    };
}

function spentDenial(): Effect {
    return {
        type: "buff",
        target: "ko",
        buff: "denied",
        operation: "add",
        moveList: { blockedMoves: [POWER_OF_DENIAL] },
    };
}

function denial(targets: Array<{ id: string; effects: Effect[] }>): ActionInfo {
    return {
        move: { id: POWER_OF_DENIAL, targetSide: "either", targets: 1, type: "mouth" },
        available: true,
        effects: [spentDenial()],
        targets: targets.map(({ id, effects }) => ({
            valid: true,
            target: id,
            effects,
        })),
    };
}

function action(info: ActionInfo): ActionView {
    return {
        id: "ko",
        available: true,
        moves: [info],
        escapes: [],
        stance: { available: false, reason: "moveUnavailable" },
    };
}

function context(
    characters: Character[],
    enemies: Enemy[],
    info: ActionInfo,
): PolicyContext {
    const state: GameState = {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        difficulty: STANDARD_DIFFICULTY,
        characters,
        enemies,
        traps: [],
        encounter: null,
    };
    return {
        state,
        actions: [action(info)],
        thresholds: {
            thresholds: { easy: 20, medium: 40, hard: 60, extreme: 70, impossible: 80 },
            max: 100,
        },
        library: createEmptyContentLibrary(),
        random: {
            next: () => { throw new Error("Power of Denial knowledge must not use RNG"); },
            integer: () => { throw new Error("Power of Denial knowledge must not use RNG"); },
        },
    };
}

function enemyDefeat(target: string): Effect {
    return { type: "enemy", target, operation: "defeat" };
}

function knowledge(fixture: PolicyContext, target: string) {
    const candidate = generateSmartCandidates(fixture).find((value) =>
        value.action.type === "move" && value.action.targets.includes(target)
    );
    if (candidate === undefined) throw new Error(`Missing Power of Denial target ${target}`);
    return evaluateKitKnowledge(fixture, assessSmartBoard(fixture), candidate);
}

function linkedBuff(id: "skunked" | "pounce", linkedEntity: string, incapacitated = false): Buff {
    return {
        id,
        linkedEntity,
        ...(incapacitated ? { statuses: [{ id: "incapacitated", value: 1 }] } : {}),
    };
}

describe("Smart Power of Denial knowledge", () => {
    it("gives extremely strong value to the reciprocal Skunked-character rescue relationship", () => {
        const captor = enemy("synthetic-captor", {
            buffs: [linkedBuff("skunked", "victim")],
        });
        const victim = character("victim", {
            bindings: [binding("latexArms", 90), binding("latexTorso", 84)],
            buffs: [linkedBuff("skunked", captor.id, true)],
        });
        const fixture = context(
            [character("ko"), victim],
            [captor],
            denial([{ id: captor.id, effects: [enemyDefeat(captor.id)] }]),
        );

        const result = knowledge(fixture, captor.id);
        expect(result.raw).toBe(POWER_OF_DENIAL_RESCUE_BONUS);
        expect(result.raw).toBeGreaterThan(1_000);
        expect(result.rules[0]).toMatchObject({
            id: "ko.power-of-denial-enemy",
            details: {
                targetEnemyId: captor.id,
                classification: "linkedSkunkedCharacterRescueSkunkette",
                linkedCharacterId: victim.id,
                linkedCharacterCurrentlySkunked: true,
                restoresCharacter: true,
                linkedCharacterBindings: [
                    { id: "latexArms", value: 90 },
                    { id: "latexTorso", value: 84 },
                ],
            },
        });
    });

    it("does not mistake an ordinary or merely Pounce-linked Skunkette for a rescue", () => {
        const victim = character("victim", { buffs: [linkedBuff("pounce", "skunkette7")] });
        const ordinary = enemy("skunkette6");
        const pouncing = enemy("skunkette7", { buffs: [linkedBuff("pounce", victim.id)] });
        const fixture = context(
            [character("ko"), victim],
            [ordinary, pouncing],
            denial([ordinary, pouncing].map(({ id }) => ({ id, effects: [enemyDefeat(id)] }))),
        );

        for (const target of [ordinary.id, pouncing.id]) {
            expect(knowledge(fixture, target)).toMatchObject({
                raw: 0,
                rules: [{
                    adjustment: 0,
                    details: {
                        classification: "ordinaryOrNonPriorityEnemy",
                        linkedCharacterCurrentlySkunked: false,
                        restoresCharacter: false,
                    },
                }],
            });
        }
    });

    it("gives Rainmaker strong value but Fairy and Skunk no offensive bonus", () => {
        const targets = [enemy("rainmaker3"), enemy("fairy2"), enemy("skunk4")];
        const fixture = context(
            [character("ko")],
            targets,
            denial(targets.map(({ id }) => ({ id, effects: [enemyDefeat(id)] }))),
        );

        expect(knowledge(fixture, "rainmaker3")).toMatchObject({
            raw: POWER_OF_DENIAL_RAINMAKER_BONUS,
            rules: [{ details: { classification: "rainmaker" } }],
        });
        for (const target of ["fairy2", "skunk4"]) {
            expect(knowledge(fixture, target)).toMatchObject({
                raw: 0,
                rules: [{ details: { classification: "ordinaryOrNonPriorityEnemy" } }],
            });
        }
    });

    it("reserves player use below 80 and rewards an actual highest latexArms at 80+", () => {
        const low = character("ally", { bindings: [binding("latexArms", 79)] });
        const lowFixture = context(
            [character("ko"), low],
            [],
            denial([{ id: low.id, effects: [{
                type: "binding", target: low.id, binding: "latexArms", amount: -79,
            }] }]),
        );
        expect(knowledge(lowFixture, low.id)).toMatchObject({
            raw: POWER_OF_DENIAL_PLAYER_RESERVE_PENALTY,
            rules: [{ details: {
                removedBindingId: "latexArms",
                removedAmount: 79,
                meetsEmergencyThreshold: false,
                priorityBinding: true,
            } }],
        });

        const emergency = character("ally", { bindings: [binding("latexArms", 80)] });
        const emergencyFixture = context(
            [character("ko"), emergency],
            [],
            denial([{ id: emergency.id, effects: [{
                type: "binding", target: emergency.id, binding: "latexArms", amount: -80,
            }] }]),
        );
        expect(knowledge(emergencyFixture, emergency.id)).toMatchObject({
            raw: POWER_OF_DENIAL_EMERGENCY_BINDING_BONUS,
            rules: [{ details: {
                removedBindingId: "latexArms",
                removedAmount: 80,
                meetsEmergencyThreshold: true,
                priorityBinding: true,
            } }],
        });
    });

    it("does not award the Arms emergency when a higher non-priority binding is actually removed", () => {
        const ally = character("ally", {
            bindings: [binding("latexArms", 85), binding("latexTorso", 90)],
        });
        const fixture = context(
            [character("ko"), ally],
            [],
            denial([{ id: ally.id, effects: [{
                type: "binding", target: ally.id, binding: "latexTorso", amount: -90,
            }] }]),
        );

        expect(knowledge(fixture, ally.id)).toMatchObject({
            raw: POWER_OF_DENIAL_PLAYER_RESERVE_PENALTY,
            rules: [{ details: {
                removedBindingId: "latexTorso",
                removedAmount: 90,
                meetsEmergencyThreshold: true,
                priorityBinding: false,
            } }],
        });
    });

    it("preserves Power of Denial instead of spending it on an ordinary lower binding", () => {
        const ally = character("ally", { bindings: [binding("latexTorso", 60)] });
        const fixture = context(
            [character("ko"), ally],
            [],
            denial([{ id: ally.id, effects: [{
                type: "binding", target: ally.id, binding: "latexTorso", amount: -60,
            }] }]),
        );

        expect(evaluateSmartDecision(fixture).selected.action).toEqual({ type: "endTurn" });
    });
});
