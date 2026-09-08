import { describe, expect, it } from "vitest";
import { ko } from "../src/content/characters/ko";
import { encounterList } from "../src/content/content";
import { plains_1 } from "../src/content/skunk/encounters";
import { GameEngine } from "../src/engine/engine";
import type { EncounterDef } from "../src/engine/itypes";
import { makeCharacterDef, makeEnemyDef, makeWaitMove } from "./helpers";
import {
    multiEnemyEncounter,
    oneEnemyEncounter,
    waitEnemy,
} from "./testContent";

describe("encounters", () => {
    it("lists only ids from the injected catalogue and returns a fresh array", () => {
        const catalogue = [oneEnemyEncounter, multiEnemyEncounter];
        const engine = new GameEngine(catalogue, 1);

        const listedIds = engine.listEncounters();
        expect(listedIds).toEqual(catalogue.map((encounter) => encounter.id));
        expect(listedIds).not.toContain(plains_1.id);

        listedIds.push("client-only");
        expect(engine.listEncounters()).toEqual(
            catalogue.map((encounter) => encounter.id),
        );
    });

    it("searches only the injected catalogue", () => {
        const engine = new GameEngine([oneEnemyEncounter], 1);
        engine.loadCharacter(makeCharacterDef("hero"));

        expect(engine.loadEncounter(plains_1.id)).toEqual([{
            type: "encounter",
            id: plains_1.id,
            success: false,
        }]);
        expect(engine.getGameState().enemies).toEqual([]);
    });

    it("does not mutate combat state or consume an entity id for an unknown id", () => {
        const engine = new GameEngine([oneEnemyEncounter], 1);
        engine.loadCharacter(makeCharacterDef("hero"));
        const before = engine.getGameState();

        expect(engine.loadEncounter("missing-encounter")).toEqual([{
            type: "encounter",
            id: "missing-encounter",
            success: false,
        }]);
        expect(engine.getGameState()).toEqual(before);

        expect(engine.loadEncounter(oneEnemyEncounter.id)).toEqual([
            { type: "enemySpawned", target: `${waitEnemy.id}1` },
            { type: "encounter", id: oneEnemyEncounter.id, success: true },
        ]);
    });

    it("emits runtime enemy ids and increments them within one engine", () => {
        const engine = new GameEngine([oneEnemyEncounter], 1);
        engine.loadCharacter(makeCharacterDef("hero"));

        const first = engine.loadEncounter(oneEnemyEncounter.id);
        const second = engine.loadEncounter(oneEnemyEncounter.id);

        expect(first[0]).toEqual({ type: "enemySpawned", target: `${waitEnemy.id}1` });
        expect(second[0]).toEqual({ type: "enemySpawned", target: `${waitEnemy.id}2` });
        expect(engine.getGameState().enemies.map((enemy) => enemy.id)).toEqual([
            `${waitEnemy.id}1`,
            `${waitEnemy.id}2`,
        ]);
    });

    it("starts enemy numbering at one for each engine instance", () => {
        const loadFirstEnemy = () => {
            const engine = new GameEngine([oneEnemyEncounter], 1);
            engine.loadCharacter(makeCharacterDef("hero"));
            return engine.loadEncounter(oneEnemyEncounter.id)[0];
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
        const engine = new GameEngine([multiEnemyEncounter], 1);
        engine.loadCharacter(makeCharacterDef("hero"));

        const events = engine.loadEncounter(multiEnemyEncounter.id);

        expect(events).toEqual([
            { type: "enemySpawned", target: "foe1" },
            { type: "enemySpawned", target: "attacker2" },
            { type: "encounter", id: multiEnemyEncounter.id, success: true },
        ]);
        expect(engine.getGameState().enemies).toEqual([
            expect.objectContaining({ id: "foe1", intention: expect.any(Object) }),
            expect.objectContaining({ id: "attacker2", intention: expect.any(Object) }),
        ]);
    });

    it("runs setup after spawning enemies and before calculating intentions", () => {
        const calls: string[] = [];
        let enemiesVisibleToSetup: string[] = [];
        const setupStep = 7;
        const wait = makeWaitMove();
        const enemy = makeEnemyDef("setup-foe", [wait], (state, actor) => {
            calls.push("ai");
            return {
                actor,
                move: wait,
                targets: [state.characters[0]],
            };
        });
        const encounter: EncounterDef = {
            id: "test-setup",
            enemies: [enemy],
            setup: (state) => {
                calls.push("setup");
                enemiesVisibleToSetup = state.enemies.map((loaded) => loaded.id);
                state.turn.step = setupStep;
            },
        };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(makeCharacterDef("hero"));

        expect(engine.loadEncounter(encounter.id)).toEqual([
            { type: "enemySpawned", target: `${enemy.id}1` },
            { type: "encounter", id: encounter.id, success: true },
        ]);
        expect(calls).toEqual(["setup", "ai"]);
        expect(enemiesVisibleToSetup).toEqual([`${enemy.id}1`]);
        expect(engine.getGameState().turn.step).toBe(setupStep);
        expect(engine.getGameState().enemies[0].intention).toMatchObject({
            move: wait.id,
            targets: [{
                target: "hero",
                result: "hit",
                effects: [],
            }],
            effects: [],
        });
    });

    it("loads the authored catalogue when it is explicitly injected", () => {
        const engine = new GameEngine(encounterList, 8224);
        engine.loadCharacter(ko);

        const events = engine.loadEncounter(plains_1.id);

        expect(events.at(-1)).toEqual({
            type: "encounter",
            id: plains_1.id,
            success: true,
        });
        expect(events.filter((event) => event.type === "enemySpawned"))
            .toHaveLength(plains_1.enemies.length);
        expect(engine.getGameState().enemies).toHaveLength(plains_1.enemies.length);
    });
});
