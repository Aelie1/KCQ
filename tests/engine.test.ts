import { describe, expect, it } from "vitest";
import { ko } from "../src/content/characters/ko";
import { latexarms } from "../src/content/skunk/latex";
import { skunkette } from "../src/content/skunk/skunkette";
import { GameEngine } from "../src/engine/engine";
import {
    makeCharacterDef,
    makeEnemyDef,
    makeMove,
    makeWaitMove,
} from "./helpers";

const AUTHORED_HIT_SEED = 8224;

function setupAuthoredCombat(): GameEngine {
    const encounter = { id: "authored-skunkette", enemies: [skunkette] };
    const engine = new GameEngine([encounter], AUTHORED_HIT_SEED);
    engine.loadCharacter(ko);
    engine.loadEncounter(encounter.id);
    return engine;
}

describe("turn phases and enemy intentions", () => {
    it("executes Skunkette's authored Latex Spray between phase changes", () => {
        const engine = setupAuthoredCombat();
        const enemyId = `${skunkette.id}1`;
        const enemyMove = skunkette.moves[0];
        const result = engine.executeAction({ type: "endTurn" });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected endTurn to succeed");

        expect(result.events[0]).toEqual({ type: "phaseChanged", phase: "enemy" });
        expect(result.events[1]).toEqual({
            type: "moveUsed",
            actor: enemyId,
            move: enemyMove.id,
            targets: [ko.id],
        });
        const bindingEvent = result.events.find((event) => event.type === "bondageAdded");
        if (!bindingEvent || !("amount" in bindingEvent)) {
            throw new Error("Expected a bondageAdded event");
        }
        expect(bindingEvent).toMatchObject({
            type: "bondageAdded",
            target: ko.id,
            binding: latexarms.id,
        });
        expect(bindingEvent.amount).toBeGreaterThan(0);
        expect(result.events.at(-1)).toEqual({ type: "phaseChanged", phase: "player" });

        const state = engine.getGameState();
        expect(state.turn).toEqual({ round: 2, step: 1, phase: "player" });
        expect(state.characters[0].acted).toBe(false);
        expect(state.characters[0].bindings[0]).toMatchObject({ id: latexarms.id });
        expect(state.characters[0].bindings[0].value).toBe(bindingEvent.amount);
        expect(state.enemies[0].intention).toEqual({
            type: "attack",
            actor: enemyId,
            move: enemyMove.id,
            targets: [ko.id],
        });
    });

    it("resets acted characters only when returning to the player phase", () => {
        const move = makeMove("move");
        const hero = makeCharacterDef("hero", [move]);
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter = { id: "turn-phases", enemies: [foe] };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(hero);
        engine.loadEncounter(encounter.id);

        expect(engine.executeAction({
            type: "attack",
            actor: hero.id,
            move: move.id,
            targets: [`${foe.id}1`],
        }).success).toBe(true);
        expect(engine.advancePhase()).toEqual([{ type: "phaseChanged", phase: "enemy" }]);
        expect(engine.getGameState().characters[0].acted).toBe(true);
        expect(engine.advancePhase()).toEqual([{ type: "phaseChanged", phase: "player" }]);
        expect(engine.getGameState()).toMatchObject({
            turn: { round: 2, step: 1, phase: "player" },
            characters: [{ acted: false }],
        });
    });
});
