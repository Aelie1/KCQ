import { describe, expect, it } from "vitest";
import { ko } from "../../src/content/characters/ko";
import { serializeGameState } from "../../src/engine/private/serialize";
import type { EncounterDef, StatusDef } from "../../src/engine/protected/definitions";
import { createCustomEngine } from "../../src/engine/protected/engine";
import { thresholds } from "../../src/engine/protected/helpers";
import { GameStatus } from "../../src/engine/protected/status";
import { incapacitated } from "../../src/engine/protected/statuses";
import type { iBuff, iEntity, iGameState } from "../../src/engine/protected/types";
import { makeBindingDef, makeCharacter, makeCharacterDef, makeEnemy, makeEnemyDef, makeMove, makeWaitMove } from "../helpers/helpers";
import { multiEnemyEncounter, testAlly, testCharacterList, testHero } from "../helpers/testContent";

describe("character catalogue", () => {
    it("lists only injected ids and returns a fresh array", () => {
        const engine = createCustomEngine([], testCharacterList, 1);

        const listedIds = engine.listCharacters();
        expect(listedIds).toEqual([testHero.id, testAlly.id]);
        expect(listedIds).not.toContain(ko.id);

        listedIds.push("client-only");
        expect(engine.listCharacters()).toEqual([testHero.id, testAlly.id]);
    });

    it("loads the matching injected definition by id", () => {
        const catalogued = {
            ...makeCharacterDef("catalogued"),
            data: { marker: 7 },
        };
        const engine = createCustomEngine([], [catalogued], 1);

        expect(engine.loadCharacter(catalogued.id)).toEqual({
            type: "loadCharacter",
            id: catalogued.id,
            success: true,
            effects: [],
        });
        expect(engine.getGameView().characters).toEqual([
            expect.objectContaining({ id: catalogued.id, data: { marker: 7 } }),
        ]);
    });

    it("rejects an unknown id without mutating character state", () => {
        const engine = createCustomEngine([], testCharacterList, 1);
        const before = engine.getGameView().characters;

        expect(engine.loadCharacter("missing-character")).toEqual({
            type: "loadCharacter",
            id: "missing-character",
            success: false,
            effects: [],
        });
        expect(engine.getGameView().characters).toEqual(before);
    });

    it("cannot load a repository definition that was not injected", () => {
        const engine = createCustomEngine([], testCharacterList, 1);

        expect(engine.loadCharacter(ko.id)).toEqual({
            type: "loadCharacter",
            id: ko.id,
            success: false,
            effects: [],
        });
        expect(engine.getGameView().characters).toEqual([]);
    });
});

describe("state serialization and combatant loading", () => {
    it("starts with an empty public player phase", () => {
        const state = createCustomEngine([], [], 1).getGameView();

        expect(state).toEqual({
            turn: { round: 1, step: 1, phase: "player", outcome: "victory" },
            characters: [],
            enemies: [],
            traps: [],
            encounter: null,
            actions: [],
        });
        expect(state).not.toHaveProperty("nextEntityId");
    });

    it("publishes the current binding thresholds through the public API", () => {
        expect(createCustomEngine([], [], 1).getThresholds()).toEqual({
            thresholds: {
                easy: 10,
                medium: 20,
                hard: 30,
                extreme: 50,
                impossible: 80,
            },
            max: 100,
        });
    });

    it("reports victory when no enemies are present", () => {
        const hero = makeCharacterDef("hero");
        const engine = createCustomEngine([], [hero], 1);
        engine.loadCharacter(hero.id);

        expect(engine.getGameView().turn.outcome).toBe("victory");
    });

    it("reports defeat when every player is incapacitated", () => {
        const capture = makeBindingDef("capture", {
            easy: [{ definition: incapacitated, value: 1 }],
        });
        const encounter: EncounterDef = {
            id: "defeat-state",
            enemies: [makeEnemyDef("foe", [makeWaitMove()])],
            bindings: [capture],
            traps: [],
            setup: (state) => state.characters.map((character) => ({
                type: "binding" as const,
                source: character,
                target: character,
                binding: capture,
                amount: thresholds.easy,
            })),
        };
        const hero = makeCharacterDef("hero");
        const ally = makeCharacterDef("ally");
        const engine = createCustomEngine([encounter], [hero, ally], 1);
        engine.loadCharacter(hero.id);
        engine.loadCharacter(ally.id);
        engine.loadEncounter(encounter.id);

        expect(engine.getGameView().turn.outcome).toBe("defeat");
    });

    it("reports an ongoing battle while any player remains capable", () => {
        const capture = makeBindingDef("capture", {
            easy: [{ definition: incapacitated, value: 1 }],
        });
        const encounter: EncounterDef = {
            id: "ongoing-state",
            enemies: [makeEnemyDef("foe", [makeWaitMove()])],
            bindings: [capture],
            traps: [],
            setup: (state) => [{
                type: "binding",
                source: state.characters[0],
                target: state.characters[0],
                binding: capture,
                amount: thresholds.easy,
            }],
        };
        const hero = makeCharacterDef("hero");
        const ally = makeCharacterDef("ally");
        const engine = createCustomEngine([encounter], [hero, ally], 1);
        engine.loadCharacter(hero.id);
        engine.loadCharacter(ally.id);
        engine.loadEncounter(encounter.id);

        expect(engine.getGameView().turn.outcome).toBe("ongoing");
    });

    it("loads definitions into fresh combatant state through an encounter", () => {
        const hero = makeCharacterDef("hero");
        const engine = createCustomEngine([multiEnemyEncounter], [hero], 1);
        engine.loadCharacter(hero.id);

        const events = engine.loadEncounter(multiEnemyEncounter.id);

        expect(events).toEqual({
            type: "loadEncounter", id: multiEnemyEncounter.id, success: true, bindings: [],
            effects: [
                { type: "enemySpawned", target: "foe1" },
                { type: "enemySpawned", target: "attacker1" },
            ],
        });
        expect(engine.getGameView()).toMatchObject({
            turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
            characters: [{
                id: hero.id,
                acted: false,
                standing: false,
                bonusEscapes: 0,
                bindings: [],
                buffs: [],
                modifiers: {},
            }],
            enemies: [
                { id: "foe1", buffs: [] },
                { id: "attacker1", buffs: [] },
            ],
        });
        expect(engine.getGameView()).not.toHaveProperty("nextEntityId");
    });

    it("returns deeply isolated state from getters and successful actions", () => {
        const status: StatusDef = {
            id: "bound",
            levels: [{}, { modifiers: { hitarms: -1 } }],
        };
        const restraint = makeBindingDef("rope", {
            easy: [{ definition: status, value: 1 }],
        });
        const prepare = makeMove("prepare", "mouth", {
            targetSide: "none",
            targets: 0,
            resolve: (state, actor) => [{
                type: "binding",
                source: actor,
                target: state.characters[0],
                binding: restraint,
                amount: thresholds.easy,
            }],
        });
        const hero = makeCharacterDef("hero", [prepare]);
        const enemy = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter = { id: "serialization", enemies: [enemy], bindings: [], traps: [] };
        const engine = createCustomEngine([encounter], [hero], 1);
        engine.loadCharacter(hero.id);
        engine.loadEncounter(encounter.id);
        const result = engine.executeAction({
            type: "move",
            actor: hero.id,
            move: prepare.id,
            targets: [],
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected prepare to succeed");

        const expected = engine.getGameView();
        expect(expected.characters[0].modifiers).toEqual({ hitarms: -1 });
        const snapshots = [result.view, engine.getGameView()];

        for (const snapshot of snapshots) {
            snapshot.turn.round = 999;
            snapshot.characters[0].acted = false;
            snapshot.characters[0].buffs.push({
                id: "client-only",
                duration: 1,
                statuses: [],
            });
            snapshot.characters[0].bindings[0].value = 999;
            snapshot.characters[0].bindings[0].data.clientOnly = 999;
            snapshot.characters[0].bindings[0].status[0].value = 999;
            snapshot.characters[0].modifiers.hitarms = -99;
            snapshot.enemies[0].currHp = 0;
            const intention = snapshot.enemies[0].intentions[0];
            if (intention) {
                intention.targets.push({
                    target: "intruder",
                    band: "miss",
                    effects: [],
                });
                intention.effects.push({
                    type: "damage",
                    target: "intruder",
                    amount: 1,
                });
            }
        }

        expect(engine.getGameView()).toEqual(expected);
    });

    it("serializes runtime buffs and nested statuses into isolated public objects", () => {
        const status: StatusDef = {
            id: "blinded",
            levels: [{}, { modifiers: { hit: -2 } }],
        };
        const characterBuff: iBuff = {
            id: "focus",
            duration: 2,
            active: true,
            statuses: [{ definition: status, value: 1 }],
            modifiers: { hit: -1, potency: 2, vulnerability: 3 },
            linkedEntity: "foe1",
        };
        const enemyBuff: iBuff = {
            id: "focus",
            active: true,
            statuses: [{ definition: status, value: 1 }],
        };
        const inactiveEnemyBuff: iBuff = {
            id: "inactive-enemy-focus",
            active: false,
            statuses: [{ definition: status, value: 1 }],
        };
        const inactiveCharacterBuff: iBuff = {
            id: "inactive-focus",
            active: false,
            statuses: [{ definition: status, value: 1 }],
            modifiers: { hit: -100, defense: -100 },
        };
        const character = makeCharacter();
        character.buffs.push(characterBuff, inactiveCharacterBuff);
        const enemyMove = makeWaitMove();
        const enemyDefinition = makeEnemyDef("foe", [enemyMove]);
        const enemy = makeEnemy(enemyDefinition);
        enemy.buffs.push(enemyBuff, inactiveEnemyBuff);
        enemy.data.previewOnly = 7;
        enemy.intentions = [{
            actor: enemy,
            move: { definition: enemyMove },
            rolls: [{ target: null, roll: 25 }]
        }];
        const internalState: iGameState = {
            turn: { round: 1, step: 1, phase: "player" },
            nextId: {},
            characters: [character],
            enemies: [enemy],
            traps: [],
            encounter: null
        };

        const statuses = new Map<iEntity, GameStatus>([
            [character, new GameStatus(character)],
            [enemy, new GameStatus(enemy)],
        ]);
        const serialized = serializeGameState(internalState, statuses);

        expect(serialized.characters[0].modifiers).toEqual({
            hit: -3,
            potency: 2,
            vulnerability: 3,
        });
        expect(serialized.characters[0].buffs[0]).toEqual({
            id: "focus",
            duration: 2,
            statuses: [{ id: status.id, value: 1 }],
            linkedEntity: "foe1",
            modifiers: { hit: -1, potency: 2, vulnerability: 3 },
        });
        expect(serialized.enemies[0].buffs[0]).toEqual({
            id: "focus",
            duration: undefined,
            statuses: [{ id: status.id, value: 1 }],
            modifiers: {},
            linkedEntity: undefined,
        });
        expect(serialized.enemies[0].buffs).toHaveLength(1);
        expect(serialized.enemies[0].intentions).toEqual([{
            move: enemyMove.id,
            targets: [],
            effects: [],
        }]);
        expect(serialized).not.toHaveProperty("nextEntityId");
        expect(serialized.enemies[0]).not.toHaveProperty("data");
        expect(serialized.enemies[0]).not.toHaveProperty("definition");
        expect(serialized.characters[0].modifiers).not.toHaveProperty("effect");
        expect(serialized.characters[0].buffs[0]).not.toHaveProperty("active");
        expect(serialized.enemies[0].buffs[0]).not.toHaveProperty("active");
        expect(serialized.characters[0].buffs[0]).not.toBe(characterBuff);
        const serializedStatus = serialized.characters[0].buffs[0].statuses?.[0];
        const internalStatus = characterBuff.statuses?.[0];
        if (!serializedStatus || !internalStatus) throw new Error("Expected nested statuses");
        expect(serializedStatus).not.toBe(internalStatus);

        serialized.characters[0].buffs[0].duration = 99;
        serializedStatus.value = 99;
        serialized.characters[0].buffs[0].modifiers!.hit = -99;
        serialized.enemies[0].buffs[0].statuses![0].value = 88;
        expect(characterBuff.duration).toBe(2);
        expect(internalStatus.value).toBe(1);
        expect(characterBuff.modifiers?.hit).toBe(-1);
        expect(enemyBuff.statuses?.[0].value).toBe(1);
        expect(inactiveEnemyBuff.active).toBe(false);
    });
});
