import { describe, expect, it } from "vitest";
import { baseCatalog } from "../../src/content/base";
import { powerOfDenial } from "../../src/content/characters/ko";
import { skunkCatalog } from "../../src/content/skunk/content";
import { COLLAR_BUFF, DORMANT_BUFF } from "../../src/content/skunk/constants";
import { outside, tower_1, tower_2, tower_3 } from "../../src/content/skunk/encounters";
import { isEnemy } from "../../src/engine/protected/helpers";
import type { EncounterDef } from "../../src/engine/protected/definitions";
import { buffState, enemyState, execute, makeBehavioralCharacter, makeBehavioralMove, makeBehavioralEngine } from "../helpers/behavioralHelpers";
import { resolvedEvents } from "../helpers/events";
import { createTestEngine } from "../helpers/testCatalog";

const damage = (id: string, amount: number) => makeBehavioralMove(id, "none", {
    freeOnHit: true, alwaysAvailable: true,
    resolve: (_state, actor, _move, targets) => targets.flatMap(({ target }) => isEnemy(target)
        ? [{ type: "damage" as const, source: actor, target, amount }] : []),
});
const lethal = damage("lethal", 10_000);
const chip = damage("chip", 10);
const heal = damage("heal", -10_000);
const mend = damage("mend", -280);
const defeat = makeBehavioralMove("defeat", "none", {
    freeOnHit: true,
    resolve: (_state, _actor, _move, targets) => targets.flatMap(({ target }) => isEnemy(target)
        ? [{ type: "enemy" as const, operation: "defeat" as const, target }] : []),
});
function battle(encounter: EncounterDef = tower_3, seed = 1) {
    const hero = makeBehavioralCharacter("hero", [lethal, chip, heal, mend, defeat, powerOfDenial]);
    const engine = createTestEngine([encounter], [hero], seed, { ...skunkCatalog, statuses: [...baseCatalog.statuses!, ...skunkCatalog.statuses!] });
    engine.loadCharacter(hero.id);
    engine.loadEncounter(encounter.id);
    return engine;
}
const cast = (engine: ReturnType<typeof battle>, move: string, target: string) =>
    execute(engine, { type: "move", actor: "hero", move, targets: [target] });
const eliteId = "skunketteQueen1";

describe("Elite dormancy through engine effect resolution", () => {
    it.each([tower_1, tower_2, tower_3, outside])("keeps a lethally damaged Elite dormant in $id", encounter => {
        const engine = battle(encounter, 4);
        if (!engine.getActionView()[0]!.available) execute(engine, { type: "endTurn" });
        const result = cast(engine, lethal.id, eliteId);
        expect(enemyState(engine, eliteId)).toMatchObject({ currHp: 0, skipped: true, rank: "elite" });
        expect(buffState(engine, DORMANT_BUFF, eliteId)?.statuses).toEqual([{ id: "dormant", value: 1 }]);
        expect(resolvedEvents(result.frames)).not.toContainEqual({ type: "enemyDefeated", target: eliteId });
    });
    it.each([defeat.id, powerOfDenial.id])("routes direct defeat from %s through dormancy", move => {
        const engine = battle();
        const result = cast(engine, move, eliteId);
        expect(enemyState(engine, eliteId)).toMatchObject({ currHp: 0, skipped: true });
        expect(buffState(engine, DORMANT_BUFF, eliteId)).toBeDefined();
        expect(resolvedEvents(result.frames)).not.toContainEqual({ type: "enemyDefeated", target: eliteId });
    });
    it("skips dormant turns, regenerates, and resumes only after full recovery", () => {
        const engine = battle();
        cast(engine, lethal.id, eliteId);
        const phase = execute(engine, { type: "endTurn" });
        expect(resolvedEvents(phase.frames).filter(event => event.type === "useMove" && event.actor === eliteId)).toEqual([]);
        expect(resolvedEvents(phase.frames)).toContainEqual({ type: "enemyHealed", target: eliteId, amount: 10 });
        expect(enemyState(engine, eliteId)).toMatchObject({ currHp: 10, skipped: true });
        cast(engine, heal.id, eliteId);
        expect(enemyState(engine, eliteId)).toMatchObject({ currHp: 300, skipped: false });
        expect(buffState(engine, DORMANT_BUFF, eliteId)).toBeUndefined();
        const recovered = execute(engine, { type: "endTurn" });
        expect(resolvedEvents(recovered.frames)).toContainEqual(expect.objectContaining({ type: "useMove", actor: eliteId }));
    });
    it("lets damage delay recovery without duplicating Dormant", () => {
        const engine = battle();
        cast(engine, lethal.id, eliteId);
        execute(engine, { type: "endTurn" });
        cast(engine, chip.id, eliteId);
        expect(enemyState(engine, eliteId).currHp).toBe(0);
        expect(enemyState(engine, eliteId).buffs.filter(buff => buff.id === DORMANT_BUFF)).toHaveLength(1);
        execute(engine, { type: "endTurn" });
        expect(enemyState(engine, eliteId)).toMatchObject({ currHp: 10, skipped: true });
    });
    it.each([lethal.id, defeat.id])("removes collars before defeating dormant Elites when their Queen dies from %s", move => {
        const engine = battle(outside);
        cast(engine, lethal.id, eliteId);
        execute(engine, { type: "endTurn" });
        expect(enemyState(engine, eliteId)).toMatchObject({ currHp: 10, skipped: true });
        const result = cast(engine, move, "goddess");
        expect(resolvedEvents(result.frames)).toContainEqual({ type: "buffRemoved", target: eliteId, buff: COLLAR_BUFF });
        expect(resolvedEvents(result.frames)).toContainEqual({ type: "enemyDefeated", target: eliteId });
        expect(engine.getGameState().enemies.map(enemy => enemy.id)).not.toContain(eliteId);
        expect(buffState(engine, COLLAR_BUFF, "skunkEmpress1")).toBeUndefined();
        expect(enemyState(engine, "skunkEmpress1").currHp).toBeGreaterThan(0);
        const finish = cast(engine, lethal.id, "skunkEmpress1");
        expect(resolvedEvents(finish.frames)).toContainEqual({ type: "enemyDefeated", target: "skunkEmpress1" });
        expect(engine.getGameState().enemies).toEqual([]);
    });
    it("allows the Skunk Empress's own Latex Explosion to trigger dormancy", () => {
        const encounter: EncounterDef = { ...outside, setup: state => [
            ...outside.setup!(state),
            { type: "damage", source: state.characters[0]!,
                target: state.enemies.find(enemy => enemy.defId === "skunkEmpress")!, amount: 449 },
        ] };
        const engine = battle(encounter, 1);
        expect(enemyState(engine, "skunkEmpress1").intentions.some(intention => intention.move === "latexExplosion")).toBe(true);
        const phase = execute(engine, { type: "endTurn" });
        expect(resolvedEvents(phase.frames)).toContainEqual(expect.objectContaining({ type: "useMove", actor: "skunkEmpress1", move: "latexExplosion" }));
        expect(buffState(engine, DORMANT_BUFF, "skunkEmpress1")).toBeDefined();
        expect(resolvedEvents(phase.frames)).not.toContainEqual({ type: "enemyDefeated", target: "skunkEmpress1" });
    });
    it("restores the collar callback and dormant status through JSON save/load", () => {
        const engine = battle();
        cast(engine, lethal.id, eliteId);
        const restored = battle();
        restored.loadSaveState(JSON.parse(JSON.stringify(engine.getSaveState())));
        expect(restored.getGameState()).toEqual(engine.getGameState());
        execute(restored, { type: "endTurn" });
        expect(enemyState(restored, eliteId)).toMatchObject({ currHp: 10, skipped: true });
        cast(restored, heal.id, eliteId);
        expect(buffState(restored, DORMANT_BUFF, eliteId)).toBeUndefined();
        cast(restored, defeat.id, eliteId);
        expect(enemyState(restored, eliteId)).toMatchObject({ currHp: 0, skipped: true });
    });
});

it("removes Dormant at full HP reached by the normal regeneration tick", () => {
    const engine = battle();
    cast(engine, lethal.id, eliteId);
    execute(engine, { type: "endTurn" });
    cast(engine, mend.id, eliteId);
    expect(enemyState(engine, eliteId)).toMatchObject({ currHp: 290, skipped: true });
    const phase = execute(engine, { type: "endTurn" });
    expect(enemyState(engine, eliteId)).toMatchObject({ currHp: 300, skipped: false });
    expect(buffState(engine, DORMANT_BUFF, eliteId)).toBeUndefined();
    expect(resolvedEvents(phase.frames)).toContainEqual({ type: "buffRemoved", target: eliteId, buff: DORMANT_BUFF });
});
it.each([lethal, defeat, powerOfDenial])("normally defeats an unprotected enemy using $id", move => {
    const engine = makeBehavioralEngine([makeBehavioralCharacter("hero", [move])]);
    const result = cast(engine, move.id, "foe1");
    expect(resolvedEvents(result.frames)).toContainEqual({ type: "enemyDefeated", target: "foe1" });
    expect(engine.getGameState().enemies).toEqual([]);
});
