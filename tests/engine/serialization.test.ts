import { describe, expect, it } from "vitest";
import { ko } from "../../src/content/characters/ko";
import { serializeGameState } from "../../src/engine/private/serialize";
import type { StatusDef } from "../../src/engine/protected/definitions";
import { thresholds } from "../../src/engine/protected/mechanics";
import { GameStatus } from "../../src/engine/protected/status";
import { incapacitated } from "../../src/engine/protected/statuses";
import type { iBuff, iEntity, iGameState } from "../../src/engine/protected/types";
import { getThresholds } from "../../src/engine/public/mechanics";
import { makeBindingDef, makeCharacter, makeCharacterDef, makeEncounterDef, makeEnemy, makeEnemyDef, makeMove, makeWaitMove } from "../helpers/helpers";
import { makeInternalState, STANDARD_DIFFICULTY } from "../helpers/state";
import { createTestEngine } from "../helpers/testCatalog";
import { multiEnemyEncounter, testAlly, testCharacterList, testEnemyList, testHero } from "../helpers/testContent";

describe("character catalogue", () => {
    it("lists only injected ids and returns a fresh array", () => {
        const engine = createTestEngine([], testCharacterList, 1);

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
        const engine = createTestEngine([], [catalogued], 1);

        expect(engine.loadCharacter(catalogued.id)).toEqual({
            type: "loadCharacter",
            id: catalogued.id,
            success: true,
            effects: [],
        });
        expect(engine.getGameState().characters).toEqual([
            expect.objectContaining({ id: catalogued.id, data: { marker: 7 } }),
        ]);
    });

    it("rejects an unknown id without mutating character state", () => {
        const engine = createTestEngine([], testCharacterList, 1);
        const before = engine.getGameState().characters;

        expect(engine.loadCharacter("missing-character")).toEqual({
            type: "loadCharacter",
            id: "missing-character",
            success: false,
            effects: [],
        });
        expect(engine.getGameState().characters).toEqual(before);
    });

    it("cannot load a repository definition that was not injected", () => {
        const engine = createTestEngine([], testCharacterList, 1);

        expect(engine.loadCharacter(ko.id)).toEqual({
            type: "loadCharacter",
            id: ko.id,
            success: false,
            effects: [],
        });
        expect(engine.getGameState().characters).toEqual([]);
    });
});

describe("state serialization and combatant loading", () => {
    it.each(["miss", "graze", "hit", "crit", "none"] as const)("publishes only the existing zero-target preview band (%s)", band => {
        const move = makeMove("zero-preview", "none", {
            targetSide: "none", targets: 0,
            accuracy: band === "none" ? undefined : { [band]: 100 },
        });
        const character = makeCharacter();
        const enemy = makeEnemy(makeEnemyDef("foe", [move]));
        enemy.intentions = [{ resolved: false, actor: enemy, move: { definition: move }, rolls: [{ target: null, roll: 25 }] }];
        const state = makeInternalState({ characters: [character], enemies: [enemy] });
        const statuses = new Map<iEntity, GameStatus>([
            [character, new GameStatus(state, character)], [enemy, new GameStatus(state, enemy)],
        ]);
        const snapshot = serializeGameState(state, statuses);
        const intention = snapshot.enemies[0]!.intentions[0]!;
        expect(intention).toMatchObject({ move: move.id, targets: [], effects: [] });
        if (band === "none") expect(intention).not.toHaveProperty("band");
        else expect(intention).toHaveProperty("band", band);
        expect(enemy.intentions[0]!.move.band).toBeUndefined();
        expect(enemy.intentions[0]!.rolls).toEqual([{ target: null, roll: 25 }]);
        expect(serializeGameState(state, statuses)).toEqual(snapshot);
    });


    it("publishes calculated enemy modifiers including difficulty and active buffs", () => {
        const enemy = makeEnemy(makeEnemyDef("foe", [makeWaitMove()]));
        enemy.buffs = [
            { id: "active", active: true, modifiers: { defense: -2, hit: 8 } },
            { id: "inactive", active: false, modifiers: { hit: 100 } },
        ];
        const character = makeCharacter();
        const state = makeInternalState({
            characters: [character],
            enemies: [enemy],
            difficulty: { ...STANDARD_DIFFICULTY, enemyModifiers: { potency: 2, hit: 1 } },
        });
        const statuses = new Map<iEntity, GameStatus>([
            [character, new GameStatus(state, character)],
            [enemy, new GameStatus(state, enemy)],
        ]);
        const snapshot = serializeGameState(state, statuses);
        expect(snapshot.enemies[0].modifiers).toEqual({ potency: 2, hit: 9, defense: -2 });
        expect(snapshot.enemies[0].buffs).toHaveLength(1);
        snapshot.enemies[0].modifiers.hit = 999;
        expect(enemy.buffs[0].modifiers?.hit).toBe(8);
        expect(serializeGameState(state, statuses).enemies[0].modifiers.hit).toBe(9);
    });

    it("starts with an empty public player phase", () => {
        const state = createTestEngine([], [], 1).getGameState();

        expect(state).toEqual({
            turn: { round: 1, step: 1, phase: "player", outcome: "victory" },
            difficulty: STANDARD_DIFFICULTY,
            characters: [],
            enemies: [],
            traps: [],
            encounter: null,
        });
        expect(createTestEngine([], [], 1).getActionView()).toEqual([]);
        expect(state).not.toHaveProperty("nextEntityId");
    });

    it("publishes the current binding thresholds through the public API", () => {
        expect(getThresholds()).toEqual({
            thresholds: {
                light: 10,
                moderate: 20,
                heavy: 30,
                severe: 50,
                overwhelming: 80,
            },
            max: 100,
        });
    });

    it("keeps move traits on unavailable actions with zero target previews", () => {
        const unavailableBuff = makeMove("unavailable-buff", "mouth", {
            traits: ["buff"],
            isValid: () => "moveUnavailable",
        });
        const hero = makeCharacterDef("hero", [unavailableBuff]);
        const engine = createTestEngine([], [hero], 1);
        engine.loadCharacter(hero.id);

        expect(engine.getActionView()[0].moves[0]).toMatchObject({
            available: false,
            reason: "moveUnavailable",
            move: { id: unavailableBuff.id, traits: ["buff"] },
            targets: [],
        });
    });

    it("reports victory when no enemies are present", () => {
        const hero = makeCharacterDef("hero");
        const engine = createTestEngine([], [hero], 1);
        engine.loadCharacter(hero.id);

        expect(engine.getGameState().turn.outcome).toBe("victory");
    });

    it("reports defeat when every player is incapacitated", () => {
        const capture = makeBindingDef("capture", {
            light: [{ definition: incapacitated, value: 1 }],
        });
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter = makeEncounterDef("defeat-state", {
            enemies: [foe.id],
            bindings: [capture],
            setup: (state) => state.characters.map((character) => ({
                type: "binding" as const,
                source: character,
                target: character,
                binding: capture,
                amount: thresholds.light,
            })),
        });
        const hero = makeCharacterDef("hero");
        const ally = makeCharacterDef("ally");
        const engine = createTestEngine([encounter], [hero, ally], 1, { enemies: [foe] });
        engine.loadCharacter(hero.id);
        engine.loadCharacter(ally.id);
        engine.loadEncounter(encounter.id);

        expect(engine.getGameState().turn.outcome).toBe("defeat");
    });

    it("reports an ongoing battle while any player remains capable", () => {
        const capture = makeBindingDef("capture", {
            light: [{ definition: incapacitated, value: 1 }],
        });
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter = makeEncounterDef("ongoing-state", {
            enemies: [foe.id],
            bindings: [capture],
            setup: (state) => [{
                type: "binding",
                source: state.characters[0],
                target: state.characters[0],
                binding: capture,
                amount: thresholds.light,
            }],
        });
        const hero = makeCharacterDef("hero");
        const ally = makeCharacterDef("ally");
        const engine = createTestEngine([encounter], [hero, ally], 1, { enemies: [foe] });
        engine.loadCharacter(hero.id);
        engine.loadCharacter(ally.id);
        engine.loadEncounter(encounter.id);

        expect(engine.getGameState().turn.outcome).toBe("ongoing");
    });

    it("loads definitions into fresh combatant state through an encounter", () => {
        const hero = makeCharacterDef("hero");
        const engine = createTestEngine([multiEnemyEncounter], [hero], 1, { enemies: testEnemyList });
        engine.loadCharacter(hero.id);

        const events = engine.loadEncounter(multiEnemyEncounter.id);

        expect(events).toEqual({
            type: "loadEncounter", id: multiEnemyEncounter.id, success: true, bindings: [],
            effects: [
                { type: "enemySpawned", target: "foe1" },
                { type: "enemySpawned", target: "attacker1" },
            ],
        });
        expect(engine.getGameState()).toMatchObject({
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
        expect(engine.getGameState()).not.toHaveProperty("nextEntityId");
    });

    it("returns deeply isolated state from getters and successful actions", () => {
        const status: StatusDef = {
            id: "bound",
            levels: [{}, { modifiers: { hitarms: -1 } }],
        };
        const restraint = makeBindingDef("rope", {
            light: [{ definition: status, value: 1 }],
        });
        const prepare = makeMove("prepare", "mouth", {
            targetSide: "none",
            targets: 0,
            resolve: (state, actor) => [{
                type: "binding",
                source: actor,
                target: state.characters[0],
                binding: restraint,
                amount: thresholds.light,
            }],
        });
        const hero = makeCharacterDef("hero", [prepare]);
        const enemy = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter = makeEncounterDef("serialization", { enemies: [enemy.id] });
        const engine = createTestEngine([encounter], [hero], 1, { enemies: [enemy] });
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

        const expected = engine.getGameState();
        expect(expected.characters[0].modifiers).toEqual({ hitarms: -1 });
        const snapshots = [result.frames.at(-1)!.state, engine.getGameState()];

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

        expect(engine.getGameState()).toEqual(expected);
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
            resolved: false,
            actor: enemy,
            move: { definition: enemyMove },
            rolls: [{ target: null, roll: 25 }]
        }];
        const internalState: iGameState = makeInternalState({
            turn: { round: 1, step: 1, phase: "player" },
            characters: [character],
            enemies: [enemy],
        });

        const statuses = new Map<iEntity, GameStatus>([
            [character, new GameStatus(internalState, character)],
            [enemy, new GameStatus(internalState, enemy)],
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
            resolved: false,
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
