import { describe, expect, it, vi } from "vitest";
import { baseCatalog } from "../../src/content/base";
import { skunkCatalog } from "../../src/content/skunk/content";
import { healingPerfume, queen, skunkPerfume } from "../../src/content/skunk/queen";
import type { EnemyDef } from "../../src/engine/protected/definitions";
import { Random } from "../../src/engine/protected/random";
import { createStockEngine } from "../../src/stock";
import { enemyState, execute, makeBehavioralCharacter, makeBehavioralEnemy } from "../helpers/behavioralHelpers";
import { makeCharacter, makeEncounterDef, makeEnemy } from "../helpers/helpers";
import { makeInternalState } from "../helpers/state";
import { resolvedEvents } from "../helpers/events";
import { createTestEngine } from "../helpers/testCatalog";

const ally = makeBehavioralEnemy("ally");
ally.hp = 100;
const elite: EnemyDef = { ...ally, id: "elite", rank: "elite" };
const minion: EnemyDef = { ...ally, id: "minion", rank: "minion" };
function battle(seed = 1, healing = true, perfumeCooldown = healing ? 1 : 0) {
    const encounter = makeEncounterDef("perfumes", {
        enemies: [queen.id, ally.id, elite.id, minion.id],
        setup: state => {
            const actor = state.enemies[0]!;
            actor.cooldowns = { skunkCollar: 99, skunkPerfume: perfumeCooldown };
            state.enemies.slice(1).forEach(enemy => { enemy.currHp = 1; });
            return [];
        },
    });
    const hero = makeBehavioralCharacter();
    const engine = createTestEngine([encounter], [hero], seed, {
        ...skunkCatalog, enemies: [...skunkCatalog.enemies!, ally, elite, minion],
        statuses: [...baseCatalog.statuses!, ...skunkCatalog.statuses!],
    });
    engine.loadCharacter(hero.id);
    engine.loadEncounter(encounter.id);
    return engine;
}

describe("separate Queen perfumes", () => {
    it.each([skunkPerfume, healingPerfume])("registers $id in the stock content catalog", move => {
        expect(createStockEngine().getLibrary().moves[move.id]).toMatchObject({ id: move.id, traits: move.traits, targetSide: move.targetSide });
    });
    it.each([false, true])("round-trips pending intentions and deterministic execution (healing: %s)", healing => {
        const engine = battle(1, healing);
        const move = healing ? healingPerfume : skunkPerfume;
        expect(enemyState(engine, "queen1").intentions[0]!.move).toBe(move.id);
        const restored = battle(999, !healing);
        restored.loadSaveState(JSON.parse(JSON.stringify(engine.getSaveState())));
        expect(restored.getGameState()).toEqual(engine.getGameState());
        expect(execute(restored, { type: "endTurn" })).toEqual(execute(engine, { type: "endTurn" }));
        expect(restored.getSaveState()).toEqual(engine.getSaveState());
    });
    it("buffs ordinary and Elite allies, excludes the Queen and minions, and emits no player misses", () => {
        const engine = battle();
        const intention = enemyState(engine, "queen1").intentions[0]!;
        expect(intention).toMatchObject({ move: "healingPerfume", effects: [] });
        expect(intention.targets.map(target => target.target)).toEqual(["ally1", "elite1"]);
        expect(intention.targets.map(target => target.band)).toEqual(["none", "none"]);
        for (const target of intention.targets) expect(target.effects).toMatchObject([{
            type: "buff", operation: "add", target: target.target,
            buff: { id: "regenPerfume", duration: 3, modifiers: { regeneration: 1 } },
        }]);
        const result = execute(engine, { type: "endTurn" });
        const used = resolvedEvents(result.frames).find(event => event.type === "useMove" && event.actor === "queen1");
        expect(used).toMatchObject({ move: "healingPerfume", targets: [{ target: "ally1", result: "none" }, { target: "elite1", result: "none" }] });
        expect(enemyState(engine, "ally1")).toMatchObject({ currHp: 1, buffs: [{ id: "regenPerfume", duration: 3 }] });
        expect(enemyState(engine, "elite1").currHp).toBe(1);
        expect(enemyState(engine, "minion1").currHp).toBe(1);
        expect(enemyState(engine, "queen1").buffs).toEqual([]);
        expect(engine.getGameState().characters[0]!.buffs).toEqual([]);
        execute(engine, { type: "endTurn" });
        expect(enemyState(engine, "ally1")).toMatchObject({ currHp: 11, buffs: [{ id: "regenPerfume", duration: 2 }] });
        execute(engine, { type: "endTurn" });
        expect(enemyState(engine, "ally1")).toMatchObject({ currHp: 21, buffs: [{ id: "regenPerfume", duration: 1 }] });
        execute(engine, { type: "endTurn" });
        expect(enemyState(engine, "ally1")).toMatchObject({ currHp: 31, buffs: [] });
        expect(enemyState(engine, "elite1")).toMatchObject({ currHp: 31, buffs: [] });
        execute(engine, { type: "endTurn" });
        expect(enemyState(engine, "ally1").currHp).toBe(31);
    });
    it.each([false, true])("applies own and cross cooldowns (healing: %s)", healing => {
        const engine = battle(1, healing);
        execute(engine, { type: "endTurn" });
        expect(enemyState(engine, "queen1").cooldowns).toMatchObject(healing
            ? { healingPerfume: 4, skunkPerfume: 1 }
            : { skunkPerfume: 4, healingPerfume: 1 });
        expect(enemyState(engine, "queen1").intentions[0]!.move).toBe("skunkGun");
    });
    it.each([
        [0, 0, "skunkGun"], [0, 0.01, "healingPerfume"],
        [25, 0.25, "skunkGun"], [25, 0.26, "healingPerfume"],
        [75, 0.5, "skunkGun"], [75, 0.76, "healingPerfume"],
        [100, 0.99, "skunkGun"],
    ])("selects healing above the allied HP ratio (HP %s, roll %s)", (hp, roll, expected) => {
        const actor = makeEnemy(queen);
        actor.cooldowns = { skunkCollar: 99, skunkPerfume: 99 };
        const target = makeEnemy(ally);
        target.currHp = hp;
        const state = makeInternalState({ characters: [makeCharacter()], enemies: [actor, target] });
        const rng = new Random(1);
        vi.spyOn(rng, "random").mockReturnValue(roll);
        expect(queen.ai(state, actor, rng)[0]!.move.definition.id).toBe(expected);
    });
});

it("does not shorten an existing longer perfume cooldown", () => {
    const engine = battle(1, true, 99);
    execute(engine, { type: "endTurn" });
    expect(enemyState(engine, "queen1").cooldowns).toMatchObject({ skunkPerfume: 98, healingPerfume: 4 });
});
