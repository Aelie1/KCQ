import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import type { ContentLibrary } from "../../src/engine/public/library";
import type {
    Buff,
    Character,
    Enemy,
    Effect,
    GameEvent,
    GameState,
    Intention,
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

function intention(
    move: string,
    targetEffects: Effect[] = [],
    effects: Effect[] = [],
    band: Intention["targets"][number]["band"] = "hit",
): Intention {
    return { move, targets: [{ target: "hero", band, effects: targetEffects }], effects };
}

function enemyWithIntentions(
    id: string,
    intentions: Intention[],
    rank: Enemy["rank"] = "enemy",
): Enemy {
    return { ...enemy(id), rank, intentions };
}

function stopEvent(target: string, signal?: "intentionCancelled" | "intentionWeakened"): GameEvent {
    return {
        type: "useMove",
        actor: "hero",
        move: "stop",
        effects: [],
        targets: [{
            target,
            result: signal ? "hit" : "miss",
            effects: signal ? [{ type: signal, target }] : [],
        }],
    };
}

function stopBlocked(
    beforeIntentions: Intention[],
    afterIntentions: Intention[],
    signal?: "intentionCancelled" | "intentionWeakened",
): ReturnType<ReturnType<typeof createDetailedCombatCollector>["getResult"]> {
    const collector = createDetailedCombatCollector();
    const before = view({
        characters: [character("hero")],
        enemies: [enemyWithIntentions("target1", beforeIntentions, signal === "intentionWeakened" ? "boss" : "enemy")],
    });
    const after = view({
        characters: [character("hero")],
        enemies: [enemyWithIntentions("target1", afterIntentions, signal === "intentionWeakened" ? "boss" : "enemy")],
    });
    collector.onFightStart?.({ view: before, library: library() });
    collector.onAction?.(observation(
        before,
        after,
        stopEvent("target1", signal),
        { type: "move", actor: "hero", move: "stop", targets: ["target1"] },
    ));
    return collector.getResult();
}

describe("detailed combat metric collector", () => {
    it("tracks distinct queued Explosion episodes without recounting persistent intentions", () => {
        const collector = createDetailedCombatCollector();
        const empty = view({ enemies: [enemyWithIntentions("skunk1", [])] });
        const queued = view({
            enemies: [enemyWithIntentions("skunk1", [intention("latexExplosion")])],
        });
        collector.onFightStart?.({ view: empty, library: library() });
        collector.onAction?.(observation(
            empty,
            queued,
            { type: "changePhase", phase: "player", effects: [] },
            { type: "endTurn" },
        ));
        collector.onAction?.(observation(
            queued,
            queued,
            { type: "changePhase", phase: "player", effects: [] },
            { type: "endTurn" },
            2,
        ));
        expect(collector.getResult().skunkExplosion).toEqual({
            intentionsQueued: 1,
            killedBeforeUse: 0,
            uses: 0,
            cancelledBeforeUse: 0,
            hpAtTrigger: { "61+": 1 },
            unspentCharactersAtTrigger: { "1": 1 },
            hpAndUnspentAtTrigger: { "61+|1": 1 },
        });

        const cancelled = view({ enemies: [enemyWithIntentions("skunk1", [])] });
        collector.onAction?.(observation(
            queued,
            cancelled,
            stopEvent("skunk1", "intentionCancelled"),
            { type: "move", actor: "hero", move: "stop", targets: ["skunk1"] },
            3,
        ));
        collector.onAction?.(observation(
            cancelled,
            queued,
            { type: "changePhase", phase: "player", effects: [] },
            { type: "endTurn" },
            4,
        ));
        expect(collector.getResult().skunkExplosion).toEqual({
            intentionsQueued: 2,
            killedBeforeUse: 0,
            uses: 0,
            cancelledBeforeUse: 1,
            hpAtTrigger: { "61+": 2 },
            unspentCharactersAtTrigger: { "1": 2 },
            hpAndUnspentAtTrigger: { "61+|1": 2 },
        });
    });

    it("classifies queued Explosion episodes as killed, used, or authoritatively cancelled", () => {
        const collector = createDetailedCombatCollector();
        const initial = view({
            enemies: [
                enemyWithIntentions("killedSkunk", [intention("latexExplosion")]),
                enemyWithIntentions("usingSkunk", [intention("latexExplosion")]),
                enemyWithIntentions("cancelledSkunk", [intention("latexExplosion")]),
                enemyWithIntentions("ordinarySkunk", []),
                enemyWithIntentions("otherEnemy", [intention("differentMove")]),
            ],
        });
        collector.onFightStart?.({ view: initial, library: library() });

        const afterKill = view({ enemies: initial.enemies.filter(({ id }) => id !== "killedSkunk") });
        collector.onAction?.(observation(
            initial,
            afterKill,
            { type: "useMove", actor: "hero", move: "syntheticMouth", effects: [], targets: [{
                target: "killedSkunk", result: "hit", effects: [{ type: "enemyDefeated", target: "killedSkunk" }],
            }] },
            { type: "move", actor: "hero", move: "syntheticMouth", targets: ["killedSkunk"] },
        ));

        // Enemy-action frame snapshots can still show the just-executed intention;
        // the authoritative useMove must close the episode without re-queuing it.
        const afterUse = view({ enemies: afterKill.enemies });
        collector.onAction?.(observation(
            afterKill,
            afterUse,
            { type: "useMove", actor: "usingSkunk", move: "latexExplosion", effects: [], targets: [] },
            { type: "endTurn" },
            2,
        ));

        const afterCancel = view({
            enemies: afterUse.enemies.map((foe) => {
                if (foe.id === "cancelledSkunk") return enemyWithIntentions("cancelledSkunk", []);
                if (foe.id === "usingSkunk") return enemyWithIntentions("usingSkunk", []);
                return foe;
            }),
        });
        collector.onAction?.(observation(
            afterUse,
            afterCancel,
            stopEvent("cancelledSkunk", "intentionCancelled"),
            { type: "move", actor: "hero", move: "stop", targets: ["cancelledSkunk"] },
            3,
        ));

        const afterOrdinaryDeath = view({
            enemies: afterCancel.enemies.filter(({ id }) => id !== "ordinarySkunk"),
        });
        collector.onAction?.(observation(
            afterCancel,
            afterOrdinaryDeath,
            { type: "useMove", actor: "hero", move: "syntheticMouth", effects: [], targets: [{
                target: "ordinarySkunk", result: "hit", effects: [{ type: "enemyDefeated", target: "ordinarySkunk" }],
            }] },
            { type: "move", actor: "hero", move: "syntheticMouth", targets: ["ordinarySkunk"] },
            4,
        ));

        expect(collector.getResult().skunkExplosion).toEqual({
            intentionsQueued: 3,
            killedBeforeUse: 1,
            uses: 1,
            cancelledBeforeUse: 1,
            hpAtTrigger: { "61+": 3 },
            unspentCharactersAtTrigger: { "1": 3 },
            hpAndUnspentAtTrigger: { "61+|1": 3 },
        });
    });

    it("gives Stop full credit for cancelled positive committed player binding", () => {
        const single = stopBlocked([
            intention("latexSpray", [
                { type: "binding", target: "hero", binding: "latexArms", amount: 30 },
            ]),
        ], [], "intentionCancelled");
        expect(single.playerMoves.stop).toMatchObject({ uses: 1, totalBondageBlocked: 30 });

        const result = stopBlocked([
            intention("latexSpray", [
                { type: "binding", target: "hero", binding: "latexArms", amount: 30 },
                { type: "binding", target: "hero", binding: "latexHead", amount: -4 },
                { type: "buff", target: "hero", buff: "irrelevant", operation: "add" },
            ], [
                { type: "binding", target: "hero", binding: "latexHead", amount: 5 },
                { type: "binding", target: "foe", binding: "latexHead", amount: 99 },
            ]),
            intention("latexRain", [
                { type: "binding", target: "hero", binding: "latexHead", amount: 10 },
            ]),
        ], [], "intentionCancelled");

        expect(result.playerMoves.stop).toMatchObject({
            uses: 1,
            totalBondageBlocked: 45,
        });
        expect(result.bondageBlocked.unattributed).toBe(0);
    });

    it("keeps Stop counterfactual value separate from buff blockage and unattributed events", () => {
        const collector = createDetailedCombatCollector();
        const initial = view({
            characters: [character("hero")],
            enemies: [enemyWithIntentions("target1", [
                intention("latexSpray", [
                    { type: "binding", target: "hero", binding: "latexArms", amount: 30 },
                ]),
            ])],
        });
        const reflected = view({
            characters: [character("hero", { buffs: [{ id: "reflect", duration: 1 }] })],
            enemies: initial.enemies,
        });
        collector.onFightStart?.({ view: initial, library: library() });
        collector.onAction?.(observation(
            initial,
            reflected,
            { type: "useMove", actor: "hero", move: "reflect", targets: [], effects: [
                { type: "buffAdded", target: "hero", buff: "reflect" },
            ] },
            { type: "move", actor: "hero", move: "reflect", targets: [] },
        ));
        const stopped = view({ characters: reflected.characters, enemies: [enemyWithIntentions("target1", [])] });
        collector.onAction?.(observation(
            reflected,
            stopped,
            stopEvent("target1", "intentionCancelled"),
            { type: "move", actor: "hero", move: "stop", targets: ["target1"] },
            2,
        ));

        expect(collector.getResult()).toMatchObject({
            playerMoves: {
                stop: { totalBondageBlocked: 30 },
                reflect: { totalBondageBlocked: 0 },
            },
            bondageBlocked: { unattributed: 0 },
        });
    });

    it("does not turn cancelled deferred trap pressure into Stop bondageBlocked", () => {
        const result = stopBlocked([
            intention("latexPuddle", [], [{ type: "trap", trap: "trapPuddle", amount: 30 }]),
        ], [], "intentionCancelled");
        expect(result.playerMoves.stop).toMatchObject({ uses: 1, totalBondageBlocked: 0 });
    });

    it("credits boss Stop only for the visible before/after committed-binding reduction", () => {
        const reduced = stopBlocked(
            [intention("bossBind", [{ type: "binding", target: "hero", binding: "rope", amount: 40 }])],
            [intention("bossBind", [{ type: "binding", target: "hero", binding: "rope", amount: 15 }], [], "graze")],
            "intentionWeakened",
        );
        const missed = stopBlocked(
            [intention("bossBind", [{ type: "binding", target: "hero", binding: "rope", amount: 20 }])],
            [intention("bossBind", [], [], "miss")],
            "intentionWeakened",
        );
        const unchanged = stopBlocked(
            [intention("bossBind", [{ type: "binding", target: "hero", binding: "rope", amount: 12 }])],
            [intention("bossBind", [{ type: "binding", target: "hero", binding: "rope", amount: 12 }])],
            "intentionWeakened",
        );

        expect(reduced.playerMoves.stop.totalBondageBlocked).toBe(25);
        expect(missed.playerMoves.stop.totalBondageBlocked).toBe(20);
        expect(unchanged.playerMoves.stop.totalBondageBlocked).toBe(0);
    });

    it("keeps ineffective and rejected Stop attempts at zero defensive value", () => {
        const ineffective = stopBlocked(
            [intention("latexSpray", [{ type: "binding", target: "hero", binding: "rope", amount: 30 }])],
            [intention("latexSpray", [{ type: "binding", target: "hero", binding: "rope", amount: 30 }])],
        );
        expect(ineffective.playerMoves.stop).toMatchObject({ uses: 1, totalBondageBlocked: 0 });

        const collector = createDetailedCombatCollector();
        const state = view();
        collector.onFightStart?.({ view: state, library: library() });
        collector.onAction?.({
            actionIndex: 1,
            action: { type: "move", actor: "hero", move: "stop", targets: ["target1"] },
            before: state,
            result: { success: false, reason: "invalidTarget" },
        });
        expect(collector.getResult().playerMoves.stop).toBeUndefined();
    });

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

    it("counts an initial enemy through its inclusive defeat round", () => {
        const collector = createDetailedCombatCollector();
        const initial = view({ enemies: [enemy("skunk1")] });
        const defeated = view({
            turn: { round: 3, step: 1, phase: "player", outcome: "ongoing" },
            enemies: [],
        });
        collector.onFightStart?.({ view: initial, library: library() });
        collector.onAction?.(observation(
            initial,
            defeated,
            {
                type: "useMove",
                actor: "hero",
                move: "syntheticMouth",
                targets: [],
                effects: [{ type: "enemyDefeated", target: "skunk1" }],
            },
            { type: "endTurn" },
        ));

        expect(collector.getResult().enemyLifetimes).toEqual({
            skunk1: {
                totalRounds: 3,
                observations: 1,
                defeated: 1,
                survivedToEnd: 0,
            },
        });
    });

    it("counts spawn and defeat in the same round as one round", () => {
        const collector = createDetailedCombatCollector();
        const round4 = view({
            turn: { round: 4, step: 1, phase: "player", outcome: "ongoing" },
        });
        collector.onFightStart?.({ view: round4, library: library() });
        collector.onAction?.(observation(
            round4,
            round4,
            {
                type: "useMove",
                actor: "hero",
                move: "syntheticMouth",
                targets: [],
                effects: [
                    { type: "enemySpawned", target: "rainmaker1" },
                    { type: "enemyDefeated", target: "rainmaker1" },
                ],
            },
            { type: "endTurn" },
        ));

        expect(collector.getResult().enemyLifetimes?.rainmaker1).toEqual({
            totalRounds: 1,
            observations: 1,
            defeated: 1,
            survivedToEnd: 0,
        });
    });

    it("closes a spawned survivor on the final round", () => {
        const collector = createDetailedCombatCollector();
        const before = view({
            turn: { round: 4, step: 1, phase: "player", outcome: "ongoing" },
        });
        const spawned = view({
            turn: { round: 4, step: 1, phase: "player", outcome: "ongoing" },
            enemies: [enemy("queen1")],
        });
        collector.onFightStart?.({ view: before, library: library() });
        collector.onAction?.(observation(
            before,
            spawned,
            {
                type: "useMove",
                actor: "hero",
                move: "syntheticMouth",
                targets: [],
                effects: [{ type: "enemySpawned", target: "queen1" }],
            },
            { type: "endTurn" },
        ));
        collector.onFightEnd?.({
            termination: "defeat",
            view: view({
                turn: { round: 6, step: 1, phase: "player", outcome: "defeat" },
                enemies: [enemy("queen1")],
            }),
            actionCount: 1,
        });

        expect(collector.getResult().enemyLifetimes?.queen1).toEqual({
            totalRounds: 3,
            observations: 1,
            defeated: 0,
            survivedToEnd: 1,
        });
    });

    it("aggregates different public enemy instance IDs independently", () => {
        const collector = createDetailedCombatCollector();
        const initial = view({ enemies: [enemy("skunk1"), enemy("skunk2")] });
        const after = view({
            turn: { round: 2, step: 1, phase: "player", outcome: "ongoing" },
            enemies: [enemy("skunk2")],
        });
        collector.onFightStart?.({ view: initial, library: library() });
        collector.onAction?.(observation(
            initial,
            after,
            {
                type: "useMove",
                actor: "hero",
                move: "syntheticMouth",
                targets: [],
                effects: [{ type: "enemyDefeated", target: "skunk1" }],
            },
            { type: "endTurn" },
        ));
        collector.onFightEnd?.({
            termination: "defeat",
            view: view({
                turn: { round: 4, step: 1, phase: "player", outcome: "defeat" },
                enemies: [enemy("skunk2")],
            }),
            actionCount: 1,
        });

        expect(collector.getResult().enemyLifetimes).toEqual({
            skunk1: {
                totalRounds: 2,
                observations: 1,
                defeated: 1,
                survivedToEnd: 0,
            },
            skunk2: {
                totalRounds: 4,
                observations: 1,
                defeated: 0,
                survivedToEnd: 1,
            },
        });
    });
});
