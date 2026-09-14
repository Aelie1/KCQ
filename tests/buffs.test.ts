import { describe, expect, it } from "vitest";
import type { StatusDef } from "../src/engine/protected/definitions";
import type { MoveDef } from "../src/engine/protected/definitions";
import {
    buffState,
    characterState,
    enemyState,
    execute,
    makeBehavioralCharacter,
    makeBehavioralEnemy,
    makeBehavioralEngine,
    makeBehavioralMove,
    makeEnemyWaitMove,
    targetAccuracy,
} from "./behavioralHelpers";

const blinded: StatusDef = {
    id: "blinded",
    levels: [
        {},
        { modifiers: { hit: -2, defense: -3 } },
        { modifiers: { hit: -4, defense: -6 } },
    ],
};

function addBuffMove(
    id: string,
    target: "hero" | "foe",
    duration: number | undefined,
    buffId = "test-buff",
): MoveDef {
    return makeBehavioralMove(id, "mouth", {
        targets: 0,
        side: "none",
        alwaysAvailable: true,
        freeOnHit: true,
        resolve: (state) => [{
            type: "buff",
            target: target === "hero" ? state.characters[0] : state.enemies[0],
            buff: {
                id: buffId,
                duration,
                active: true,
                statuses: [{ definition: blinded, value: 1 }],
            },
            operation: "add",
        }],
    });
}

describe("buff behavior through GameEngine", () => {
    it("adds an authored active buff and publishes its serialized data", () => {
        const add = addBuffMove("add-buff", "foe", 2);
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero", [add]),
        ]);

        const result = execute(engine, {
            type: "attack",
            actor: "hero",
            move: add.id,
            targets: [],
        });

        expect(result.events).toEqual([
            { type: "moveUsed", actor: "hero", move: add.id, targets: [] },
            { type: "buffAdded", target: "foe1", buff: "test-buff" },
        ]);
        expect(buffState(engine, "test-buff", "foe1")).toMatchObject({
            id: "test-buff",
            duration: 2,
            active: true,
            statuses: [{ id: "blinded", value: 1 }],
        });
    });

    it("keeps an authored pending reaction inactive until the next player phase", () => {
        const strike = makeBehavioralMove("provoke", "arms", {
            targets: 1,
            side: "enemy",
            resolve: (state, actor) => [{
                type: "damage",
                source: actor,
                target: state.enemies[0],
                amount: 1,
            }],
        });
        const foe = makeBehavioralEnemy("foe");
        foe.onDamage = (state, _source, enemy) => [{
            type: "buff",
            target: state.characters[0],
            buff: {
                id: "enemy-debuff",
                duration: 3,
                active: false,
                statuses: [{ definition: blinded, value: 1 }],
            },
            operation: "add",
        }];
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero", [strike]),
        ], [foe]);

        execute(engine, {
            type: "attack",
            actor: "hero",
            move: strike.id,
            targets: ["foe1"],
        });
        expect(buffState(engine, "enemy-debuff")).toMatchObject({
            active: false,
            duration: 3,
            statuses: [{ id: "blinded", value: 1 }],
        });

        execute(engine, { type: "endTurn" });
        expect(buffState(engine, "enemy-debuff")).toMatchObject({
            active: true,
            duration: 3,
            statuses: [{ id: "blinded", value: 1 }],
        });
    });

    it("updates an existing buff with the same id and emits buffUpdated", () => {
        const first = addBuffMove("first-version", "hero", 4, "replaceable");
        const second = addBuffMove("second-version", "hero", 1, "replaceable");
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero", [first, second]),
        ]);

        execute(engine, { type: "attack", actor: "hero", move: first.id, targets: [] });
        const result = execute(engine, {
            type: "attack",
            actor: "hero",
            move: second.id,
            targets: [],
        });

        expect(result.events[1]).toEqual({
            type: "buffUpdated",
            target: "hero",
            buff: "replaceable",
        });
        expect(characterState(engine).buffs).toHaveLength(1);
        expect(buffState(engine, "replaceable")?.duration).toBe(1);
    });

    it("decrements and expires a finite buff on successive round transitions", () => {
        const add = addBuffMove("temporary", "hero", 2, "temporary");
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero", [add]),
        ]);

        execute(engine, { type: "attack", actor: "hero", move: add.id, targets: [] });
        const firstTurn = execute(engine, { type: "endTurn" });
        expect(firstTurn.events).not.toContainEqual({
            type: "buffRemoved",
            target: "hero",
            buff: "temporary",
        });
        expect(buffState(engine, "temporary")?.duration).toBe(1);

        const secondTurn = execute(engine, { type: "endTurn" });
        expect(secondTurn.events).toContainEqual({
            type: "buffRemoved",
            target: "hero",
            buff: "temporary",
        });
        expect(buffState(engine, "temporary")).toBeUndefined();
    });

    it("leaves an infinite buff active across round transitions", () => {
        const add = addBuffMove("permanent", "hero", undefined, "permanent");
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero", [add]),
        ]);

        execute(engine, { type: "attack", actor: "hero", move: add.id, targets: [] });
        execute(engine, { type: "endTurn" });
        execute(engine, { type: "endTurn" });

        expect(buffState(engine, "permanent")).toMatchObject({
            id: "permanent",
            active: true,
        });
        expect(buffState(engine, "permanent")?.duration).toBeUndefined();
    });

    it("removes every expiring buff once and in public entity order", () => {
        const addAll = makeBehavioralMove("add-all", "mouth", {
            targets: 0,
            side: "none",
            resolve: (state) => [
                {
                    type: "buff",
                    target: state.characters[0],
                    buff: { id: "first", active: true, duration: 1 },
                    operation: "add",
                },
                {
                    type: "buff",
                    target: state.characters[0],
                    buff: { id: "second", active: true, duration: 1 },
                    operation: "add",
                },
                {
                    type: "buff",
                    target: state.enemies[0],
                    buff: { id: "third", active: true, duration: 1 },
                    operation: "add",
                },
            ],
        });
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero", [addAll]),
        ]);
        execute(engine, { type: "attack", actor: "hero", move: addAll.id, targets: [] });

        const turn = execute(engine, { type: "endTurn" });
        expect(turn.events.filter((event) => event.type === "buffRemoved")).toEqual([
            { type: "buffRemoved", target: "hero", buff: "first" },
            { type: "buffRemoved", target: "hero", buff: "second" },
            { type: "buffRemoved", target: "foe1", buff: "third" },
        ]);
        expect(characterState(engine).buffs).toEqual([]);
        expect(enemyState(engine).buffs).toEqual([]);
    });

    it("removes a buff through an authored action and preserves linkedEntity publicly", () => {
        const add = makeBehavioralMove("link", "mouth", {
            targets: 0,
            side: "none",
            freeOnHit: true,
            resolve: (state) => [{
                type: "buff",
                target: state.characters[0],
                buff: { id: "linked", active: true, linkedEntity: "foe1" },
                operation: "add",
            }],
        });
        const remove = makeBehavioralMove("unlink", "mouth", {
            targets: 0,
            side: "none",
            resolve: (state, actor) => {
                const buff = actor.buffs.find(({ id }) => id === "linked");
                return buff ? [{
                    type: "buff",
                    target: state.characters[0],
                    buff,
                    operation: "remove",
                }] : [];
            },
        });
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero", [add, remove]),
        ]);

        execute(engine, { type: "attack", actor: "hero", move: add.id, targets: [] });
        expect(buffState(engine, "linked")?.linkedEntity).toBe("foe1");
        const result = execute(engine, {
            type: "attack",
            actor: "hero",
            move: remove.id,
            targets: [],
        });
        expect(result.events[1]).toEqual({
            type: "buffRemoved",
            target: "hero",
            buff: "linked",
        });
        expect(buffState(engine, "linked")).toBeUndefined();
    });
});

describe("buff status integration through GameEngine", () => {
    it("publishes active statuses and applies modifiers to accuracy previews", () => {
        const add = addBuffMove("blind-self", "hero", 3, "blindness");
        const attack = makeBehavioralMove("accuracy-check", "mouth", {
            accuracy: { miss: 20, hit: 80 },
        });
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero", [add, attack]),
        ], [makeBehavioralEnemy("foe", [makeEnemyWaitMove()])]);

        execute(engine, { type: "attack", actor: "hero", move: add.id, targets: [] });

        expect(buffState(engine, "blindness")?.statuses)
            .toEqual([{ id: "blinded", value: 1 }]);
        expect(characterState(engine).modifiers).toEqual({ hit: -2, defense: -3 });
        expect(targetAccuracy(engine, "hero", attack.id, "foe1")).toEqual({
            miss: 40,
            hit: 60,
        });
    });

    it("withholds pending statuses, modifiers, and added moves until activation", () => {
        const granted = makeBehavioralMove("buff-granted", "arms");
        const accuracyCheck = makeBehavioralMove("accuracy-check", "mouth", {
            accuracy: { miss: 20, hit: 80 },
        });
        const addPending = makeBehavioralMove("add-pending", "mouth", {
            side: "none",
            targets: 0,
            resolve: (state) => [{
                type: "buff",
                target: state.characters[0],
                buff: {
                    id: "pending-kit",
                    active: false,
                    duration: 1,
                    statuses: [{ definition: blinded, value: 1 }],
                    modifiers: { hit: -1 },
                    addedMoves: [granted],
                },
                operation: "add",
            }],
        });
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero", [addPending, accuracyCheck]),
        ]);

        execute(engine, {
            type: "attack",
            actor: "hero",
            move: addPending.id,
            targets: [],
        });
        expect(buffState(engine, "pending-kit")).toMatchObject({
            active: false,
            statuses: [{ id: "blinded", value: 1 }],
        });
        expect(characterState(engine).modifiers).toEqual({});
        expect(engine.getMoves("hero").some(({ move }) => move.id === granted.id)).toBe(false);
        expect(targetAccuracy(engine, "hero", accuracyCheck.id, "foe1")).toEqual({
            miss: 20,
            hit: 80,
        });

        execute(engine, { type: "endTurn" });
        expect(buffState(engine, "pending-kit")).toMatchObject({
            active: true,
            duration: 1,
            statuses: [{ id: "blinded", value: 1 }],
        });
        expect(characterState(engine).modifiers).toEqual({ hit: -3, defense: -3 });
        expect(engine.getMoves("hero").some(({ move }) => move.id === granted.id)).toBe(true);
        expect(targetAccuracy(engine, "hero", accuracyCheck.id, "foe1")).toEqual({
            miss: 50,
            hit: 50,
        });

        execute(engine, {
            type: "attack",
            actor: "hero",
            move: granted.id,
            targets: ["foe1"],
        });
        execute(engine, { type: "endTurn" });
        expect(buffState(engine, "pending-kit")).toBeUndefined();
        expect(characterState(engine).modifiers).toEqual({});
        expect(engine.getMoves("hero").some(({ move }) => move.id === granted.id)).toBe(false);
        expect(targetAccuracy(engine, "hero", accuracyCheck.id, "foe1")).toEqual({
            miss: 20,
            hit: 80,
        });
    });
});
