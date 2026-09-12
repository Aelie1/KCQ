import { describe, expect, it } from "vitest";
import { thresholds } from "../src/engine/constants";
import { GameEngine } from "../src/engine/engine";
import type { iBuff, iGameState, StatusDef } from "../src/engine/itypes";
import { serializeGameState } from "../src/engine/serialize";
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
            turn: { round: 1, step: 1, phase: "player" },
            characters: [],
            enemies: [],
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

    it("loads definitions into fresh combatant state through an encounter", () => {
        const hero = makeCharacterDef("hero");
        const engine = new GameEngine([multiEnemyEncounter], 1);
        engine.loadCharacter(hero);

        const events = engine.loadEncounter(multiEnemyEncounter.id);

        expect(events).toEqual([
            { type: "enemySpawned", target: "foe1" },
            { type: "enemySpawned", target: "attacker2" },
            { type: "encounter", id: multiEnemyEncounter.id, success: true, bindings: [] },
        ]);
        expect(engine.getGameState()).toMatchObject({
            turn: { round: 1, step: 1, phase: "player" },
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
                { id: "attacker2", buffs: [] },
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
            side: "none",
            targets: 0,
            resolve: (state) => [{
                type: "binding",
                target: state.characters[0],
                binding: restraint,
                amount: thresholds.easy,
            }],
        });
        const hero = makeCharacterDef("hero", [prepare]);
        const enemy = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter = { id: "serialization", enemies: [enemy], bindings: [] };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(hero);
        engine.loadEncounter(encounter.id);
        const result = engine.executeAction({
            type: "attack",
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
                active: true,
                statuses: [],
            });
            snapshot.characters[0].bindings[0].value = 999;
            snapshot.characters[0].bindings[0].data.clientOnly = 999;
            snapshot.characters[0].bindings[0].status[0].value = 999;
            snapshot.characters[0].modifiers.hitarms = -99;
            snapshot.enemies[0].currHp = 0;
            const intention = snapshot.enemies[0].intention;
            if (intention) {
                intention.targets.push({
                    target: "intruder",
                    band: "miss",
                    effects: [],
                });
                intention.effects.push({
                    type: "damage",
                    source: "hero",
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
            modifiers: { hit: -1 },
            linkedEntity: "foe1",
        };
        const enemyBuff: iBuff = {
            id: "focus",
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
        enemy.buffs.push(enemyBuff);
        enemy.intention = {
            actor: enemy,
            move: { definition: enemyMove },
            rolls: [{ target: null, roll: 25 }],
        };
        const internalState: iGameState = {
            turn: { round: 1, step: 1, phase: "player" },
            nextEntityId: 17,
            characters: [character],
            enemies: [enemy],
        };

        const serialized = serializeGameState(internalState);

        expect(serialized.characters[0].modifiers).toEqual({ hit: -3 });
        expect(serialized.characters[0].buffs[0]).toEqual({
            id: "focus",
            duration: 2,
            active: true,
            statuses: [{ id: status.id, value: 1 }],
            linkedEntity: "foe1",
            modifiers: { hit: -1 },
        });
        expect(serialized.enemies[0].buffs[0]).toEqual({
            id: "focus",
            active: false,
            statuses: [{ id: status.id, value: 1 }],
            modifiers: {},
        });
        expect(serialized.enemies[0].intention).toEqual({
            move: enemyMove.id,
            targets: [],
            effects: [],
        });
        expect(serialized).not.toHaveProperty("nextEntityId");
        expect(serialized.characters[0].buffs[0]).not.toBe(characterBuff);
        const serializedStatus = serialized.characters[0].buffs[0].statuses?.[0];
        const internalStatus = characterBuff.statuses?.[0];
        if (!serializedStatus || !internalStatus) throw new Error("Expected nested statuses");
        expect(serializedStatus).not.toBe(internalStatus);

        serialized.characters[0].buffs[0].duration = 99;
        serializedStatus.value = 99;
        serialized.characters[0].buffs[0].modifiers!.hit = -99;
        serialized.enemies[0].buffs[0].active = true;
        expect(characterBuff.duration).toBe(2);
        expect(internalStatus.value).toBe(1);
        expect(characterBuff.modifiers?.hit).toBe(-1);
        expect(enemyBuff.active).toBe(false);
    });
});
