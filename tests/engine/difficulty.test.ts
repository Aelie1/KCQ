import { describe, expect, it } from "vitest";
import { difficulties } from "../../src/engine/private/constants";
import type { StatusDef } from "../../src/engine/protected/definitions";
import { GameStatus } from "../../src/engine/protected/status";
import { createStockEngine } from "../../src/stock";
import type { DifficultyId } from "../../src/engine/public/types";
import { makeBinding, makeBindingDef, makeCharacter, makeEnemy, makeEnemyDef, makeWaitMove } from "../helpers/helpers";
import { makeInternalState } from "../helpers/state";

describe("game-wide difficulty", () => {
    it("starts at Standard and immediately exposes changes made with setDifficulty", () => {
        const engine = createStockEngine(1);

        expect(engine.getGameState().difficulty).toEqual(difficulties.standard);

        engine.setDifficulty("mythic");

        expect(engine.getGameState().difficulty).toEqual(difficulties.mythic);
    });

    it("adds no modifiers on Standard", () => {
        const character = makeCharacter();
        const enemy = makeEnemy(makeEnemyDef("foe", [makeWaitMove()]));
        const state = makeInternalState({
            difficulty: difficulties.standard,
            characters: [character],
            enemies: [enemy],
        });

        expect(new GameStatus(state, character).getModifiers()).toEqual({});
        expect(new GameStatus(state, enemy).getModifiers()).toEqual({});
    });

    it("applies Casual modifiers only to players", () => {
        const character = makeCharacter();
        const enemy = makeEnemy(makeEnemyDef("foe", [makeWaitMove()]));
        const state = makeInternalState({
            difficulty: difficulties.casual,
            characters: [character],
            enemies: [enemy],
        });

        expect(new GameStatus(state, character).getModifiers())
            .toEqual(difficulties.casual.playerModifiers);
        expect(new GameStatus(state, enemy).getModifiers()).toEqual({});
    });

    it.each(["veteran", "extreme", "mythic"] as const)(
        "applies %s modifiers only to enemies",
        (difficulty) => {
            const character = makeCharacter();
            const enemy = makeEnemy(makeEnemyDef("foe", [makeWaitMove()]));
            const state = makeInternalState({
                difficulty: difficulties[difficulty],
                characters: [character],
                enemies: [enemy],
            });

            expect(new GameStatus(state, character).getModifiers()).toEqual({});
            expect(new GameStatus(state, enemy).getModifiers())
                .toEqual(difficulties[difficulty].enemyModifiers);
        },
    );

    it("combines difficulty with stance, statuses, and buffs", () => {
        const focused: StatusDef = {
            id: "blinded",
            levels: [{}, { modifiers: { hit: 3, defense: 1 } }],
        };
        const restraint = makeBindingDef("focus-source", {
            light: [{ definition: focused, value: 1 }],
        });
        const character = makeCharacter("hero", [makeBinding(restraint, 10)]);
        character.standing = true;
        character.buffs.push({
            id: "training",
            active: true,
            modifiers: { hit: 4, escape: 1 },
        });
        const state = makeInternalState({
            difficulty: difficulties.casual,
            characters: [character],
        });

        expect(new GameStatus(state, character).getModifiers()).toEqual({
            hit: (difficulties.casual.playerModifiers.hit ?? 0) + 3 + 4,
            escape: (difficulties.casual.playerModifiers.escape ?? 0) + 1,
            defense: -1,
        });

        const enemy = makeEnemy(makeEnemyDef("foe", [makeWaitMove()]));
        enemy.buffs.push({ id: "empowered", active: true, modifiers: { potency: 3 } });
        const enemyState = makeInternalState({
            difficulty: difficulties.veteran,
            enemies: [enemy],
        });
        expect(new GameStatus(enemyState, enemy).getModifiers()).toEqual({
            potency: (difficulties.veteran.enemyModifiers.potency ?? 0) + 3,
        });
    });

    it("preserves the difficulty baseline across individual and full recalculation", () => {
        const character = makeCharacter();
        const state = makeInternalState({
            difficulty: difficulties.casual,
            characters: [character],
        });
        const status = new GameStatus(state, character);
        const expectedHit = difficulties.casual.playerModifiers.hit ?? 0;

        expect(status.getModifier("hit")).toBe(expectedHit);
        expect(status.getModifier("hit")).toBe(expectedHit);
        expect(status.getModifiers()).toEqual(difficulties.casual.playerModifiers);
        expect(status.getModifiers()).toEqual(difficulties.casual.playerModifiers);
        expect(status.getModifier("hit")).toBe(expectedHit);
    });

    it("does not let mutations to returned difficulty data change engine definitions", () => {
        const engine = createStockEngine(1);
        engine.setDifficulty("casual");
        const returned = engine.getGameState();

        returned.difficulty.id = "mythic";
        returned.difficulty.playerModifiers.hit = 999;
        returned.difficulty.enemyModifiers.potency = 999;

        const character = engine.listCharacters()[0];
        if (!character) throw new Error("Expected a configured character");
        engine.loadCharacter(character);
        expect(engine.getGameState().difficulty).toEqual(difficulties.casual);
        expect(difficulties.casual.playerModifiers.hit).not.toBe(999);
        expect(difficulties.casual.enemyModifiers.potency).not.toBe(999);
    });

    it.each(Object.keys(difficulties) as DifficultyId[])(
        "publishes the configured %s definition",
        (difficulty) => {
            const engine = createStockEngine(1);
            engine.setDifficulty(difficulty);
            expect(engine.getGameState().difficulty).toEqual(difficulties[difficulty]);
        },
    );
});
