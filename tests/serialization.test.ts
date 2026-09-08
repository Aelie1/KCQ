import { describe, expect, it } from "vitest";
import { ko } from "../src/content/characters/ko";
import { skunkette } from "../src/content/skunk/skunkette";
import { GameEngine } from "../src/engine/engine";
import type { BuffDef, iBuff, iGameState } from "../src/engine/itypes";
import { serializeGameState } from "../src/engine/serialize";
import {
    makeCharacter,
    makeEnemy,
    makeEnemyDef,
    makeWaitMove,
} from "./helpers";

const AUTHORED_HIT_SEED = 8224;

function setupAuthoredCombat(): GameEngine {
    const engine = new GameEngine(AUTHORED_HIT_SEED);
    engine.loadCharacter(ko);
    engine.loadEnemy(skunkette);
    return engine;
}

describe("state and combatant loading", () => {
    it("starts with an empty player phase", () => {
        expect(new GameEngine(1).getGameState()).toEqual({
            turn: { round: 1, step: 1, phase: "player" },
            characters: [],
            enemies: [],
        });
    });

    it("loads definitions into fresh combatant state and numbers enemies", () => {
        const engine = new GameEngine(1);
        engine.loadCharacter(ko);
        engine.loadEnemy(skunkette);
        engine.loadEnemy(skunkette);

        expect(engine.getGameState()).toEqual({
            turn: { round: 1, step: 1, phase: "player" },
            characters: [{
                id: ko.id,
                acted: false,
                standing: false,
                bonusEscapes: 0,
                bindings: [],
                buffs: [],
                status: [],
            }],
            enemies: [1, 2].map((number) => ({
                id: `${skunkette.id}${number}`,
                currHp: skunkette.hp,
                currDef: skunkette.defense,
                intention: null,
                buffs: [],
            })),
        });
    });

    it("returns deeply isolated state from getters and successful actions", () => {
        const engine = setupAuthoredCombat();
        engine.updateIntentions();
        const result = engine.executeAction({ type: "endTurn" });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected endTurn to succeed");

        const expected = engine.getGameState();
        const snapshots = [result.state, engine.getGameState()];

        for (const snapshot of snapshots) {
            snapshot.turn.round = 999;
            snapshot.characters[0].acted = true;
            snapshot.characters[0].buffs.push({ duration: 1, effect: 1 });
            snapshot.characters[0].bindings[0].value = 999;
            snapshot.characters[0].bindings[0].state.max = 999;
            if (snapshot.characters[0].status[0]) snapshot.characters[0].status[0].value = 999;
            snapshot.enemies[0].currHp = 0;
            snapshot.enemies[0].buffs.push({ duration: 1, effect: 1 });
            const intention = snapshot.enemies[0].intention;
            if (intention?.type === "attack") intention.targets.push("intruder");
        }

        expect(engine.getGameState()).toEqual(expected);
    });

    it("serializes internal buff instances without definitions or shared objects", () => {
        const buffDefinition: BuffDef = { id: "focus" };
        const characterBuff: iBuff = {
            definition: buffDefinition,
            duration: 2,
            effect: 3,
        };
        const enemyBuff: iBuff = {
            definition: buffDefinition,
            duration: 4,
            effect: 5,
        };
        const character = makeCharacter();
        character.buffs.push(characterBuff);
        const enemyDefinition = makeEnemyDef("foe", [makeWaitMove()]);
        const enemy = makeEnemy(enemyDefinition);
        enemy.buffs.push(enemyBuff);
        enemy.intention = { type: "endTurn" };
        const internalState: iGameState = {
            turn: { round: 1, step: 1, phase: "player" },
            characters: [character],
            enemies: [enemy],
        };

        const serialized = serializeGameState(internalState);

        expect(serialized.characters[0].buffs[0]).toEqual({ duration: 2, effect: 3 });
        expect(serialized.enemies[0].buffs[0]).toEqual({ duration: 4, effect: 5 });
        expect(serialized.enemies[0].intention).toEqual({ type: "endTurn" });
        expect(serialized.characters[0].buffs[0]).not.toBe(characterBuff);
        expect(serialized.enemies[0].buffs[0]).not.toBe(enemyBuff);

        serialized.characters[0].buffs[0].duration = 99;
        serialized.enemies[0].buffs[0].effect = 99;
        expect(characterBuff.duration).toBe(2);
        expect(enemyBuff.effect).toBe(5);
    });
});
