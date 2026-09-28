import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import type { ContentLibrary } from "../../src/engine/public/library";
import type {
    Buff,
    Character,
    Enemy,
    GameEvent,
    GameState,
    PlayerAction,
} from "../../src/engine/public/types";
import {
    createDetailedCombatCollector,
    type MetricActionObservation,
} from "../../src/harness/metrics";

function character(id: string, values: Partial<Character> = {}): Character {
    return {
        id,
        acted: false,
        standing: true,
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

function enemy(id: string, buffs: Buff[] = [], currDef = 0): Enemy {
    return {
        id,
        rank: "enemy",
        maxHp: 100,
        currHp: 100,
        currDef,
        intentions: [],
        buffs,
        cooldowns: {},
    };
}

function view(values: Partial<GameState> = {}): GameState {
    return {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        characters: [character("hero")],
        enemies: [],
        traps: [],
        encounter: {
            id: "synthetic",
            enemies: [],
            bindings: ["rope", "latexArms", "latexHead", "latexCollar"],
            traps: ["trapPuddle"],
        },
        ...values,
    };
}

function library(): ContentLibrary {
    const result = structuredClone(createEngine(1).getLibrary());
    result.moves.syntheticMouth = {
        id: "syntheticMouth",
        targetSide: "enemy",
        targets: "all",
        type: "mouth",
        bindings: [],
        accuracy: { miss: 25, hit: 75 },
        modifiers: { hit: -2, hitmouth: -2 },
    };
    result.moves.syntheticWill = {
        id: "syntheticWill",
        targetSide: "enemy",
        targets: 1,
        type: "none",
        bindings: [],
        accuracy: { hit: 100 },
        check: "willpower",
        modifiers: { willpower: -2 },
    };
    result.moves.syntheticCleanse = {
        id: "syntheticCleanse",
        targetSide: "player",
        targets: 1,
        type: "none",
        bindings: [],
    };
    return result;
}

function observation(
    before: GameState,
    after: GameState,
    event: GameEvent,
    action: PlayerAction,
    actionIndex = 1,
): MetricActionObservation {
    return {
        actionIndex,
        action,
        before,
        result: { success: true, actions: [], frames: [{ event, state: after }] },
    };
}

function escapeEvent(actor: string, target = actor): GameEvent {
    return {
        type: "useEscape",
        actor,
        target,
        effects: [{ type: "bondageChanged", target, binding: "rope", amount: -5 }],
    };
}

describe("detailed combat metric collector", () => {
    it("counts ordinary, completed bonus, and unused bonus escape sequences", () => {
        const collector = createDetailedCombatCollector();
        const initial = view({ characters: [character("single"), character("double"), character("unused")] });
        collector.onFightStart?.({ view: initial, library: library() });

        collector.onAction?.(observation(
            initial,
            initial,
            escapeEvent("single"),
            { type: "escape", actor: "single", target: "single", binding: "rope" },
            1,
        ));

        const doublePending = view({
            characters: [character("single"), character("double", { acted: true, bonusEscapes: 1 }), character("unused")],
        });
        collector.onAction?.(observation(
            initial,
            doublePending,
            escapeEvent("double"),
            { type: "escape", actor: "double", target: "double", binding: "rope" },
            2,
        ));
        const doubleFinished = view({
            characters: [character("single"), character("double", { acted: true }), character("unused")],
        });
        collector.onAction?.(observation(
            doublePending,
            doubleFinished,
            escapeEvent("double"),
            { type: "escape", actor: "double", target: "double", binding: "rope" },
            3,
        ));

        const unusedPending = view({
            characters: [character("single"), character("double"), character("unused", { acted: true, bonusEscapes: 1 })],
        });
        collector.onAction?.(observation(
            doubleFinished,
            unusedPending,
            escapeEvent("unused"),
            { type: "escape", actor: "unused", target: "unused", binding: "rope" },
            4,
        ));
        collector.onFightEnd?.({ termination: "maxActions", view: unusedPending, actionCount: 4 });

        expect(collector.getResult().escapeSequences).toEqual({
            single: 2,
            double: 1,
            byActor: {
                single: { single: 1, double: 0 },
                double: { single: 0, double: 1 },
                unused: { single: 1, double: 0 },
            },
        });
    });

    it("tracks only linked skunked transitions and attributes linked-Skunkette rescues", () => {
        const collector = createDetailedCombatCollector();
        const healthy = view({ characters: [character("ko"), character("ordinary")] });
        collector.onFightStart?.({ view: healthy, library: library() });
        const skunked = view({
            characters: [
                character("ko", { buffs: [{ id: "skunked", linkedEntity: "skunketteKo" }] }),
                character("ordinary", {
                    bindings: [{
                        id: "rope", value: 100, level: "max", data: {}, tickEffects: [],
                        status: [{ id: "incapacitated", value: 1 }],
                    }],
                }),
            ],
            enemies: [enemy("skunketteKo", [{ id: "skunked", linkedEntity: "ko" }])],
        });
        collector.onAction?.(observation(
            healthy,
            skunked,
            { type: "useMove", actor: "foe", move: "latexSpray", targets: [], effects: [] },
            { type: "endTurn" },
        ));

        const rescued = view({ characters: [character("ko"), skunked.characters[1]], enemies: [] });
        collector.onAction?.(observation(
            skunked,
            rescued,
            {
                type: "useMove",
                actor: "ko",
                move: "powerOfDenial",
                targets: [{
                    target: "skunketteKo",
                    result: "hit",
                    effects: [
                        { type: "enemyDamaged", target: "skunketteKo", amount: 30 },
                        { type: "enemyDefeated", target: "skunketteKo" },
                        { type: "buffRemoved", target: "ko", buff: "skunked" },
                        { type: "bondageChanged", target: "ko", binding: "latexArms", amount: -20 },
                    ],
                }],
                effects: [],
            },
            { type: "move", actor: "ko", move: "powerOfDenial", targets: ["skunketteKo"] },
            2,
        ));

        collector.onAction?.(observation(
            rescued,
            rescued,
            {
                type: "useMove", actor: "ko", move: "rockfall", effects: [], targets: [{
                    target: "ordinarySkunkette", result: "hit", effects: [
                        { type: "enemyDefeated", target: "ordinarySkunkette" },
                    ],
                }],
            },
            { type: "move", actor: "ko", move: "rockfall", targets: ["ordinarySkunkette"] },
            3,
        ));

        expect(collector.getResult()).toMatchObject({
            skunkings: { total: 1, byCharacter: { ko: 1 } },
            rescues: { total: 1, byCharacter: { ko: 1 }, byMove: { powerOfDenial: 1 } },
            bondageRemoved: { rescues: 20, skills: 0 },
        });
    });

    it("attributes actual multihit damage, direct removal, result bands, and actor-side modifiers", () => {
        const collector = createDetailedCombatCollector();
        const combatLibrary = library();
        const before = view({
            characters: [character("hero", { modifiers: { hit: -2, hitmouth: -2, willpower: -3 } })],
            enemies: [enemy("target-a", [], 99), enemy("target-b", [], 99)],
        });
        collector.onFightStart?.({ view: before, library: combatLibrary });
        collector.onAction?.(observation(
            before,
            before,
            {
                type: "useMove", actor: "hero", move: "syntheticMouth", effects: [
                    { type: "bondageChanged", target: "hero", binding: "rope", amount: -6 },
                ], targets: [
                    { target: "target-a", result: "hit", effects: [{ type: "enemyDamaged", target: "target-a", amount: 7 }] },
                    { target: "target-b", result: "crit", effects: [{ type: "enemyDamaged", target: "target-b", amount: 5 }] },
                ],
            },
            { type: "move", actor: "hero", move: "syntheticMouth", targets: ["target-a", "target-b"] },
        ));
        collector.onAction?.(observation(
            before,
            before,
            {
                type: "useMove", actor: "hero", move: "syntheticMouth", effects: [],
                targets: [{ target: "target-a", result: "miss", effects: [] }],
            },
            { type: "move", actor: "hero", move: "syntheticMouth", targets: ["target-a"] },
            2,
        ));
        collector.onAction?.(observation(
            before,
            before,
            {
                type: "useMove", actor: "hero", move: "syntheticWill", effects: [],
                targets: [{ target: "target-a", result: "hit", effects: [] }],
            },
            { type: "move", actor: "hero", move: "syntheticWill", targets: ["target-a"] },
            3,
        ));

        expect(collector.getResult().playerMoves).toMatchObject({
            syntheticMouth: {
                uses: 2,
                totalDamage: 12,
                totalBondageRemoved: 6,
                accuracy: {
                    stat: "hit",
                    modifierTotal: -16,
                    modifierUses: 2,
                    minModifier: -8,
                    maxModifier: -8,
                    usesByModifier: { "-8": 2 },
                    results: { miss: 1, graze: 0, hit: 1, crit: 1, none: 0 },
                },
            },
            syntheticWill: {
                uses: 1,
                accuracy: {
                    stat: "willpower",
                    modifierTotal: -5,
                    usesByModifier: { "-5": 1 },
                },
            },
        });
    });

    it("attributes delayed Reflect, Fairy Reflect, and Brace blockage only with one public buff origin", () => {
        const collector = createDetailedCombatCollector();
        const combatLibrary = library();
        const initial = view({ characters: [character("hero")] });
        collector.onFightStart?.({ view: initial, library: combatLibrary });

        const reflected = view({ characters: [character("hero", { buffs: [{ id: "reflect", duration: 1 }] })] });
        collector.onAction?.(observation(
            initial,
            reflected,
            { type: "useMove", actor: "hero", move: "reflect", targets: [], effects: [{ type: "buffAdded", target: "hero", buff: "reflect" }] },
            { type: "move", actor: "hero", move: "reflect", targets: [] },
        ));
        collector.onAction?.(observation(
            reflected,
            initial,
            { type: "useMove", actor: "foe", move: "latexSpray", targets: [{
                target: "hero", result: "hit", effects: [
                    { type: "buffRemoved", target: "hero", buff: "reflect" },
                    { type: "enemyDamaged", target: "foe", amount: 8 },
                    { type: "bondageBlocked", target: "hero", binding: "rope", amount: 4 },
                    { type: "bondageAdded", target: "hero", binding: "rope", amount: 4 },
                ],
            }], effects: [] },
            { type: "endTurn" },
            2,
        ));

        const braced = view({ characters: [character("hero", { buffs: [{ id: "brace", duration: 1 }] })] });
        collector.onAction?.(observation(
            initial,
            braced,
            { type: "useMove", actor: "hero", move: "brace", targets: [], effects: [{ type: "buffAdded", target: "hero", buff: "brace" }] },
            { type: "move", actor: "hero", move: "brace", targets: [] },
            3,
        ));
        collector.onAction?.(observation(
            braced,
            initial,
            { type: "useMove", actor: "foe", move: "latexRain", targets: [{
                target: "hero", result: "hit", effects: [
                    { type: "buffRemoved", target: "hero", buff: "brace" },
                    { type: "bondageBlocked", target: "hero", binding: "rope", amount: 10 },
                ],
            }], effects: [] },
            { type: "endTurn" },
            4,
        ));

        const fairyReflected = view({ characters: [character("hero", { buffs: [{ id: "fairyReflect", duration: 1 }] })] });
        collector.onAction?.(observation(
            initial,
            fairyReflected,
            { type: "useMove", actor: "hero", move: "fairyReflect", targets: [], effects: [{ type: "buffAdded", target: "hero", buff: "fairyReflect" }] },
            { type: "move", actor: "hero", move: "fairyReflect", targets: [] },
            5,
        ));
        collector.onAction?.(observation(
            fairyReflected,
            initial,
            { type: "useMove", actor: "foe", move: "latexSpray", targets: [{
                target: "hero", result: "hit", effects: [
                    { type: "buffRemoved", target: "hero", buff: "fairyReflect" },
                    { type: "enemyDamaged", target: "foe", amount: 6 },
                    { type: "bondageBlocked", target: "hero", binding: "rope", amount: 6 },
                ],
            }], effects: [] },
            { type: "endTurn" },
            6,
        ));

        const ambiguous = view({
            characters: [character("hero", { buffs: [{ id: "reflect" }, { id: "brace" }] })],
        });
        collector.onAction?.(observation(
            initial,
            ambiguous,
            { type: "useMove", actor: "hero", move: "reflect", targets: [], effects: [
                { type: "buffAdded", target: "hero", buff: "reflect" },
            ] },
            { type: "move", actor: "hero", move: "reflect", targets: [] },
            7,
        ));
        collector.onAction?.(observation(
            ambiguous,
            ambiguous,
            { type: "useMove", actor: "hero", move: "brace", targets: [], effects: [
                { type: "buffAdded", target: "hero", buff: "brace" },
            ] },
            { type: "move", actor: "hero", move: "brace", targets: [] },
            8,
        ));
        collector.onAction?.(observation(
            ambiguous,
            initial,
            { type: "useMove", actor: "foe", move: "latexRain", targets: [{
                target: "hero", result: "hit", effects: [
                    { type: "buffRemoved", target: "hero", buff: "reflect" },
                    { type: "buffRemoved", target: "hero", buff: "brace" },
                    { type: "bondageBlocked", target: "hero", binding: "rope", amount: 9 },
                ],
            }], effects: [] },
            { type: "endTurn" },
            9,
        ));

        expect(collector.getResult()).toMatchObject({
            playerMoves: {
                reflect: { uses: 2, totalDamage: 8, totalBondageBlocked: 4 },
                brace: { uses: 2, totalDamage: 0, totalBondageBlocked: 10 },
                fairyReflect: { uses: 1, totalDamage: 6, totalBondageBlocked: 6 },
            },
            bondageBlocked: { unattributed: 9 },
        });
    });

    it("classifies actual bondage changes from escapes, skills, enemy moves, ticks, traps, and unknown sources", () => {
        const collector = createDetailedCombatCollector();
        const combatLibrary = library();
        const collar = {
            id: "latexCollar", value: 20, level: "easy" as const, data: {}, status: [],
            tickEffects: [{ type: "binding" as const, target: "hero", binding: "latexHead", amount: 1 }],
        };
        const initial = view({ characters: [character("hero", { bindings: [collar] })] });
        collector.onFightStart?.({ view: initial, library: combatLibrary });

        collector.onAction?.(observation(
            initial,
            initial,
            escapeEvent("hero"),
            { type: "escape", actor: "hero", target: "hero", binding: "rope" },
        ));
        collector.onAction?.(observation(
            initial,
            initial,
            { type: "useMove", actor: "hero", move: "syntheticCleanse", targets: [], effects: [
                { type: "bondageChanged", target: "hero", binding: "rope", amount: -7 },
            ] },
            { type: "move", actor: "hero", move: "syntheticCleanse", targets: [] },
            2,
        ));
        collector.onAction?.(observation(
            initial,
            initial,
            { type: "useMove", actor: "skunk", move: "latexRegeneration", targets: [{
                target: "hero", result: "crit", effects: [
                    { type: "bondageChanged", target: "hero", binding: "latexArms", amount: 38 },
                ],
            }], effects: [] },
            { type: "endTurn" },
            3,
        ));
        const enemyPhase = view({
            turn: { round: 1, step: 2, phase: "enemy", outcome: "ongoing" },
            characters: initial.characters,
        });
        collector.onAction?.(observation(
            initial,
            enemyPhase,
            { type: "changePhase", phase: "enemy", effects: [
                { type: "bondageAdded", target: "hero", binding: "latexHead", amount: 1 },
            ] },
            { type: "endTurn" },
            4,
        ));
        collector.onAction?.(observation(
            initial,
            initial,
            { type: "useMove", actor: "hero", move: "syntheticMouth", targets: [], effects: [
                { type: "trapTriggered", actor: "hero", trap: "trapPuddle", amount: 3 },
                { type: "bondageAdded", target: "hero", binding: "latexArms", amount: 6 },
            ] },
            { type: "move", actor: "hero", move: "syntheticMouth", targets: [] },
            5,
        ));
        collector.onAction?.(observation(
            initial,
            initial,
            { type: "changePhase", phase: "player", effects: [
                { type: "bondageAdded", target: "hero", binding: "latexArms", amount: 2 },
            ] },
            { type: "endTurn" },
            6,
        ));

        expect(collector.getResult()).toMatchObject({
            bondageRemoved: { escapes: 5, skills: 7, rescues: 0, unattributed: 0 },
            bondageReceived: {
                moves: { latexRegeneration: 38 },
                ticks: { latexCollar: 1 },
                traps: { trapPuddle: 6 },
                unattributed: 2,
            },
            playerMoves: { syntheticCleanse: { uses: 1, totalBondageRemoved: 7 } },
        });
        expect(structuredClone(collector.getResult())).toEqual(collector.getResult());
        expect(() => JSON.stringify(collector.getResult())).not.toThrow();
    });
});
