import { describe, expect, it } from "vitest";
import type { ContentLibrary } from "../../src/engine/public/library";
import type {
    ActionInfo,
    ActionView,
    Binding,
    Character,
    Effect,
    GameState,
    MoveType,
    StatusId,
} from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import {
    assessSmartBoard,
    BINDING_MOVE_ACCESS_WEIGHT,
    bindingMoveAccessScorer,
    evaluateBindingMoveAccess,
    evaluateSmartDecision,
    type SmartCandidate,
} from "../../src/harness/policy/smart";
import { createEmptyContentLibrary } from "../helpers/library";
import { STANDARD_DIFFICULTY } from "../helpers/state";

const restrictionId = "test-limb-restriction" as StatusId;
const thresholds = {
    thresholds: { light: 10, moderate: 20, heavy: 30, severe: 50, overwhelming: 80 },
    max: 100,
} as const;

function binding(id: string, value: number): Binding {
    return { id, value, level: value >= 30 ? "heavy" : "moderate", data: {}, status: [], tickEffects: [] };
}

function character(bindings: Binding[]): Character {
    return {
        id: "test-character",
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

function actionMove(id: string, type: MoveType): ActionInfo {
    return {
        move: { id, targetSide: "none", targets: 0, type },
        available: true,
        effects: [],
        targets: [{ valid: true, target: null, effects: [] }],
    };
}

function library(
    moves: Readonly<Record<string, MoveType>>,
    values: {
        passives?: ContentLibrary["passives"];
        characterPassives?: string[];
        bindings?: ContentLibrary["bindings"];
        statuses?: ContentLibrary["statuses"];
    } = {},
): ContentLibrary {
    const result = createEmptyContentLibrary();
    result.characters["test-character"] = {
        id: "test-character",
        moves: [],
        passives: values.characterPassives ?? [],
        empoweredMoves: [],
    };
    for (const [id, type] of Object.entries(moves)) {
        result.moves[id] = { id, type, targetSide: "none", targets: 0, bindings: [] };
    }
    Object.assign(result.passives, values.passives);
    Object.assign(result.bindings, values.bindings);
    Object.assign(result.statuses, values.statuses);
    return result;
}

function restrictionLibrary(
    moves: Readonly<Record<string, MoveType>>,
    passive?: { allowed?: MoveType[]; immune?: boolean },
): ContentLibrary {
    const passiveId = "test-passive";
    return library(moves, {
        characterPassives: passive ? [passiveId] : [],
        passives: passive
            ? {
                [passiveId]: {
                    id: passiveId,
                    status: { allowedMoveTypes: passive.allowed },
                    immunities: passive.immune ? [restrictionId] : [],
                },
            }
            : {},
        bindings: {
            "test-restraint": {
                id: "test-restraint",
                status: { heavy: [{ id: restrictionId, level: 1 }] },
            },
        },
        statuses: {
            [restrictionId]: {
                id: restrictionId,
                modifiers: [{}, { blockedMoveTypes: ["arms"] }],
            },
        } as ContentLibrary["statuses"],
    });
}

function context(
    value: number,
    moveTypes: Readonly<Record<string, MoveType>>,
    content = restrictionLibrary(moveTypes),
    extraBindings: Binding[] = [],
): PolicyContext {
    const state: GameState = {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        difficulty: STANDARD_DIFFICULTY,
        characters: [character([binding("test-restraint", value), ...extraBindings])],
        enemies: [],
        traps: [],
        encounter: null,
    };
    const actions: ActionView[] = [{
        id: "test-character",
        available: true,
        moves: Object.entries(moveTypes).map(([id, type]) => actionMove(id, type)),
        escapes: [],
        stance: { available: false, reason: "moveUnavailable" },
    }];
    return {
        state,
        actions,
        thresholds,
        library: content,
        random: {
            next: () => { throw new Error("binding access scoring must not use random"); },
            integer: () => { throw new Error("binding access scoring must not use random"); },
        },
    };
}

function candidate(amount: number, hits = 1, targetLevel = false): SmartCandidate {
    const effect: Effect = {
        type: "binding",
        target: "test-character",
        binding: "test-restraint",
        amount,
    };
    return {
        action: { type: "endTurn" },
        effects: targetLevel ? [] : [effect],
        targets: targetLevel
            ? [{ valid: true, target: "test-character", effects: [effect] }]
            : [],
        hits,
    };
}

describe("Smart binding-derived move access", () => {
    it("restores every currently present move of a type when reducing across its blocking tier", () => {
        const fixture = context(30, {
            "test-arm-one": "arms",
            "test-leg": "legs",
            "test-arm-two": "arms",
        });

        expect(evaluateBindingMoveAccess(fixture, candidate(-1))).toEqual({
            characters: [{
                characterId: "test-character",
                gainedMoveIds: ["test-arm-one", "test-arm-two"],
                lostMoveIds: [],
            }],
            gainedMoves: 2,
            lostMoves: 0,
            raw: 2,
        });
    });

    it("loses every currently present restricted-type move when increasing across the tier", () => {
        const result = evaluateBindingMoveAccess(
            context(29, {
                "test-arm-one": "arms",
                "test-leg": "legs",
                "test-arm-two": "arms",
            }),
            candidate(1),
        );

        expect(result).toMatchObject({ gainedMoves: 0, lostMoves: 2, raw: -2 });
        expect(result.characters[0]).toEqual({
            characterId: "test-character",
            gainedMoveIds: [],
            lostMoveIds: ["test-arm-one", "test-arm-two"],
        });
    });

    it("lets a passive allowance override the binding restriction", () => {
        const moves = { "test-arm": "arms" } as const;
        const fixture = context(30, moves, restrictionLibrary(moves, { allowed: ["arms"] }));

        expect(evaluateBindingMoveAccess(fixture, candidate(-1))).toMatchObject({
            gainedMoves: 0,
            lostMoves: 0,
            raw: 0,
        });
    });

    it("does not apply a binding status covered by a passive immunity", () => {
        const moves = { "test-arm": "arms" } as const;
        const fixture = context(30, moves, restrictionLibrary(moves, { immune: true }));

        expect(evaluateBindingMoveAccess(fixture, candidate(-1))).toMatchObject({
            gainedMoves: 0,
            lostMoves: 0,
            raw: 0,
        });
    });

    it("merges duplicate binding status references at their highest level", () => {
        const moves = { "test-arm": "arms" } as const;
        const content = library(moves, {
            bindings: {
                "test-restraint": {
                    id: "test-restraint",
                    status: { heavy: [{ id: restrictionId, level: 2 }] },
                },
                "test-second-restraint": {
                    id: "test-second-restraint",
                    status: { heavy: [{ id: restrictionId, level: 1 }] },
                },
            },
            statuses: {
                [restrictionId]: {
                    id: restrictionId,
                    modifiers: [{}, {}, { blockedMoveTypes: ["arms"] }],
                },
            } as ContentLibrary["statuses"],
        });
        const fixture = context(
            30,
            moves,
            content,
            [binding("test-second-restraint", 30)],
        );

        expect(evaluateBindingMoveAccess(fixture, candidate(-1))).toMatchObject({
            gainedMoves: 1,
            lostMoves: 0,
            raw: 1,
        });
    });

    it("repeats target-level binding effects per hit using the existing projection semantics", () => {
        const fixture = context(32, { "test-arm": "arms" });

        expect(evaluateBindingMoveAccess(fixture, candidate(-1, 3)).raw).toBe(0);
        expect(evaluateBindingMoveAccess(fixture, candidate(-1, 2, true)).raw).toBe(0);
        expect(evaluateBindingMoveAccess(fixture, candidate(-1, 3, true)).raw).toBe(1);
    });

    it("registers an inspectable production component at the per-option weight", () => {
        const fixture = context(30, { "test-arm": "arms" });
        fixture.actions[0].moves[0].effects = [candidate(-1).effects[0]];
        const decision = evaluateSmartDecision(fixture);
        const component = decision.candidates[0].components.bindingMoveAccess;

        expect(bindingMoveAccessScorer.weight).toBe(BINDING_MOVE_ACCESS_WEIGHT);
        expect(BINDING_MOVE_ACCESS_WEIGHT).toBe(20);
        expect(component).toMatchObject({ raw: 1, weight: 20, score: 20 });
        expect(component.diagnostics).toEqual({
            characters: [{
                characterId: "test-character",
                gainedMoveIds: ["test-arm"],
                lostMoveIds: [],
            }],
            gainedMoves: 1,
            lostMoves: 0,
            raw: 1,
        });
        expect(structuredClone(component.diagnostics)).toEqual(component.diagnostics);
        expect(bindingMoveAccessScorer.prepare(fixture, assessSmartBoard(fixture))(candidate(-1)))
            .toBe(1);
    });
});
