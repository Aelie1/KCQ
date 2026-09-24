import { describe, expect, it } from "vitest";
import { matsuko } from "../../src/content/characters/matsuko";
import type { EncounterDef, EnemyDef, MoveDef } from "../../src/engine/protected/definitions";
import { createCustomEngine } from "../../src/engine/protected/engine";
import { s } from "../../src/engine/protected/status";
import { gagged, servitude } from "../../src/engine/protected/statuses";
import type {
    AccuracyProfile,
    ActionInfo,
    ActionSuccess, Engine, PlayerAction
} from "../../src/engine/public/types";
import {
    buffState,
    characterState,
    execute,
    makeBehavioralCharacter,
    makeBehavioralEnemy,
    makeBehavioralMove,
    targetAccuracy,
    targetPreview,
} from "../helpers/behavioralHelpers";
import { actionView } from "../helpers/gameView";

const STANDARD_ACCURACY: AccuracyProfile = {
    miss: 10,
    graze: 15,
    hit: 65,
    crit: 10,
};

function durableEnemy(id = "foe", moves?: MoveDef[]): EnemyDef {
    const enemy = makeBehavioralEnemy(id, moves);
    enemy.hp = 2_000;
    return enemy;
}

function loadMatsukoEncounter(options: {
    enemies?: EnemyDef[];
    allies?: ReturnType<typeof makeBehavioralCharacter>[];
    setup?: EncounterDef["setup"];
    seed?: number;
} = {}): Engine {
    const encounter: EncounterDef = {
        id: "matsuko-test",
        enemies: options.enemies ?? [durableEnemy()],
        bindings: [],
        traps: [],
        setup: options.setup,
    };
    const allies = options.allies ?? [];
    const engine = createCustomEngine([encounter], [matsuko, ...allies], options.seed ?? 1);
    engine.loadCharacter(matsuko.id);
    for (const ally of allies) engine.loadCharacter(ally.id);
    engine.loadEncounter(encounter.id);
    return engine;
}

function action(engine: Engine, id: string): ActionInfo {
    const result = actionView(engine, matsuko.id).moves.find(({ move }) => move.id === id);
    if (!result) throw new Error(`Expected Matsuko move ${id}`);
    return result;
}

function expectMoveSet(engine: Engine, expected: string[]): void {
    const actual = actionView(engine, matsuko.id).moves.map(({ move }) => move.id);
    expect(actual).toHaveLength(expected.length);
    expect(new Set(actual)).toEqual(new Set(expected));
}

function damageAmount(result: ActionSuccess, target: string): number {
    const event = result.events.find(
        (candidate) => candidate.type === "enemyDamaged" && candidate.target === target,
    );
    if (!event || event.type !== "enemyDamaged") {
        throw new Error(`Expected damage to ${target}`);
    }
    return event.amount;
}

function playerThreat(id: string, accuracy?: AccuracyProfile): MoveDef {
    return makeBehavioralMove(id, "none", {
        targetSide: "player",
        targets: 1,
        accuracy,
    });
}

describe("Matsuko's dynamic offensive kit", () => {
    it("uses Immolation against every enemy, gains Burnout, and retains Compulsion moves", () => {
        const engine = loadMatsukoEncounter({
            enemies: [durableEnemy("first"), durableEnemy("second")],
            seed: 2,
        });

        expectMoveSet(engine, [
            "whiteFlame",
            "phoenixKick",
            "immolation",
            "obey",
            "stop",
            "attackMe",
        ]);
        expect(action(engine, "immolation")).toMatchObject({
            available: true,
            move: { type: "none", targetSide: "enemy", targets: "all" },
            targets: [
                { valid: true, target: "first1" },
                { valid: true, target: "second1" },
            ],
        });

        const result = execute(engine, {
            type: "move",
            actor: matsuko.id,
            move: "immolation",
            targets: [],
        });

        expect(result.events[0]).toMatchObject({
            type: "moveUsed",
            actor: matsuko.id,
            move: "immolation",
            targets: [
                { target: "first1", result: "hit" },
                { target: "second1", result: "crit" },
            ],
        });
        const hitDamage = damageAmount(result, "first1");
        const critDamage = damageAmount(result, "second1");
        expect(hitDamage).toBeGreaterThan(0);
        expect(critDamage).toBeGreaterThan(hitDamage);
        expect(result.events).toContainEqual({
            type: "buffAdded",
            target: matsuko.id,
            buff: "burnout",
        });
        expect(buffState(engine, "burnout", matsuko.id)).toBeDefined();
        expectMoveSet(engine, ["punch", "kick", "obey", "stop", "attackMe"]);
    });

    it("applies White Flame's Hit bonus to its accuracy preview", () => {
        const normal = loadMatsukoEncounter({ seed: 2 });
        const burnedOut = loadMatsukoEncounter({
            setup: (state) => [{
                type: "buff",
                operation: "add",
                target: state.characters[0],
                buff: { id: "burnout", active: true },
            }],
        });

        expect(action(normal, "whiteFlame")).toMatchObject({
            move: { type: "arms", targetSide: "enemy", targets: 1 },
            available: true,
        });
        expect(targetAccuracy(burnedOut, matsuko.id, "punch", "foe1"))
            .toEqual(STANDARD_ACCURACY);
        expect(targetAccuracy(normal, matsuko.id, "whiteFlame", "foe1")).toEqual({
            graze: 5,
            hit: 83,
            crit: 12,
        });

        const result = execute(normal, {
            type: "move",
            actor: matsuko.id,
            move: "whiteFlame",
            targets: ["foe1"],
        });
        expect(result.events[0]).toMatchObject({
            type: "moveUsed",
            targets: [{ target: "foe1", result: "hit" }],
        });
        expect(damageAmount(result, "foe1")).toBeGreaterThan(0);
    });

    it("applies Phoenix Kick's Potency bonus without changing its accuracy widths", () => {
        const normal = loadMatsukoEncounter({ seed: 2 });
        const burnedOut = loadMatsukoEncounter({
            seed: 2,
            setup: (state) => [{
                type: "buff",
                operation: "add",
                target: state.characters[0],
                buff: { id: "burnout", active: true },
            }],
        });

        expect(action(normal, "phoenixKick")).toMatchObject({
            move: { type: "legs", targetSide: "enemy", targets: 1 },
            available: true,
        });
        expect(targetAccuracy(normal, matsuko.id, "phoenixKick", "foe1"))
            .toEqual(STANDARD_ACCURACY);
        expect(targetAccuracy(burnedOut, matsuko.id, "kick", "foe1"))
            .toEqual(STANDARD_ACCURACY);
        expect(targetPreview(burnedOut, matsuko.id, "kick", "foe1").damage).toEqual({
            miss: { chance: 10, min: 0, max: 0 },
            graze: { chance: 15, min: 6, max: 15 },
            hit: { chance: 65, min: 24, max: 30 },
            crit: { chance: 10, min: 45, max: 60 },
        });
        expect(targetPreview(normal, matsuko.id, "phoenixKick", "foe1").damage).toEqual({
            miss: { chance: 10, min: 0, max: 0 },
            graze: { chance: 15, min: 8, max: 19 },
            hit: { chance: 65, min: 30, max: 38 },
            crit: { chance: 10, min: 57, max: 75 },
        });

        const phoenix = execute(normal, {
            type: "move",
            actor: matsuko.id,
            move: "phoenixKick",
            targets: ["foe1"],
        });
        const ordinary = execute(burnedOut, {
            type: "move",
            actor: matsuko.id,
            move: "kick",
            targets: ["foe1"],
        });

        expect(phoenix.events[0]).toMatchObject({
            type: "moveUsed",
            targets: [{ target: "foe1", result: "hit" }],
        });
        expect(ordinary.events[0]).toMatchObject({
            type: "moveUsed",
            targets: [{ target: "foe1", result: "hit" }],
        });
        expect(damageAmount(ordinary, "foe1")).toBeGreaterThan(0);
        expect(damageAmount(phoenix, "foe1")).toBeGreaterThan(damageAmount(ordinary, "foe1"));
    });

    it("uses Punch as a basic arms attack while burned out", () => {
        const engine = loadMatsukoEncounter({
            seed: 2,
            setup: (state) => [{
                type: "buff",
                operation: "add",
                target: state.characters[0],
                buff: { id: "burnout", active: true },
            }],
        });

        expect(action(engine, "punch")).toMatchObject({
            available: true,
            move: { type: "arms", targetSide: "enemy", targets: 1 },
        });
        const result = execute(engine, {
            type: "move",
            actor: matsuko.id,
            move: "punch",
            targets: ["foe1"],
        });

        expect(result.events[0]).toMatchObject({
            type: "moveUsed",
            targets: [{ target: "foe1", result: "hit" }],
        });
        expect(damageAmount(result, "foe1")).toBeGreaterThan(0);
    });

    it.each([
        ["fairyWhiteFlame", "whiteFlame", "punch"],
        ["fairyPhoenixKick", "phoenixKick", "kick"],
    ] as const)("uses %s with both Hit and Potency bonuses, consumes once, and restores %s", (
        fairyMove,
        normalMove,
        basicMove,
    ) => {
        const engine = loadMatsukoEncounter({
            seed: 2,
            setup: (state) => [{
                type: "buff",
                operation: "add",
                target: state.characters[0],
                buff: { id: "fairyEmpowerment", active: true },
            }],
        });

        expectMoveSet(engine, [
            "whiteFlame",
            "fairyWhiteFlame",
            "phoenixKick",
            "fairyPhoenixKick",
            "immolation",
            "obey",
            "stop",
            "attackMe",
        ]);
        expect(actionView(engine, matsuko.id).moves.some(({ move }) => move.id === normalMove)).toBe(true);
        expect(targetAccuracy(engine, matsuko.id, fairyMove, "foe1")).toEqual({
            graze: 5,
            hit: 83,
            crit: 12,
        });

        const result = execute(engine, {
            type: "move",
            actor: matsuko.id,
            move: fairyMove,
            targets: ["foe1"],
        });
        const baseline = loadMatsukoEncounter({
            seed: 2,
            setup: (state) => [{
                type: "buff",
                operation: "add",
                target: state.characters[0],
                buff: { id: "burnout", active: true },
            }],
        });
        const baselineResult = execute(baseline, {
            type: "move",
            actor: matsuko.id,
            move: basicMove,
            targets: ["foe1"],
        });

        expect(result.events[0]).toMatchObject({
            type: "moveUsed",
            targets: [{ target: "foe1", result: "hit" }],
        });
        expect(damageAmount(result, "foe1")).toBeGreaterThan(damageAmount(baselineResult, "foe1"));
        expect(result.events.filter(({ type }) => type === "buffRemoved")).toEqual([{
            type: "buffRemoved",
            target: matsuko.id,
            buff: "fairyEmpowerment",
        }]);
        expect(buffState(engine, "fairyEmpowerment", matsuko.id)).toBeUndefined();
        expectMoveSet(engine, [
            "whiteFlame",
            "phoenixKick",
            "immolation",
            "obey",
            "stop",
            "attackMe",
        ]);
    });

    it.each(["whiteFlame", "phoenixKick"] as const)(
        "banks Fairy Empowerment when using normal %s",
        (normalMove) => {
            const engine = loadMatsukoEncounter({
                seed: 2,
                setup: (state) => [{
                    type: "buff",
                    operation: "add",
                    target: state.characters[0],
                    buff: { id: "fairyEmpowerment", active: true },
                }],
            });

            execute(engine, {
                type: "move",
                actor: matsuko.id,
                move: normalMove,
                targets: ["foe1"],
            });

            expect(buffState(engine, "fairyEmpowerment", matsuko.id)).toBeDefined();
            expect(actionView(engine, matsuko.id).moves.map(({ move }) => move.id))
                .toEqual(expect.arrayContaining(["fairyWhiteFlame", "fairyPhoenixKick"]));
        },
    );

    it("does not consume Fairy Empowerment when using Immolation", () => {
        const engine = loadMatsukoEncounter({
            seed: 2,
            setup: (state) => [{
                type: "buff",
                operation: "add",
                target: state.characters[0],
                buff: { id: "fairyEmpowerment", active: true },
            }],
        });

        const result = execute(engine, {
            type: "move",
            actor: matsuko.id,
            move: "immolation",
            targets: [],
        });

        expect(result.events.some(({ type }) => type === "buffRemoved")).toBe(false);
        expect(buffState(engine, "fairyEmpowerment", matsuko.id)).toBeDefined();
        expectMoveSet(engine, ["punch", "kick", "obey", "stop", "attackMe"]);
    });

    it("does not consume Fairy Empowerment when using Compulsion moves", () => {
        const empoweredSetup: EncounterDef["setup"] = (state) => {
            return [{
                type: "buff",
                operation: "add",
                target: state.characters[0],
                buff: { id: "fairyEmpowerment", active: true },
            }];
        };
        const stopEngine = loadMatsukoEncounter({ setup: empoweredSetup });
        const attackMeEngine = loadMatsukoEncounter({ setup: empoweredSetup });
        const allyAction = makeBehavioralMove("ally-action", "none", {
            targetSide: "none",
            targets: 0,
            accuracy: undefined,
        });
        const ally = makeBehavioralCharacter("ally", [allyAction]);
        const obeyEngine = loadMatsukoEncounter({
            allies: [ally],
            setup: empoweredSetup,
        });
        execute(obeyEngine, { type: "move", actor: ally.id, move: allyAction.id, targets: [] });
        const scenarios: Array<{ engine: Engine; action: PlayerAction }> = [
            {
                engine: stopEngine,
                action: {
                    type: "move",
                    actor: matsuko.id,
                    move: "stop",
                    targets: ["foe1"],
                },
            },
            {
                engine: attackMeEngine,
                action: {
                    type: "move",
                    actor: matsuko.id,
                    move: "attackMe",
                    targets: [],
                },
            },
            {
                engine: obeyEngine,
                action: {
                    type: "move",
                    actor: matsuko.id,
                    move: "obey",
                    targets: [ally.id],
                },
            },
        ];

        for (const { engine, action: playerAction } of scenarios) {
            const result = execute(engine, playerAction);
            expect(result.events.some(({ type }) => type === "buffRemoved")).toBe(false);
            expect(buffState(engine, "fairyEmpowerment", matsuko.id)).toBeDefined();
        }
    });
});

describe("Matsuko's Compulsion moves", () => {
    it("reports every Compulsion as unavailable when Mouth moves are restricted", () => {
        const ally = makeBehavioralCharacter("ally");
        const engine = loadMatsukoEncounter({
            allies: [ally],
            setup: (state) => [{
                type: "buff",
                operation: "add",
                target: state.characters[0],
                buff: {
                    id: "mouth-restriction",
                    active: true,
                    statuses: [s(gagged, 3)],
                },
            }],
        });

        for (const id of ["obey", "stop", "attackMe"]) {
            expect(action(engine, id)).toMatchObject({
                available: false,
                reason: "bindingRestriction",
                move: { type: "mouth" },
            });
        }
    });

    it("publishes Obey's target-count failure, then refreshes an acted ally for free", () => {
        const wait = makeBehavioralMove("ally-action", "none", {
            targetSide: "none",
            targets: 0,
            accuracy: undefined,
        });
        const ally = makeBehavioralCharacter("ally", [wait]);
        const engine = loadMatsukoEncounter({ allies: [ally], seed: 1 });

        expect(action(engine, "obey")).toEqual({
            available: false,
            reason: "invalidTargetCount",
            move: { id: "obey", type: "mouth", targetSide: "player", targets: 1 },
            targets: [],
        });

        execute(engine, {
            type: "move",
            actor: ally.id,
            move: wait.id,
            targets: [],
        });
        expect(characterState(engine, ally.id).acted).toBe(true);
        expect(action(engine, "obey")).toMatchObject({
            available: true,
            targets: expect.arrayContaining([
                { valid: false, target: matsuko.id, reason: "invalidTarget" },
                expect.objectContaining({
                    valid: true, target: ally.id, effects: [
                        expect.objectContaining({ type: "buff", target: ally.id, buff: "servitude", operation: "add" }),
                        expect.objectContaining({ type: "buff", target: matsuko.id, buff: "compulsionCD", operation: "add" }),
                    ]
                }),
            ]),
        });

        const result = execute(engine, {
            type: "move",
            actor: matsuko.id,
            move: "obey",
            targets: [ally.id],
        });

        expect(result.events).toEqual(expect.arrayContaining([
            { type: "buffAdded", target: ally.id, buff: "servitude" },
            { type: "actionRefreshed", target: ally.id },
            { type: "buffAdded", target: matsuko.id, buff: "compulsionCD" },
        ]));
        expect(characterState(engine, ally.id).acted).toBe(false);
        expect(buffState(engine, "servitude", ally.id)).toMatchObject({
            duration: 2,
            statuses: [{ id: "servitude", value: 1 }],
        });
        expect(characterState(engine, matsuko.id).acted).toBe(false);
        expect(buffState(engine, "compulsionCD", matsuko.id)).toMatchObject({ duration: 3 });
        expectMoveSet(engine, ["whiteFlame", "phoenixKick", "immolation"]);

        execute(engine, {
            type: "move",
            actor: matsuko.id,
            move: "whiteFlame",
            targets: ["foe1"],
        });
        expect(characterState(engine, matsuko.id).acted).toBe(true);
    });

    it("marks a character with Servitude as an invalid Obey target", () => {
        const act = makeBehavioralMove("act", "none", {
            targetSide: "none",
            targets: 0,
            accuracy: undefined,
        });
        const servant = makeBehavioralCharacter("servant", [act]);
        const eligible = makeBehavioralCharacter("eligible", [act]);
        const engine = loadMatsukoEncounter({
            allies: [servant, eligible],
            setup: (state) => [{
                type: "buff",
                operation: "add",
                target: state.characters[1],
                buff: {
                    id: "servitude",
                    active: true,
                    duration: 2,
                    statuses: [s(servitude, 1)],
                },
            }],
        });
        execute(engine, { type: "move", actor: servant.id, move: act.id, targets: [] });
        execute(engine, { type: "move", actor: eligible.id, move: act.id, targets: [] });

        expect(action(engine, "obey")).toMatchObject({
            available: true,
            targets: expect.arrayContaining([
                { valid: false, target: servant.id, reason: "invalidTarget" },
                expect.objectContaining({
                    valid: true, target: eligible.id, effects: [
                        expect.objectContaining({ type: "buff", target: eligible.id, buff: "servitude", operation: "add" }),
                        expect.objectContaining({ type: "buff", target: matsuko.id, buff: "compulsionCD", operation: "add" }),
                    ]
                }),
            ]),
        });
    });

    it("uses Stop for free to cancel every intention of a non-boss", () => {
        const first = playerThreat("first-threat");
        const second = playerThreat("second-threat");
        const enemy = durableEnemy("caster", [first, second]);
        enemy.ai = (state, actor) => [first, second].map((move) => ({
            type: "move" as const,
            actor,
            move: { definition: move },
            targets: [state.characters[0]],
        }));
        const engine = loadMatsukoEncounter({ enemies: [enemy] });

        expect(engine.getGameView().enemies[0].intentions.map(({ move }) => move))
            .toEqual([first.id, second.id]);
        expect(action(engine, "stop")).toMatchObject({
            available: true,
            move: { type: "mouth", targetSide: "enemy", targets: 1 },
        });

        const result = execute(engine, {
            type: "move",
            actor: matsuko.id,
            move: "stop",
            targets: ["caster1"],
        });

        expect(result.events).toContainEqual({ type: "intentionCancelled", target: "caster1" });
        expect(engine.getGameView().enemies[0].intentions).toEqual([]);
        expect(characterState(engine, matsuko.id).acted).toBe(false);
        expect(buffState(engine, "compulsionCD", matsuko.id)).toMatchObject({ duration: 5 });
        expectMoveSet(engine, ["whiteFlame", "phoenixKick", "immolation"]);

        execute(engine, {
            type: "move",
            actor: matsuko.id,
            move: "whiteFlame",
            targets: ["caster1"],
        });
        expect(characterState(engine, matsuko.id).acted).toBe(true);
    });

    it("uses Stop to weaken every boss intention while preserving its previews", () => {
        const first = playerThreat("first-threat", {
            miss: 25,
            graze: 25,
            hit: 25,
            crit: 25,
        });
        const second = playerThreat("second-threat", {
            miss: 25,
            graze: 25,
            hit: 25,
            crit: 25,
        });
        const boss = durableEnemy("boss", [first, second]);
        boss.rank = "boss";
        boss.ai = (state, actor) => [first, second].map((move) => ({
            type: "move" as const,
            actor,
            move: { definition: move },
            targets: [state.characters[0]],
        }));
        const engine = loadMatsukoEncounter({ enemies: [boss], seed: 4 });

        expect(engine.getGameView().enemies[0].intentions.map(
            ({ targets }) => targets[0]?.band,
        )).toEqual(["hit", "hit"]);

        const result = execute(engine, {
            type: "move",
            actor: matsuko.id,
            move: "stop",
            targets: ["boss1"],
        });

        expect(result.events).toContainEqual({ type: "intentionWeakened", target: "boss1" });
        expect(engine.getGameView().enemies[0].intentions).toHaveLength(2);
        expect(engine.getGameView().enemies[0].intentions.map(
            ({ targets }) => targets[0]?.band,
        )).toEqual(["graze", "graze"]);
        expect(characterState(engine, matsuko.id).acted).toBe(false);
        expect(buffState(engine, "compulsionCD", matsuko.id)).toMatchObject({ duration: 5 });
    });

    it("retargets compatible intentions across enemies without changing other shapes", () => {
        const single = playerThreat("single");
        const first = durableEnemy("first", [single]);
        const second = durableEnemy("second", [single]);
        first.ai = (state, actor) => [{
            type: "move",
            actor,
            move: { definition: single },
            targets: [state.characters[1]],
        }];
        second.ai = first.ai;

        const allPlayers = makeBehavioralMove("all-players", "none", {
            targetSide: "player",
            targets: "all",
            accuracy: undefined,
        });
        const area = durableEnemy("area", [allPlayers]);
        area.ai = (_state, actor) => [{
            type: "move",
            actor,
            move: { definition: allPlayers },
            targets: [],
        }];

        const targetlessMove = makeBehavioralMove("targetless", "none", {
            targetSide: "none",
            targets: 0,
            accuracy: undefined,
        });
        const targetless = durableEnemy("targetless", [targetlessMove]);

        const enemyDirected = makeBehavioralMove("enemy-directed", "none", {
            targetSide: "enemy",
            targets: 1,
            accuracy: undefined,
        });
        const hostile = durableEnemy("hostile", [enemyDirected]);
        hostile.ai = (state, actor) => [{
            type: "move",
            actor,
            move: { definition: enemyDirected },
            targets: [state.enemies[0]],
        }];

        const ally = makeBehavioralCharacter("ally");
        const engine = loadMatsukoEncounter({
            enemies: [first, second, area, targetless, hostile],
            allies: [ally],
        });
        const intentionTargets = () => Object.fromEntries(
            engine.getGameView().enemies.map((enemy) => [
                enemy.id,
                enemy.intentions[0]?.targets.map(({ target }) => target) ?? [],
            ]),
        );

        expect(intentionTargets()).toEqual({
            first1: [ally.id],
            second1: [ally.id],
            area1: [matsuko.id, ally.id],
            targetless1: [],
            hostile1: ["first1"],
        });
        expect(action(engine, "attackMe")).toMatchObject({
            available: true,
            move: { type: "mouth", targetSide: "enemy", targets: "all" },
        });

        const result = execute(engine, {
            type: "move",
            actor: matsuko.id,
            move: "attackMe",
            targets: [],
        });

        expect(intentionTargets()).toEqual({
            first1: [matsuko.id],
            second1: [matsuko.id],
            area1: [matsuko.id, ally.id],
            targetless1: [],
            hostile1: ["first1"],
        });
        expect(result.events.filter(({ type }) => type === "targetChanged")).toEqual([
            { type: "targetChanged", target: "first1", destination: matsuko.id },
            { type: "targetChanged", target: "second1", destination: matsuko.id },
        ]);
        expect(characterState(engine, matsuko.id).acted).toBe(false);
        expect(buffState(engine, "compulsionCD", matsuko.id)).toMatchObject({ duration: 2 });
        expectMoveSet(engine, ["whiteFlame", "phoenixKick", "immolation"]);

        execute(engine, {
            type: "move",
            actor: matsuko.id,
            move: "whiteFlame",
            targets: ["first1"],
        });
        expect(characterState(engine, matsuko.id).acted).toBe(true);
    });
});
