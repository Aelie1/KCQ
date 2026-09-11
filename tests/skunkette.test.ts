import { describe, expect, it } from "vitest";
import { latexArms, latexHead, latexLegs, latexTorso } from "../src/content/skunk/latex";
import { latexMist, pounce, skunkette, throwOff } from "../src/content/skunk/skunkette";
import { processEffects } from "../src/engine/combat";
import { damageEnemy } from "../src/engine/enemies";
import { GameEngine } from "../src/engine/engine";
import { findBuff } from "../src/engine/find";
import type { iCharacter, iEnemy, iGameState } from "../src/engine/itypes";
import { resolveMove } from "../src/engine/moves";
import {
    makeBinding,
    makeCharacter,
    makeCharacterDef,
    makeEnemy,
} from "./helpers";

function makeState(character: iCharacter, enemy: iEnemy): iGameState {
    return {
        turn: { round: 1, step: 1, phase: "player" },
        nextEntityId: 2,
        characters: [character],
        enemies: [enemy],
    };
}

function setupPounce(effectiveness = 1.6) {
    const character = makeCharacter("hero");
    const enemy = makeEnemy(skunkette, "skunkette1");
    const state = makeState(character, enemy);
    const effects = resolveMove(
        state,
        { definition: pounce, binding: latexArms, roll: 50 },
        enemy,
        [{ target: character, result: "crit", effectiveness }],
    );
    processEffects(state, effects);
    return { character, enemy, state };
}

describe("Skunkette", () => {
    it.each([
        [0.8, 2, ["immobilized"]],
        [0.9, 4, ["immobilized"]],
        [1.0, 6, ["immobilized", "stunned"]],
        [1.6, 8, ["immobilized", "helpless"]],
    ] as const)(
        "creates the expected Pounce severity at effectiveness %s",
        (effectiveness, enemyHit, statusIds) => {
            const character = makeCharacter("hero");
            const enemy = makeEnemy(skunkette, "skunkette1");
            const effects = resolveMove(
                makeState(character, enemy),
                { definition: pounce, binding: latexArms, roll: 50 },
                enemy,
                [{ target: character, result: "hit", effectiveness }],
            );
            const characterPounce = effects.find(
                (effect) => effect.type === "buff" && effect.target === character,
            );
            const enemyPounce = effects.find(
                (effect) => effect.type === "buff" && effect.target === enemy,
            );
            if (characterPounce?.type !== "buff" || enemyPounce?.type !== "buff") {
                throw new Error("Expected linked Pounce buffs");
            }

            expect(characterPounce.buff.statuses?.map((status) => status.definition.id))
                .toEqual(statusIds);
            expect(enemyPounce.buff.modifiers).toMatchObject({
                defense: -2,
                hit: enemyHit,
            });
        },
    );

    it("adds a free Spray effect on a sufficiently strong Pounce crit", () => {
        const character = makeCharacter("hero");
        const enemy = makeEnemy(skunkette, "skunkette1");

        const effects = resolveMove(
            makeState(character, enemy),
            { definition: pounce, binding: latexArms, roll: 50 },
            enemy,
            [{ target: character, result: "crit", effectiveness: 1.8 }],
        );

        expect(effects).toContainEqual({
            type: "binding",
            target: character,
            binding: latexArms,
            amount: 13,
        });
    });

    it("weakens both sides of an active Pounce when the Skunkette is damaged", () => {
        const { character, enemy, state } = setupPounce();
        expect(findBuff(enemy, "pounce")?.modifiers?.hit).toBe(8);

        const events = damageEnemy(state, character, enemy, 1);

        expect(events).toEqual([
            { type: "damage", target: enemy.id, amount: 1 },
            { type: "buffUpdated", target: character.id, buff: "pounce" },
            { type: "buffUpdated", target: enemy.id, buff: "pounce" },
        ]);
        expect(findBuff(enemy, "pounce")?.modifiers?.hit).toBe(6);
        expect(findBuff(character, "pounce")?.statuses?.map((status) => status.definition.id))
            .toEqual(["immobilized", "stunned"]);
    });

    it("removes the linked character Pounce after damage callbacks and defeat", () => {
        const { character, enemy, state } = setupPounce();

        const events = damageEnemy(state, character, enemy, enemy.currHp);

        expect(events).toEqual([
            { type: "damage", target: enemy.id, amount: skunkette.hp },
            { type: "buffUpdated", target: character.id, buff: "pounce" },
            { type: "buffUpdated", target: enemy.id, buff: "pounce" },
            { type: "enemyDefeated", target: enemy.id },
            { type: "buffRemoved", target: character.id, buff: "pounce" },
        ]);
        expect(findBuff(character, "pounce")).toBeUndefined();
        expect(state.enemies).toEqual([]);
    });

    it("keeps Pounce linked when Throw Off misses and starts cooldown when it hits", () => {
        const { character, enemy, state } = setupPounce(1.0);

        expect(resolveMove(
            state,
            { definition: throwOff, result: "miss", effectiveness: 0 },
            character,
            [],
        )).toEqual([]);
        expect(findBuff(character, "pounce")).toBeDefined();
        expect(findBuff(enemy, "pounce")).toBeDefined();
        expect(enemy.cooldowns.pounce).toBeUndefined();

        const effects = resolveMove(
            state,
            { definition: throwOff, result: "hit", effectiveness: 0.9 },
            character,
            [],
        );
        processEffects(state, effects);

        expect(findBuff(character, "pounce")).toBeUndefined();
        expect(findBuff(enemy, "pounce")).toBeUndefined();
        expect(enemy.cooldowns.pounce).toBe(pounce.cooldown);
    });

    it("follows a Pounce with a dynamically selected Spray binding", () => {
        const encounter = { id: "skunkette-ai", enemies: [skunkette] };
        const engine = new GameEngine([encounter], 3);
        engine.loadCharacter(makeCharacterDef("hero"));
        engine.loadEncounter(encounter.id);

        expect(engine.getGameState().enemies[0].intention?.move).toBe(pounce.id);
        expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);
        const nextIntention = engine.getGameState().enemies[0].intention;
        const bindingEffect = nextIntention?.targets[0].effects.find(
            (effect) => effect.type === "binding",
        );

        expect(nextIntention?.move).toBe("latexSpray");
        expect(bindingEffect?.type).toBe("binding");
        if (bindingEffect?.type !== "binding") throw new Error("Expected Spray binding");
        expect([latexHead.id, latexArms.id, latexTorso.id, latexLegs.id])
            .toContain(bindingEffect.binding);
    });

    it("uses independent target rolls and one shared spread modifier for Latex Mist", () => {
        const mistEnemy = {
            ...skunkette,
            id: "mist-skunkette",
            ai: (_state: iGameState, actor: iEnemy) => ({
                actor,
                move: { definition: latexMist },
                targets: [],
            }),
        };
        const encounter = {
            id: "latex-mist",
            enemies: [mistEnemy],
            setup: (state: iGameState) => {
                state.characters[0].bindings.push(makeBinding(latexArms, 10));
                state.characters[1].bindings.push(makeBinding(latexHead, 10));
            },
        };
        const engine = new GameEngine([encounter], 3);
        engine.loadCharacter(makeCharacterDef("first"));
        engine.loadCharacter(makeCharacterDef("second"));
        engine.loadEncounter(encounter.id);

        const preview = engine.getGameState().enemies[0].intention;
        expect(preview?.move).toBe(latexMist.id);
        expect(preview?.targets.map(({ target, result }) => ({ target, result }))).toEqual([
            { target: "first", result: "miss" },
            { target: "second", result: "hit" },
        ]);
        expect(preview?.targets[0].effects).toContainEqual({
            type: "buff",
            source: "mist-skunkette1",
            target: "first",
            buff: latexMist.id,
            added: true,
        });
        expect(preview?.targets[1].effects).toContainEqual(
            expect.objectContaining({
                type: "binding",
                target: "second",
                binding: latexHead.id,
            }),
        );

        expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);
        const state = engine.getGameState();
        expect(state.characters.map((character) => character.buffs[0])).toEqual([
            expect.objectContaining({ modifiers: { spread: 1 }, active: true, duration: 1 }),
            expect.objectContaining({ modifiers: { spread: 1 }, active: true, duration: 1 }),
        ]);
        expect(state.characters[0].bindings[0].value).toBe(10);
        expect(state.characters[1].bindings[0].value).toBeGreaterThan(10);
    });
});
