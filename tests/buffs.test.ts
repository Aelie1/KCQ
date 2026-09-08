import { describe, expect, it } from "vitest";
import { addBuff, removeBuff, tickBuffs } from "../src/engine/buffs";
import { bindingThresholds } from "../src/engine/constants";
import type {
    iBuff,
    iCharacter,
    iEnemy,
    iGameState,
    StatusDef,
} from "../src/engine/itypes";
import { serializeGameState } from "../src/engine/serialize";
import { getModifier, getStatuses } from "../src/engine/status";
import {
    makeBinding,
    makeBindingDef,
    makeCharacter,
    makeEnemy,
    makeEnemyDef,
    makeWaitMove,
} from "./helpers";

const modifierStatus: StatusDef = {
    id: "blinded",
    levels: [
        {},
        { modifiers: { hit: -2, defense: -3 } },
        { modifiers: { hit: -4, defense: -6 } },
    ],
};

function makeBuff(overrides: Partial<iBuff> = {}): iBuff {
    return {
        id: "test-buff",
        duration: 2,
        active: true,
        statuses: [{ definition: modifierStatus, value: 1 }],
        ...overrides,
    };
}

function makeTestEnemy(id = "foe1"): iEnemy {
    return makeEnemy(makeEnemyDef("foe", [makeWaitMove()]), id);
}

function makeState(
    characters: iCharacter[] = [],
    enemies: iEnemy[] = [],
): iGameState {
    return {
        turn: { round: 1, step: 1, phase: "player" },
        nextEntityId: 1,
        characters,
        enemies,
    };
}

describe("buff lifecycle", () => {
    it("adds a player-created buff as active and emits buffAdded", () => {
        const actor = makeCharacter("hero");
        const target = makeTestEnemy();
        const buff = makeBuff({ active: false });

        expect(addBuff(actor, target, buff)).toEqual([{
            type: "buffAdded",
            target: target.id,
            buff: buff.id,
        }]);
        expect(target.buffs).toHaveLength(1);
        expect(target.buffs[0]).toMatchObject({ id: buff.id, active: true });
        expect(target.buffs[0]).not.toBe(buff);
    });

    it("adds an enemy-created buff as inactive", () => {
        const actor = makeTestEnemy();
        const target = makeCharacter("hero");

        expect(addBuff(actor, target, makeBuff())).toEqual([{
            type: "buffAdded",
            target: target.id,
            buff: "test-buff",
        }]);
        expect(target.buffs[0].active).toBe(false);
    });

    it("ignores inactive statuses, then activates them without losing duration", () => {
        const actor = makeTestEnemy();
        const target = makeCharacter("hero");
        addBuff(actor, target, makeBuff({ duration: 3 }));

        expect(getStatuses(target)).toEqual([]);
        expect(getModifier(target, "hit")).toBe(0);

        expect(tickBuffs(makeState([target], [actor]))).toEqual([]);
        expect(target.buffs[0]).toMatchObject({ active: true, duration: 3 });
        expect(getStatuses(target)).toEqual([{
            definition: modifierStatus,
            value: 1,
        }]);
        expect(getModifier(target, "hit")).toBe(-2);
    });

    it("decrements active finite buffs and removes them at zero", () => {
        const target = makeCharacter("hero");
        target.buffs.push(makeBuff({ duration: 2 }));
        const state = makeState([target]);

        expect(tickBuffs(state)).toEqual([]);
        expect(target.buffs[0].duration).toBe(1);

        expect(tickBuffs(state)).toEqual([{
            type: "buffRemoved",
            target: target.id,
            buff: "test-buff",
        }]);
        expect(target.buffs).toEqual([]);
    });

    it("leaves active infinite buffs indefinitely", () => {
        const target = makeCharacter("hero");
        const buff = makeBuff({ duration: "infinite" });
        target.buffs.push(buff);

        expect(tickBuffs(makeState([target]))).toEqual([]);
        expect(target.buffs).toEqual([buff]);
        expect(buff.duration).toBe("infinite");
    });

    it("activates an inactive infinite buff without removing it", () => {
        const target = makeTestEnemy();
        const buff = makeBuff({ duration: "infinite", active: false });
        target.buffs.push(buff);

        expect(tickBuffs(makeState([], [target]))).toEqual([]);
        expect(target.buffs).toEqual([buff]);
        expect(buff).toMatchObject({ duration: "infinite", active: true });
    });

    it("allows duplicate ids and removes only the supplied object instance", () => {
        const target = makeCharacter("hero");
        const first = makeBuff({ duration: 1 });
        const second = makeBuff({ duration: 4 });
        target.buffs.push(first, second);

        expect(target.buffs.map((buff) => buff.id)).toEqual([
            "test-buff",
            "test-buff",
        ]);
        expect(removeBuff(target, first)).toEqual([{
            type: "buffRemoved",
            target: target.id,
            buff: first.id,
        }]);
        expect(target.buffs).toEqual([second]);
        expect(removeBuff(target, { ...second })).toEqual([]);
        expect(target.buffs).toEqual([second]);
    });

    it("safely removes multiple expiring buffs in one tick", () => {
        const character = makeCharacter("hero");
        const enemy = makeTestEnemy();
        character.buffs.push(
            makeBuff({ id: "first", duration: 1 }),
            makeBuff({ id: "second", duration: 1 }),
        );
        enemy.buffs.push(makeBuff({ id: "third", duration: 1 }));

        expect(tickBuffs(makeState([character], [enemy]))).toEqual([
            { type: "buffRemoved", target: character.id, buff: "first" },
            { type: "buffRemoved", target: character.id, buff: "second" },
            { type: "buffRemoved", target: enemy.id, buff: "third" },
        ]);
        expect(character.buffs).toEqual([]);
        expect(enemy.buffs).toEqual([]);
    });

    it("preserves linkedEntity when serialized", () => {
        const character = makeCharacter("hero");
        character.buffs.push(makeBuff({ linkedEntity: "foe1" }));

        expect(serializeGameState(makeState([character])).characters[0].buffs[0])
            .toMatchObject({ linkedEntity: "foe1" });
    });
});

describe("buff status integration", () => {
    it("includes active buff statuses and modifiers for characters and enemies", () => {
        const character = makeCharacter("hero");
        const enemy = makeTestEnemy();
        character.buffs.push(makeBuff());
        enemy.buffs.push(makeBuff());

        for (const entity of [character, enemy]) {
            expect(getStatuses(entity)).toEqual([{
                definition: modifierStatus,
                value: 1,
            }]);
            expect(getModifier(entity, "hit")).toBe(-2);
            expect(getModifier(entity, "defense")).toBe(-3);
        }
    });

    it("uses the maximum value when a binding and buff provide the same status", () => {
        const source = makeBindingDef("blindfold", {
            easy: [{ definition: modifierStatus, value: 1 }],
        });
        const character = makeCharacter("hero", [
            makeBinding(source, bindingThresholds.easy),
        ]);
        character.buffs.push(makeBuff({
            statuses: [{ definition: modifierStatus, value: 2 }],
        }));

        expect(getStatuses(character)).toEqual([{
            definition: modifierStatus,
            value: 2,
        }]);
        expect(getModifier(character, "hit")).toBe(-4);
    });
});
