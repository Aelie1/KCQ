import { describe, expect, it, vi } from "vitest";
import { loadGameState } from "../../src/engine/private/save";
import type { CallbackDef, StatusDef, TrapDef } from "../../src/engine/protected/definitions";
import type { iEnemy } from "../../src/engine/protected/types";
import { createGameEngine } from "../../src/engine/public/engine";
import type { SaveState } from "../../src/engine/public/save";
import type { PlayerAction } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { makeBindingDef, makeCharacterDef, makeEncounterDef, makeEnemyDef, makeMove, makeWaitMove } from "../helpers/helpers";
import { createTestCatalog } from "../helpers/testCatalog";

const jsonSave = (save: SaveState): SaveState => JSON.parse(JSON.stringify(save));

function battle() {
    const status: StatusDef = { id: "breathless", levels: [{}, { modifiers: { defense: 1 } }] };
    const binding = makeBindingDef("ropes");
    const callback: CallbackDef = {
        id: "shield",
        modifyDamage: vi.fn((_target, _buff, amount) => ({ value: Math.max(0, amount - 3), effects: [] })),
        modifyBinding: vi.fn((_state, _actor, _target, _buff, _binding, amount) => ({ value: amount / 2, effects: [] })),
    };
    const pendingCallback: CallbackDef = {
        id: "pending",
        modifyBinding: vi.fn(() => ({ value: 0, effects: [] })),
    };
    const strike = makeMove("strike", "arms", {
        accuracy: { miss: 10, graze: 20, hit: 60, crit: 10 },
        resolve: (_state, actor, _move, targets) => targets.map(target => ({
            type: "damage", source: actor, target: target.target as iEnemy,
            amount: 8 * target.effectiveness,
        })),
    });
    const blocked = makeMove("blocked");
    const summon = makeMove("summon", "none", {
        targets: 0, targetSide: "none", accuracy: undefined, cooldown: { summon: 2 },
        resolve: () => [{ type: "enemy", operation: "spawn", definition: "foe" }],
    });
    const threat = makeMove("threat", "none", {
        targetSide: "player", accuracy: { miss: 10, graze: 10, hit: 70, crit: 10 },
        resolve: (state, actor, _move, targets) => targets.flatMap(target => {
            const character = state.characters.find(x => x === target.target);
            return character ? [{
                type: "binding" as const, source: actor, target: character,
                binding, amount: 4 * target.effectiveness,
            }] : [];
        }),
    });
    const wait = makeWaitMove();
    const ai = vi.fn<ReturnType<typeof makeEnemyDef>["ai"]>((state, actor, rng) => [{
        type: "move", actor,
        move: { definition: threat, binding, data: { choice: rng.int(1, 100) } },
        targets: [state.characters[rng.int(0, state.characters.length - 1)]],
    }, {
        type: "move", actor, move: { definition: wait }, targets: [],
    }]);
    const foe = makeEnemyDef("foe", [threat, wait], ai);
    const hero = makeCharacterDef("hero", [strike, blocked]);
    const ally = makeCharacterDef("ally", [strike]);
    const trap: TrapDef = { id: "snare", outcomes: [], onTrigger: () => [] };
    const setup = vi.fn<NonNullable<ReturnType<typeof makeEncounterDef>["setup"]>>(state => {
        const character = state.characters[0];
        character.bonusEscapes = 1;
        character.data = { focus: 7 };
        character.cooldowns = { blocked: 3 };
        const enemy = state.enemies[0];
        enemy.data = { charge: 9 };
        enemy.cooldowns = { threat: 2 };
        enemy.currHp = 30;
        return [{
            type: "buff", target: character, operation: "add",
            buff: {
                id: "training", active: true, icon: "shield", severity: 2, duration: 6,
                statuses: [{ definition: status, value: 1 }], modifiers: { hit: 1 },
                moveList: { addedMoves: [summon], blockedMoves: [blocked] },
                linkedEntity: enemy.id, callback,
            },
        }, {
            type: "buff", target: character, operation: "add",
            buff: { id: "pending", active: false, duration: 2, modifiers: { hit: 20 }, callback: pendingCallback },
        }, {
            type: "buff", target: enemy, operation: "add",
            buff: { id: "shield", active: true, callback, linkedEntity: character.id },
        }, {
            type: "binding", source: enemy, target: character, binding, amount: 10,
        }];
    });
    const encounter = makeEncounterDef("battle", {
        enemies: [foe.id], bindings: [binding], traps: [{ definition: trap, amount: 24 }], setup,
    });
    const catalog = createTestCatalog({
        characters: [hero, ally], enemies: [foe], encounters: [encounter],
        moves: [summon], statuses: [status], callbacks: [callback, pendingCallback],
    });
    const engine = createGameEngine("test", catalog, 123456);
    engine.loadCharacter(hero.id);
    engine.loadCharacter(ally.id);
    engine.setDifficulty("veteran");
    engine.loadEncounter(encounter.id);
    expect(engine.executeAction({ type: "move", actor: hero.id, move: summon.id, targets: [] }).success).toBe(true);
    expect(engine.executeAction({ type: "stance", actor: ally.id }).success).toBe(true);
    return { engine, catalog, callback, pendingCallback, setup, ai };
}

describe("save restoration", () => {
    it("round-trips a nontrivial battle through JSON and rebuilds equal public views", () => {
        const { engine, catalog, setup, ai } = battle();
        const save = jsonSave(engine.getSaveState());
        const restored = createGameEngine("test", catalog, 999);
        setup.mockClear();
        ai.mockClear();
        restored.loadSaveState(save);
        expect(setup).not.toHaveBeenCalled();
        expect(ai).not.toHaveBeenCalled();
        expect(restored.getSeed()).toBe(123456);
        expect(restored.getSaveState()).toEqual(save);
        expect(restored.getGameState()).toEqual(engine.getGameState());
        expect(restored.getActionView()).toEqual(engine.getActionView());
        expect(save.enemies.map(x => x.id)).toEqual(["foe1", "foe2"]);
        expect(save.characters[0].buffs.map(x => x.active)).toEqual([true, false]);
        expect(save.characters[0].bindings).not.toHaveLength(0);
        expect(save.enemies[0].data).toEqual({ charge: 9 });
    });

    it("resolves definitions and intention actors and targets to the restored objects", () => {
        const { engine, catalog } = battle();
        const save = jsonSave(engine.getSaveState());
        save.enemies[0].intentions[0].rolls.push({ target: "foe2", roll: 17 });
        Object.assign(save.enemies[0].intentions[0].move, { band: "graze", effectiveness: 0.4 });
        save.enemies[0].intentions[1].resolved = true;
        const state = loadGameState(save, catalog);
        const hero = state.characters[0];
        const enemy = state.enemies[0];
        const intention = enemy.intentions[0];
        expect(hero.definition).toBe(catalog.characters[0]);
        expect(hero.bindings[0].definition).toBe(catalog.bindings[0]);
        expect(hero.buffs[0].callback).toBe(catalog.callbacks[0]);
        expect(hero.buffs[0].statuses![0].definition).toBe(catalog.statuses[0]);
        expect(hero.buffs[0].moveList!.addedMoves![0]).toBe(catalog.moves.find(x => x.id === "summon"));
        expect(hero.buffs[0].moveList!.blockedMoves![0]).toBe(catalog.moves.find(x => x.id === "blocked"));
        expect(enemy.definition).toBe(catalog.enemies[0]);
        expect(intention.actor).toBe(enemy);
        expect(intention.rolls[0].target).toBe(state.characters.find(x => x.id === save.enemies[0].intentions[0].rolls[0].target));
        expect(intention.rolls[1].target).toBe(state.enemies[1]);
        expect(intention.move.definition).toBe(catalog.moves.find(x => x.id === "threat"));
        expect(intention.move.binding).toBe(catalog.bindings[0]);
        expect(intention.move).toMatchObject({ band: "graze", effectiveness: 0.4 });
        expect(enemy.intentions[1]).toMatchObject({ resolved: true, rolls: [{ target: null }] });
        expect(state.traps[0].definition).toBe(catalog.traps[0]);
        expect(state.encounter).toBe(catalog.encounters[0]);
    });

    it("continues identically with both RNG streams, callbacks, cooldowns, and further spawns", () => {
        const { engine, catalog, callback, pendingCallback } = battle();
        const restored = createGameEngine("test", catalog, 42);
        const save = jsonSave(engine.getSaveState());
        restored.loadSaveState(save);
        vi.mocked(callback.modifyBinding!).mockClear();
        vi.mocked(callback.modifyDamage!).mockClear();
        const actions: PlayerAction[] = [
            { type: "endTurn" },
            { type: "move", actor: "hero", move: "strike", targets: ["foe1"] },
            { type: "endTurn" },
            { type: "move", actor: "hero", move: "summon", targets: [] },
            { type: "endTurn" },
            { type: "escape", actor: "hero", target: "hero", binding: "ropes" },
        ];
        for (const action of actions) {
            const pendingWasInactive = engine.getSaveState().characters[0].buffs.find(x => x.id === "pending")?.active === false;
            const result = engine.executeAction(action);
            expect(result.success).toBe(true);
            expect(restored.executeAction(action)).toEqual(result);
            if (pendingWasInactive) expect(pendingCallback.modifyBinding).not.toHaveBeenCalled();
            expect(restored.getGameState()).toEqual(engine.getGameState());
            expect(restored.getActionView()).toEqual(engine.getActionView());
            expect(restored.getSaveState()).toEqual(engine.getSaveState());
        }
        expect(callback.modifyBinding).toHaveBeenCalled();
        expect(callback.modifyDamage).toHaveBeenCalled();
        expect(pendingCallback.modifyBinding).toHaveBeenCalled();
        expect(engine.getSaveState().aiRng).not.toBe(save.aiRng);
        expect(engine.getSaveState().accRng).not.toBe(save.accRng);
        expect(engine.getGameState().enemies.map(x => x.id)).toContain("foe3");
    });

    it("does not retain mutable objects from the input save", () => {
        const { engine, catalog } = battle();
        const save = jsonSave(engine.getSaveState());
        const restored = createGameEngine("test", catalog, 42);
        restored.loadSaveState(save);
        const before = jsonSave(restored.getSaveState());
        save.turn.round++;
        save.nextId.foe++;
        save.characters[0].data.focus++;
        save.characters[0].cooldowns.blocked++;
        save.characters[0].bindings[0].data.changed = 1;
        save.characters[0].buffs[0].modifiers!.hit = 99;
        save.characters[0].buffs[0].statuses![0].value = 0;
        save.characters[0].buffs[0].moveList!.addedMoves!.length = 0;
        save.enemies[0].data.charge++;
        save.enemies[0].cooldowns.threat++;
        save.enemies[0].intentions[0].move.data!.choice++;
        save.enemies[0].intentions[0].rolls[0].roll++;
        save.traps[0].amount++;
        expect(restored.getSaveState()).toEqual(before);
    });

    it("restores empty engines and battles using the stock catalog", () => {
        const engine = createStockEngine(0);
        const restored = createStockEngine(2);
        restored.loadSaveState(jsonSave(engine.getSaveState()));
        expect(restored.getSaveState()).toEqual(engine.getSaveState());
        expect(restored.getGameState()).toEqual(engine.getGameState());
        expect(restored.getActionView()).toEqual([]);
        engine.loadCharacter("ko");
        engine.loadEncounter(engine.listEncounters()[0]);
        engine.executeAction({ type: "endTurn" });
        restored.loadSaveState(jsonSave(engine.getSaveState()));
        expect(restored.getGameState()).toEqual(engine.getGameState());
        expect(restored.getActionView()).toEqual(engine.getActionView());
        expect(restored.executeAction({ type: "endTurn" })).toEqual(engine.executeAction({ type: "endTurn" }));
    });
});

const invalidReferences: [string, (save: SaveState) => void][] = [
    ["character", save => { save.characters[0].id = "missing"; }],
    ["enemy", save => { save.enemies[0].defId = "missing"; }],
    ["binding", save => { save.characters[0].bindings[0].id = "missing"; }],
    ["trap", save => { save.traps[0].id = "missing"; }],
    ["status", save => { save.characters[0].buffs[0].statuses![0].id = "missing" as never; }],
    ["callback", save => { save.characters[0].buffs[0].callback = "missing"; }],
    ["added move", save => { save.characters[0].buffs[0].moveList!.addedMoves![0] = "missing"; }],
    ["blocked move", save => { save.characters[0].buffs[0].moveList!.blockedMoves![0] = "missing"; }],
    ["cooldown move", save => { save.characters[0].cooldowns.missing = 1; }],
    ["cooldown move", save => { save.enemies[0].cooldowns.missing = 1; }],
    ["intention move", save => { save.enemies[0].intentions[0].move.definition = "missing"; }],
    ["intention binding", save => { save.enemies[0].intentions[0].move.binding = "missing"; }],
    ["intention actor", save => { save.enemies[0].intentions[0].actor = "missing"; }],
    ["intention target", save => { save.enemies[0].intentions[0].rolls[0].target = "missing"; }],
    ["next-ID enemy", save => { save.nextId.missing = 2; }],
    ["encounter", save => { save.encounter = "missing"; }],
    ["difficulty", save => { save.difficulty = "missing" as never; }],
];

describe("atomic save restoration", () => {
    it.each(invalidReferences)("rejects an unknown %s without modifying the engine", (kind, corrupt) => {
        const { engine, catalog } = battle();
        const before = jsonSave(engine.getSaveState());
        const state = engine.getGameState();
        const actions = engine.getActionView();
        const control = createGameEngine("test", catalog, 3);
        control.loadSaveState(before);
        const invalid = jsonSave(before);
        invalid.seed = 99;
        invalid.aiRng = 123;
        invalid.accRng = 456;
        corrupt(invalid);
        expect(() => engine.loadSaveState(invalid)).toThrow(`Unknown ${kind} reference in save: missing`);
        expect(engine.getSaveState()).toEqual(before);
        expect(engine.getGameState()).toBe(state);
        expect(engine.getActionView()).toBe(actions);
        expect(engine.executeAction({ type: "endTurn" })).toEqual(control.executeAction({ type: "endTurn" }));
    });

    it("rejects a campaign mismatch without modifying state or cached views", () => {
        const { engine } = battle();
        const before = engine.getSaveState();
        const state = engine.getGameState();
        const actions = engine.getActionView();
        expect(() => engine.loadSaveState({ ...before, campaign: "other", seed: 9 }))
            .toThrow("Save campaign mismatch: expected test, received other");
        expect(engine.getSaveState()).toEqual(before);
        expect(engine.getGameState()).toBe(state);
        expect(engine.getActionView()).toBe(actions);
    });

    it("keeps the previous state and views when rebuilding a view throws", () => {
        const { engine, catalog } = battle();
        const before = jsonSave(engine.getSaveState());
        const state = engine.getGameState();
        const actions = engine.getActionView();
        const control = createGameEngine("test", catalog, 3);
        control.loadSaveState(before);
        const resolver = catalog.moves.find(x => x.id === "threat")!;
        const implementation = resolver.resolve;
        resolver.resolve = () => { throw new Error("Preview failed"); };
        try {
            expect(() => engine.loadSaveState({ ...before, seed: 9, aiRng: 123, accRng: 456 })).toThrow("Preview failed");
            expect(engine.getSaveState()).toEqual(before);
            expect(engine.getGameState()).toBe(state);
            expect(engine.getActionView()).toBe(actions);
        } finally {
            resolver.resolve = implementation;
        }
        expect(engine.executeAction({ type: "endTurn" })).toEqual(control.executeAction({ type: "endTurn" }));
    });
});

describe("save edge cases", () => {
    it("omits removed intention targets and continues without replacing them", () => {
        const threat = makeMove("watch", "none", { targetSide: "enemy" });
        const watcher = makeEnemyDef("watcher", [threat], (state, actor) => [{
            type: "move", actor, move: { definition: threat },
            targets: state.enemies.filter(x => x !== actor).slice(0, 1),
        }]);
        const doomed = makeEnemyDef("doomed", [makeWaitMove()]);
        const strike = makeMove("kill", "arms", {
            resolve: (_state, actor, _move, targets) => [{
                type: "damage", source: actor, target: targets[0].target as iEnemy, amount: 999,
            }],
        });
        const hero = makeCharacterDef("hero", [strike]);
        const encounter = makeEncounterDef("removed-target", { enemies: [watcher.id, doomed.id] });
        const catalog = createTestCatalog({ characters: [hero], enemies: [watcher, doomed], encounters: [encounter] });
        const engine = createGameEngine("test", catalog, 1);
        engine.loadCharacter(hero.id);
        engine.loadEncounter(encounter.id);
        expect(engine.executeAction({ type: "move", actor: hero.id, move: strike.id, targets: ["doomed1"] }).success).toBe(true);
        const save = jsonSave(engine.getSaveState());
        expect(save.enemies[0].intentions[0].rolls).toEqual([]);
        const restored = createGameEngine("test", catalog, 2);
        restored.loadSaveState(save);
        expect(restored.getGameState()).toEqual(engine.getGameState());
        expect(restored.getActionView()).toEqual(engine.getActionView());
        expect(restored.executeAction({ type: "endTurn" })).toEqual(engine.executeAction({ type: "endTurn" }));
    });

    it("rejects ambiguous entity IDs atomically", () => {
        const { engine } = battle();
        const before = jsonSave(engine.getSaveState());
        const state = engine.getGameState();
        const actions = engine.getActionView();
        const invalid = jsonSave(before);
        invalid.enemies[1].id = invalid.enemies[0].id;
        expect(() => engine.loadSaveState(invalid)).toThrow("Duplicate entity ID in save: foe1");
        expect(engine.getSaveState()).toEqual(before);
        expect(engine.getGameState()).toBe(state);
        expect(engine.getActionView()).toBe(actions);
    });
});
