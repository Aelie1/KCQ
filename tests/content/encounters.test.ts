import { describe, expect, it } from "vitest";
import { ko } from "../../src/content/characters/ko";
import { encounterList } from "../../src/content/content";
import { plains_1, plains_2 } from "../../src/content/skunk/encounters";
import { trapPuddle } from "../../src/content/skunk/puddles";
import { skunk } from "../../src/content/skunk/skunk";
import { skunkette } from "../../src/content/skunk/skunkette";
import type { EncounterDef } from "../../src/engine/protected/definitions";
import { createCustomEngine } from "../../src/engine/protected/engine";
import { actionView } from "../helpers/gameView";
import { makeEnemyDef, makeWaitMove } from "../helpers/helpers";
import {
    basicAttackingEnemy,
    multiEnemyEncounter,
    oneEnemyEncounter,
    testCharacterList,
    testHero,
    waitEnemy,
} from "../helpers/testContent";

describe("encounters", () => {
    it("lists only ids from the injected catalogue and returns a fresh array", () => {
        const catalogue = [oneEnemyEncounter, multiEnemyEncounter];
        const engine = createCustomEngine(catalogue, testCharacterList, 1);

        const listedIds = engine.listEncounters();
        expect(listedIds).toEqual(catalogue.map((encounter) => encounter.id));
        expect(listedIds).not.toContain(plains_1.id);

        listedIds.push("client-only");
        expect(engine.listEncounters()).toEqual(
            catalogue.map((encounter) => encounter.id),
        );
    });

    it("searches only the injected catalogue", () => {
        const engine = createCustomEngine([oneEnemyEncounter], testCharacterList, 1);
        engine.loadCharacter(testHero.id);

        expect(engine.loadEncounter(plains_1.id)).toEqual({
            type: "loadEncounter",
            id: plains_1.id,
            success: false,
            bindings: [],
            effects: [],
        });
        expect(engine.getGameView().enemies).toEqual([]);
    });

    it("does not mutate combat state or consume an entity id for an unknown id", () => {
        const engine = createCustomEngine([oneEnemyEncounter], testCharacterList, 1);
        engine.loadCharacter(testHero.id);
        const before = engine.getGameView();

        expect(engine.loadEncounter("missing-encounter")).toEqual({
            type: "loadEncounter",
            id: "missing-encounter",
            success: false,
            bindings: [],
            effects: [],
        });
        expect(engine.getGameView()).toEqual(before);

        expect(engine.loadEncounter(oneEnemyEncounter.id)).toEqual({
            type: "loadEncounter", id: oneEnemyEncounter.id, success: true, bindings: [],
            effects: [{ type: "enemySpawned", target: `${waitEnemy.id}1` }],
        });
    });

    it("emits incrementing runtime enemy ids when replacing an encounter", () => {
        const engine = createCustomEngine([oneEnemyEncounter], testCharacterList, 1);
        engine.loadCharacter(testHero.id);

        const first = engine.loadEncounter(oneEnemyEncounter.id);
        const second = engine.loadEncounter(oneEnemyEncounter.id);

        expect(first.effects[0]).toEqual({ type: "enemySpawned", target: `${waitEnemy.id}1` });
        expect(second.effects[0]).toEqual({ type: "enemySpawned", target: `${waitEnemy.id}1` });
        expect(engine.getGameView().enemies.map((enemy) => enemy.id)).toEqual([
            `${waitEnemy.id}1`,
        ]);
    });

    it("starts enemy numbering at one for each engine instance", () => {
        const loadFirstEnemy = () => {
            const engine = createCustomEngine([oneEnemyEncounter], testCharacterList, 1);
            engine.loadCharacter(testHero.id);
            return engine.loadEncounter(oneEnemyEncounter.id).effects[0];
        };

        expect(loadFirstEnemy()).toEqual({
            type: "enemySpawned",
            target: `${waitEnemy.id}1`,
        });
        expect(loadFirstEnemy()).toEqual({
            type: "enemySpawned",
            target: `${waitEnemy.id}1`,
        });
    });

    it("loads every enemy in a multi-enemy encounter through the public API", () => {
        const engine = createCustomEngine([multiEnemyEncounter], testCharacterList, 1);
        engine.loadCharacter(testHero.id);

        const events = engine.loadEncounter(multiEnemyEncounter.id);

        expect(events).toEqual({
            type: "loadEncounter", id: multiEnemyEncounter.id, success: true, bindings: [],
            effects: [
                { type: "enemySpawned", target: "foe1" },
                { type: "enemySpawned", target: "attacker1" },
            ],
        });
        expect(engine.getGameView().enemies).toEqual([
            expect.objectContaining({
                id: "foe1",
                maxHp: waitEnemy.hp,
                intentions: expect.any(Array),
            }),
            expect.objectContaining({
                id: "attacker1",
                maxHp: basicAttackingEnemy.hp,
                intentions: expect.any(Array),
            }),
        ]);
    });

    it("runs setup after spawning enemies and before calculating intentions", () => {
        const calls: string[] = [];
        let enemiesVisibleToSetup: string[] = [];
        const wait = makeWaitMove();
        const enemy = makeEnemyDef("setup-foe", [wait], (state, actor) => {
            calls.push("ai");
            if (actor.data.setup !== 7) return [];
            return [{
                type: "move",
                actor,
                move: { definition: wait },
                targets: [],
            }];
        });
        const encounter: EncounterDef = {
            id: "test-setup",
            enemies: [enemy],
            bindings: [],
            traps: [],
            setup: (state) => {
                calls.push("setup");
                enemiesVisibleToSetup = state.enemies.map((loaded) => loaded.id);
                return [{
                    type: "data",
                    target: state.enemies[0],
                    name: "setup",
                    amount: 7,
                }];
            },
        };
        const engine = createCustomEngine([encounter], testCharacterList, 1);
        engine.loadCharacter(testHero.id);

        expect(engine.loadEncounter(encounter.id)).toEqual({
            type: "loadEncounter", id: encounter.id, success: true, bindings: [],
            effects: [{ type: "enemySpawned", target: `${enemy.id}1` }],
        });
        expect(calls).toEqual(["setup", "ai"]);
        expect(enemiesVisibleToSetup).toEqual([`${enemy.id}1`]);
        expect(engine.getGameView().enemies[0].intentions).toMatchObject([{
            move: wait.id,
            targets: [],
            effects: [],
        }]);
    });

    it("loads the authored catalogue when it is explicitly injected", () => {
        const engine = createCustomEngine(encounterList, [ko], 8224);
        engine.loadCharacter(ko.id);

        const events = engine.loadEncounter(plains_1.id);

        expect(events).toMatchObject({
            type: "loadEncounter",
            id: plains_1.id,
            success: true,
            bindings: plains_1.bindings.map(({ id }) => id),
        });
        expect(events.effects.filter((event) => event.type === "enemySpawned"))
            .toHaveLength(plains_1.enemies.length);
        expect(engine.getGameView().enemies).toHaveLength(plains_1.enemies.length);
    });

    it("catalogues and loads plains_2 with Skunks, puddles, and valid intentions", () => {
        expect(encounterList).toContain(plains_2);
        expect(plains_2.id).toBe("plains_2");
        expect(plains_2.enemies.map(({ id }) => id)).toEqual([
            skunkette.id, skunkette.id, skunk.id, skunk.id,
        ]);
        expect(plains_2.traps).toEqual([{ definition: trapPuddle, amount: 50 }]);

        const engine = createCustomEngine(encounterList, [ko], 8224);
        engine.loadCharacter(ko.id);
        const events = engine.loadEncounter(plains_2.id);
        const state = engine.getGameView();

        expect(events).toMatchObject({
            type: "loadEncounter",
            id: plains_2.id,
            success: true,
            bindings: plains_2.bindings.map(({ id }) => id),
        });
        expect(state.encounter).toEqual({
            id: plains_2.id,
            enemies: [skunkette.id, skunkette.id, skunk.id, skunk.id],
            bindings: plains_2.bindings.map(({ id }) => id),
            traps: [trapPuddle.id],
        });
        expect(state.traps).toEqual([{ id: trapPuddle.id, amount: 50 }]);
        expect(state.enemies.map(({ id }) => id)).toEqual([
            "skunkette1", "skunkette2", "skunk1", "skunk2",
        ]);
        expect(state.enemies.every(({ intentions: intention }) => intention.length > 0)).toBe(true);
        expect(state.enemies.every(({ intentions: intention }) =>
            intention.every(({ targets }) => targets.every(({ target }) =>
                state.characters.some(({ id }) => id === target),
            )),
        )).toBe(true);
        expect(actionView(engine, ko.id).moves.some(({ available }) => available)).toBe(true);
    });
});
