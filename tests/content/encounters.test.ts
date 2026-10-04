import { describe, expect, it } from "vitest";
import { ko } from "../../src/content/characters/ko";
import { contentCatalog } from "../../src/content/content";
import { forest_3, outside, plains_1, plains_2, plains_3, tower_1, tower_2, tower_3 } from "../../src/content/skunk/encounters";
import { fairy } from "../../src/content/skunk/fairy";
import { trapPuddle } from "../../src/content/skunk/puddles";
import { queen } from "../../src/content/skunk/queen";
import { rainmaker } from "../../src/content/skunk/rainmaker";
import { skunk } from "../../src/content/skunk/skunk";
import { skunkette } from "../../src/content/skunk/skunkette";
import type { EncounterDef } from "../../src/engine/protected/definitions";
import { createCustomEngine as createCatalogEngine } from "../../src/engine/protected/engine";
import { isEnemy } from "../../src/engine/protected/helpers";
import { actionView } from "../helpers/actionView";
import { execute, makeBehavioralCharacter, makeBehavioralMove } from "../helpers/behavioralHelpers";
import { resolvedEvents } from "../helpers/events";
import { makeEnemyDef, makeWaitMove } from "../helpers/helpers";
import { createTestEngine } from "../helpers/testCatalog";
import {
    basicAttackingEnemy,
    multiEnemyEncounter,
    oneEnemyEncounter,
    testCharacterList,
    testEnemyList,
    testHero,
    waitEnemy,
} from "../helpers/testContent";

describe("encounters", () => {
    it("lists only ids from the injected catalogue and returns a fresh array", () => {
        const catalogue = [oneEnemyEncounter, multiEnemyEncounter];
        const engine = createTestEngine(catalogue, testCharacterList, 1, { enemies: testEnemyList });

        const listedIds = engine.listEncounters();
        expect(listedIds).toEqual(catalogue.map((encounter) => encounter.id));
        expect(listedIds).not.toContain(plains_1.id);

        listedIds.push("client-only");
        expect(engine.listEncounters()).toEqual(
            catalogue.map((encounter) => encounter.id),
        );
    });

    it("searches only the injected catalogue", () => {
        const engine = createTestEngine([oneEnemyEncounter], testCharacterList, 1, { enemies: testEnemyList });
        engine.loadCharacter(testHero.id);

        expect(engine.loadEncounter(plains_1.id)).toEqual({
            type: "loadEncounter",
            id: plains_1.id,
            success: false,
            bindings: [],
            effects: [],
        });
        expect(engine.getGameState().enemies).toEqual([]);
    });

    it("does not mutate combat state or consume an entity id for an unknown id", () => {
        const engine = createTestEngine([oneEnemyEncounter], testCharacterList, 1, { enemies: testEnemyList });
        engine.loadCharacter(testHero.id);
        const before = engine.getGameState();

        expect(engine.loadEncounter("missing-encounter")).toEqual({
            type: "loadEncounter",
            id: "missing-encounter",
            success: false,
            bindings: [],
            effects: [],
        });
        expect(engine.getGameState()).toEqual(before);

        expect(engine.loadEncounter(oneEnemyEncounter.id)).toEqual({
            type: "loadEncounter", id: oneEnemyEncounter.id, success: true, bindings: [],
            effects: [{ type: "enemySpawned", target: `${waitEnemy.id}1` }],
        });
    });

    it("emits incrementing runtime enemy ids when replacing an encounter", () => {
        const engine = createTestEngine([oneEnemyEncounter], testCharacterList, 1, { enemies: testEnemyList });
        engine.loadCharacter(testHero.id);

        const first = engine.loadEncounter(oneEnemyEncounter.id);
        const second = engine.loadEncounter(oneEnemyEncounter.id);

        expect(first.effects[0]).toEqual({ type: "enemySpawned", target: `${waitEnemy.id}1` });
        expect(second.effects[0]).toEqual({ type: "enemySpawned", target: `${waitEnemy.id}1` });
        expect(engine.getGameState().enemies.map((enemy) => enemy.id)).toEqual([
            `${waitEnemy.id}1`,
        ]);
    });

    it("starts enemy numbering at one for each engine instance", () => {
        const loadFirstEnemy = () => {
            const engine = createTestEngine([oneEnemyEncounter], testCharacterList, 1, { enemies: testEnemyList });
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
        const engine = createTestEngine([multiEnemyEncounter], testCharacterList, 1, { enemies: testEnemyList });
        engine.loadCharacter(testHero.id);

        const events = engine.loadEncounter(multiEnemyEncounter.id);

        expect(events).toEqual({
            type: "loadEncounter", id: multiEnemyEncounter.id, success: true, bindings: [],
            effects: [
                { type: "enemySpawned", target: "foe1" },
                { type: "enemySpawned", target: "attacker1" },
            ],
        });
        expect(engine.getGameState().enemies).toEqual([
            expect.objectContaining({
                id: "foe1",
                defId: "foe",
                maxHp: waitEnemy.hp,
                intentions: expect.any(Array),
            }),
            expect.objectContaining({
                id: "attacker1",
                defId: "attacker",
                maxHp: basicAttackingEnemy.hp,
                intentions: expect.any(Array),
            }),
        ]);
    });

    it("preserves definition ids when encounter setup renames runtime enemies", () => {
        const engine = createCatalogEngine(contentCatalog, 1);
        engine.loadCharacter(ko.id);

        engine.loadEncounter(tower_1.id);

        expect(engine.getGameState().enemies).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: "empress", defId: "queen" }),
            expect.objectContaining({ id: "skunketteQueen", defId: "skunkette" }),
        ]));
    });

    it.each([
        ["tower_1", tower_1, "empress", "empressMight", 4, 8, 50, undefined, true],
        ["tower_2", tower_2, "empress", "empressMight", 3, 6, 40, 1, false],
        ["tower_3", tower_3, "empress", "empressMight", 2, 4, 30, 2, false],
        ["outside", outside, "goddess", "goddessMight", 4, 8, undefined, undefined, false],
    ] as const)(
        "applies %s setup modifiers to renamed enemies and the player before actions are published",
        (_label, encounter, queenId, enemyBuff, queenModifier, skunketteHit, collar, playerModifier, ambushed) => {
            const engine = createCatalogEngine(contentCatalog, 7);
            engine.loadCharacter(ko.id);
            engine.loadEncounter(encounter.id);
            const state = engine.getGameState();
            const loadedQueen = state.enemies.find(({ defId }) => defId === queen.id);
            const loadedSkunkette = state.enemies.find(({ defId }) => defId === skunkette.id);
            const character = state.characters[0];

            expect(loadedQueen).toMatchObject({
                id: queenId,
                defId: queen.id,
                buffs: [expect.objectContaining({
                    id: enemyBuff,
                    modifiers: { hit: queenModifier, defense: queenModifier },
                })],
            });
            expect(loadedSkunkette).toMatchObject({
                id: "skunketteQueen",
                defId: skunkette.id,
                buffs: [expect.objectContaining({
                    id: enemyBuff,
                    modifiers: { hit: skunketteHit },
                })],
            });
            expect(character.bindings.find(({ id }) => id === "latexCollar")?.value)
                .toBe(collar);
            if (playerModifier === undefined) {
                expect(character.buffs.some(({ id }) => id === "goddessMight")).toBe(false);
                expect(character.modifiers).not.toHaveProperty("hit");
                expect(character.modifiers).not.toHaveProperty("defense");
            } else {
                expect(character.buffs).toContainEqual(expect.objectContaining({
                    id: "goddessMight",
                    modifiers: { hit: playerModifier, defense: playerModifier },
                }));
                expect(character.modifiers).toMatchObject({ hit: playerModifier, defense: playerModifier });
            }
            expect(character.buffs.some(({ id }) => id === "ambushed")).toBe(ambushed);
            expect(actionView(engine, ko.id)).toMatchObject(ambushed
                ? { available: false, reason: "actorSkipped" }
                : { available: true });

            if (encounter === outside) {
                expect(state.enemies.find(({ defId }) => defId === skunk.id)).toMatchObject({
                    id: "skunkEmpress",
                    buffs: [expect.objectContaining({
                        id: enemyBuff,
                        modifiers: { hit: 8 },
                    })],
                });
            }
        },
    );

    it("uses forest_3's setup wave offset when the Queen crosses her first HP threshold", () => {
        const crossThreshold = makeBehavioralMove("cross-threshold", "arms", {
            freeOnHit: true,
            resolve: (_state, actor, _move, targets) => targets.flatMap(({ target }) =>
                isEnemy(target) ? [{
                    type: "damage" as const,
                    source: actor,
                    target,
                    amount: 151,
                }] : [],
            ),
        });
        const run = (encounter: EncounterDef) => {
            const hero = makeBehavioralCharacter("hero", [crossThreshold]);
            const engine = createTestEngine([encounter], [hero], 11, {
                enemies: [queen, skunkette, skunk, fairy, rainmaker],
            });
            engine.loadCharacter(hero.id);
            engine.loadEncounter(encounter.id);
            execute(engine, {
                type: "move",
                actor: hero.id,
                move: crossThreshold.id,
                targets: ["queen1"],
            });
            return execute(engine, { type: "endTurn" });
        };

        expect(resolvedEvents(run(plains_3).frames).filter(({ type }) => type === "enemySpawned"))
            .toContainEqual({ type: "enemySpawned", target: "skunkette1" });
        expect(resolvedEvents(run(forest_3).frames).filter(({ type }) => type === "enemySpawned"))
            .toContainEqual({ type: "enemySpawned", target: "skunk1" });
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
            enemies: [enemy.id],
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
                    visible: false,
                }];
            },
        };
        const engine = createTestEngine([encounter], testCharacterList, 1, { enemies: [enemy] });
        engine.loadCharacter(testHero.id);

        expect(engine.loadEncounter(encounter.id)).toEqual({
            type: "loadEncounter", id: encounter.id, success: true, bindings: [],
            effects: [{ type: "enemySpawned", target: `${enemy.id}1` }],
        });
        expect(calls).toEqual(["setup", "ai"]);
        expect(enemiesVisibleToSetup).toEqual([`${enemy.id}1`]);
        expect(engine.getGameState().enemies[0].intentions).toMatchObject([{
            move: wait.id,
            targets: [],
            effects: [],
        }]);
    });

    it("loads the authored catalogue when it is explicitly injected", () => {
        const engine = createCatalogEngine(contentCatalog, 8224);
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
        expect(engine.getGameState().enemies).toHaveLength(plains_1.enemies.length);
    });

    it("catalogues and loads plains_2 with Skunks, puddles, and valid intentions", () => {
        expect(contentCatalog.encounters).toContain(plains_2);
        expect(plains_2.id).toBe("plains_2");
        expect(plains_2.enemies).toEqual([
            skunkette.id, skunkette.id, skunk.id, skunk.id,
        ]);
        expect(plains_2.traps).toEqual([{ definition: trapPuddle, amount: 50 }]);

        const engine = createCatalogEngine(contentCatalog, 8224);
        engine.loadCharacter(ko.id);
        const events = engine.loadEncounter(plains_2.id);
        const state = engine.getGameState();

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
