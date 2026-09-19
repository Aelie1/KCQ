import { describe, expect, it } from "vitest";
import { serializeGameState } from "../src/engine/private/serialize";
import type { EncounterDef, StatusDef } from "../src/engine/protected/definitions";
import { thresholds } from "../src/engine/protected/helpers";
import { incapacitated } from "../src/engine/protected/statuses";
import type { iBuff, iGameState } from "../src/engine/protected/types";
import { GameEngine } from "../src/engine/public/engine";
import {
    makeBindingDef,
    makeCharacter,
    makeCharacterDef,
    makeEnemy,
    makeEnemyDef,
    makeMove,
    makeWaitMove,
} from "./helpers";
import { multiEnemyEncounter } from "./testContent";

describe("state serialization and combatant loading", () => {
    it("starts with an empty public player phase", () => {
        const state = new GameEngine([], 1).getGameState();

        expect(state).toEqual({
            turn: { round: 1, step: 1, phase: "player", outcome: "victory" },
            characters: [],
            enemies: [],
            traps: [],
            encounter: null
        });
        expect(state).not.toHaveProperty("nextEntityId");
    });

    it("publishes the current binding thresholds through the public API", () => {
        expect(new GameEngine([], 1).getThresholds()).toEqual({
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
        const engine = new GameEngine([], 1);
        engine.loadCharacter(makeCharacterDef("hero"));

        expect(engine.getGameState().turn.outcome).toBe("victory");
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
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(makeCharacterDef("hero"));
        engine.loadCharacter(makeCharacterDef("ally"));
        engine.loadEncounter(encounter.id);

        expect(engine.getGameState().turn.outcome).toBe("defeat");
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
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(makeCharacterDef("hero"));
        engine.loadCharacter(makeCharacterDef("ally"));
        engine.loadEncounter(encounter.id);

        expect(engine.getGameState().turn.outcome).toBe("ongoing");
    });

    it("loads definitions into fresh combatant state through an encounter", () => {
        const hero = makeCharacterDef("hero");
        const engine = new GameEngine([multiEnemyEncounter], 1);
        engine.loadCharacter(hero);

        const events = engine.loadEncounter(multiEnemyEncounter.id);

        expect(events).toEqual([
            { type: "enemySpawned", target: "foe1" },
            { type: "enemySpawned", target: "attacker1" },
            { type: "encounterLoad", id: multiEnemyEncounter.id, success: true, bindings: [] },
        ]);
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
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(hero);
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
        const snapshots = [result.state, engine.getGameState()];

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
            actor: enemy,
            move: { definition: enemyMove },
            rolls: [{ target: null, roll: 25 }]
        }];
        enemy.preview = [{
            move: enemyMove.id,
            targets: [],
            effects: [],
        }];
        const internalState: iGameState = {
            turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
            nextId: {},
            characters: [character],
            enemies: [enemy],
            traps: [],
            encounter: null
        };

        const serialized = serializeGameState(internalState);

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
