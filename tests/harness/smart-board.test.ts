import { describe, expect, it } from "vitest";
import type {
    ActionView,
    Binding,
    Character,
    Enemy,
    GameState,
} from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import {
    assessSmartBoard,
    evaluateSmartDecision,
    type SmartBoardAssessment,
    type SmartScorer,
} from "../../src/harness/policy/smart";

function binding(id: string, value: number, level: Binding["level"]): Binding {
    return { id, value, level, data: {}, status: [] };
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
    return {
        id,
        rank: "enemy",
        maxHp: 10,
        currHp: 10,
        currDef: 0,
        intentions: [],
        buffs: [],
        cooldowns: {},
        ...values,
    };
}

function action(id: string, values: Partial<Omit<ActionView, "id">> = {}): ActionView {
    return {
        id,
        available: true,
        moves: [],
        escapes: [],
        stance: { available: true },
        ...values,
    };
}

function state(
    characters: Character[],
    enemies: Enemy[] = [],
): GameState {
    return {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        characters,
        enemies,
        traps: [],
        encounter: null,
    };
}

function context(gameState: GameState, actions: ActionView[]): PolicyContext {
    return {
        state: gameState,
        actions,
        random: {
            next: () => { throw new Error("board assessment must not consume policy random"); },
            integer: () => { throw new Error("board assessment must not consume policy random"); },
        },
    };
}

describe("Smart 3 board binding assessment", () => {
    it("keeps multiple bindings and characters separate while aggregating ordinal severity", () => {
        const hero = character("hero", {
            bindings: [
                binding("silk", 5, "easy"),
                binding("rope", 12, "hard"),
                binding("seal", 2, "max"),
            ],
            modifiers: { defense: 2, escape: -1, vulnerability: 3, traps: 1, hitarms: -2 },
            blockedMoveTypes: ["arms", "mouth"],
        });
        const ally = character("ally", {
            bindings: [binding("web", 7, "extreme")],
        });

        const board = assessSmartBoard(context(state([hero, ally]), [action("hero"), action("ally")]));

        expect(board.characters.map(({ id }) => id)).toEqual(["hero", "ally"]);
        expect(board.characters[0]).toMatchObject({
            totalBinding: 19,
            peakBinding: 12,
            peakBindingLevel: "max",
            bindingLevels: {
                none: 0, easy: 1, medium: 0, hard: 1,
                extreme: 0, impossible: 0, max: 1,
            },
            hardOrWorseBindings: 2,
            extremeOrWorseBindings: 1,
            impossibleOrMaxBindings: 1,
            blockedMoveTypes: ["arms", "mouth"],
            modifiers: { defense: 2, escape: -1, vulnerability: 3, traps: 1, hitarms: -2 },
        });
        expect(board.characters[1]).toMatchObject({
            totalBinding: 7,
            peakBinding: 7,
            peakBindingLevel: "extreme",
        });
        expect(board.party).toMatchObject({
            totalBinding: 26,
            peakBinding: 12,
            peakBindingLevel: "max",
            hardOrWorseBindings: 3,
            extremeOrWorseBindings: 2,
            impossibleOrMaxBindings: 1,
            totalBlockedMoveTypes: 2,
        });
    });
});

describe("Smart 3 public ActionView capability assessment", () => {
    it("distinguishes capability reasons and retains acted bonus-escape economy", () => {
        const characters = [
            character("bonus", { acted: true, bonusEscapes: 1, standing: true }),
            character("spent", { acted: true }),
            character("skipped"),
            character("incapacitated"),
            character("missing"),
        ];
        const actions: ActionView[] = [
            action("incapacitated", {
                available: false,
                reason: "actorIncapacitated",
            }),
            action("bonus", {
                moves: [
                    {
                        move: { id: "usable", targetSide: "enemy", targets: 1, type: "arms" },
                        available: true,
                        targets: [],
                        effects: [],
                    },
                    {
                        move: { id: "blocked", targetSide: "enemy", targets: 1, type: "legs" },
                        available: false,
                        reason: "bindingRestriction",
                        targets: [],
                        effects: [],
                    },
                ],
                escapes: [
                    { available: true, target: "bonus", binding: "rope", effects: [] },
                    { available: true, target: "spent", binding: "web", effects: [] },
                    {
                        available: false,
                        reason: "escapeUnavailable",
                        target: "bonus",
                        binding: "silk",
                        effects: [],
                    },
                ],
            }),
            action("spent", { available: false, reason: "actorAlreadyActed" }),
            action("skipped", { available: false, reason: "actorSkipped" }),
        ];

        const board = assessSmartBoard(context(state(characters), actions));

        expect(board.characters.map(({ id, capability }) => [id, capability])).toEqual([
            ["bonus", "available"],
            ["spent", "spent"],
            ["skipped", "skipped"],
            ["incapacitated", "incapacitated"],
            ["missing", "unavailable"],
        ]);
        expect(board.characters[0]).toMatchObject({
            acted: true,
            bonusEscapes: 1,
            capability: "available",
            availableMoves: 1,
            availableEscapes: 1,
            availableAssists: 1,
            availableEscapesAndAssists: 2,
        });
        expect(board.party).toMatchObject({
            totalCharacters: 5,
            availableActors: 1,
            spentActors: 1,
            skippedActors: 1,
            incapacitatedActors: 1,
            unavailableActors: 1,
            totalAvailableMoves: 1,
            totalAvailableEscapes: 1,
            totalAvailableAssists: 1,
            totalAvailableEscapesAndAssists: 2,
            charactersWithBonusEscapes: 1,
            standingCharacters: 1,
        });
    });

    it("uses ActionView rather than raw binding statuses for incapacitation", () => {
        const immune = character("immune", {
            bindings: [{
                ...binding("ominous", 99, "max"),
                status: [{ id: "incapacitated", value: 1 }],
            }],
        });
        const board = assessSmartBoard(context(state([immune]), [action("immune")]));
        expect(board.characters[0].capability).toBe("available");
        expect(board.party.incapacitatedActors).toBe(0);
    });
});

describe("Smart 3 intention and trap pressure", () => {
    it("counts only safely interpretable incoming player binding and positive traps", () => {
        const first = enemy("first", {
            rank: "boss",
            intentions: [{
                move: "visible-one",
                targets: [{
                    target: "hero",
                    band: "hit",
                    effects: [
                        { type: "binding", target: "hero", binding: "rope", amount: 5 },
                        { type: "binding", target: "hero", binding: "mystery" },
                        { type: "binding", target: "hero", binding: "release", amount: -3 },
                        { type: "binding", target: "first", binding: "self", amount: 100 },
                    ],
                }],
                effects: [
                    { type: "binding", target: "ally", binding: "web", amount: 3 },
                    { type: "trap", trap: "puddle", amount: 4 },
                    { type: "trap", trap: "removed", amount: -2 },
                ],
            }],
        });
        const second = enemy("second", {
            intentions: [{
                move: "visible-two",
                targets: [{ target: "ally", band: "graze", effects: [] }],
                effects: [
                    { type: "binding", target: "hero", binding: "silk", amount: 2 },
                    { type: "binding", target: "ally", binding: "unknown" },
                    { type: "trap", trap: "puddle", amount: 1 },
                    { type: "trap", trap: "snare", amount: 2 },
                ],
            }],
        });
        const gameState = state(
            [character("hero"), character("ally")],
            [first, second],
        );
        gameState.traps = [{ id: "old", amount: 2 }, { id: "old", amount: 3 }];

        const board = assessSmartBoard(context(gameState, [action("ally"), action("hero")]));

        expect(board.enemies.map(({ id }) => id)).toEqual(["first", "second"]);
        expect(board.enemies[0]).toMatchObject({
            id: "first",
            rank: "boss",
            totalKnownIncomingBinding: 8,
            unknownIncomingBindingEffects: 1,
            targetedCharacterIds: ["hero", "ally"],
            bindingTargets: [
                { characterId: "hero", known: 5, unknownEffects: 1 },
                { characterId: "ally", known: 3, unknownEffects: 0 },
            ],
            incomingTraps: [{ id: "puddle", amount: 4 }],
            totalIncomingTrapAmount: 4,
        });
        expect(board.enemies[1]).toMatchObject({
            totalKnownIncomingBinding: 2,
            unknownIncomingBindingEffects: 1,
            targetedCharacterIds: ["hero", "ally"],
            bindingTargets: [
                { characterId: "hero", known: 2, unknownEffects: 0 },
                { characterId: "ally", known: 0, unknownEffects: 1 },
            ],
            incomingTraps: [
                { id: "puddle", amount: 1 },
                { id: "snare", amount: 2 },
            ],
        });
        expect(board.characters.map(({ id, incomingBinding, threateningEnemyIds }) => ({
            id, incomingBinding, threateningEnemyIds,
        }))).toEqual([
            {
                id: "hero",
                incomingBinding: { known: 7, unknownEffects: 1 },
                threateningEnemyIds: ["first", "second"],
            },
            {
                id: "ally",
                incomingBinding: { known: 3, unknownEffects: 1 },
                threateningEnemyIds: ["first", "second"],
            },
        ]);
        expect(board.party).toMatchObject({
            totalKnownIncomingBinding: 10,
            unknownIncomingBindingEffects: 2,
            currentTraps: [{ id: "old", amount: 5 }],
            totalCurrentTrapAmount: 5,
            incomingTraps: [
                { id: "puddle", amount: 5 },
                { id: "snare", amount: 2 },
            ],
            totalIncomingTrapAmount: 7,
        });
    });
});

describe("Smart 3 scorer preparation", () => {
    it("prepares one board object and shares it with diagnostics and every scorer", () => {
        const seen: SmartBoardAssessment[] = [];
        const scorers: SmartScorer[] = ["one", "two"].map((id) => ({
            id,
            weight: 0,
            prepare: (_context, board) => {
                seen.push(board);
                return () => 0;
            },
        }));

        const decision = evaluateSmartDecision(
            context(state([character("hero")]), [action("hero")]),
            scorers,
        );

        expect(seen).toHaveLength(2);
        expect(seen[0]).toBe(decision.board);
        expect(seen[1]).toBe(decision.board);
    });
});
