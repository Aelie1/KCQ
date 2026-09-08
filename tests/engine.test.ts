import { describe, expect, it } from "vitest";
import { ko } from "../src/content/characters/ko";
import { latexarms } from "../src/content/skunk/latex";
import { skunkette } from "../src/content/skunk/skunkette";
import { GameEngine } from "../src/engine/engine";
import { isCharacter } from "../src/engine/helpers";
import type { iBuff, StatusDef } from "../src/engine/itypes";
import { XorShift32 } from "../src/engine/random";
import {
    makeCharacterDef,
    makeBindingDef,
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
            targets: [{ target: ko.id, result: "hit" }],
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
            move: enemyMove.displayId,
            targets: [{
                target: ko.id,
                result: expect.any(String),
                effects: [{
                    type: "binding",
                    target: ko.id,
                    binding: latexarms.id,
                    amount: expect.any(Number),
                }],
            }],
            effects: [],
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
        expect(engine.getGameState().characters[0].acted).toBe(true);

        const endTurn = engine.executeAction({ type: "endTurn" });
        expect(endTurn.success).toBe(true);
        if (!endTurn.success) throw new Error("Expected endTurn to succeed");
        expect(endTurn.events[0]).toEqual({ type: "phaseChanged", phase: "enemy" });
        expect(endTurn.events.at(-1)).toEqual({ type: "phaseChanged", phase: "player" });
        expect(engine.getGameState()).toMatchObject({
            turn: { round: 2, step: 1, phase: "player" },
            characters: [{ acted: false }],
        });
    });
});

describe("enemy intention previews", () => {
    function setupPreviewEngine(seed = 8224) {
        const enemyMove = makeMove("threat", "enemy", {
            target: "player",
            accuracy: { miss: 20, graze: 20, hit: 50, crit: 10 },
        });
        const enemy = makeEnemyDef("foe", [enemyMove]);
        const encounter = { id: "preview", enemies: [enemy] };
        const engine = new GameEngine([encounter], seed);
        engine.loadCharacter(makeCharacterDef("hero"));
        engine.loadEncounter(encounter.id);
        return { engine, enemyMove, enemyId: "foe1" };
    }

    it("matches the eventual enemy result when live state is unchanged", () => {
        const { engine, enemyMove, enemyId } = setupPreviewEngine();
        const preview = engine.getGameState().enemies[0].intention;
        if (!preview) throw new Error("Expected an enemy intention");

        const result = engine.executeAction({ type: "endTurn" });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected endTurn to succeed");
        const moveEvent = result.events.find(
            (event) => event.type === "moveUsed" && event.actor === enemyId,
        );

        expect(preview.move).toBe(enemyMove.id);
        expect(moveEvent).toMatchObject({
            actor: enemyId,
            move: preview.move,
            targets: [{
                target: preview.targets[0].target,
                result: preview.targets[0].result,
            }],
        });
        expect(preview.targets[0].effects).toEqual([]);
        expect(preview.effects).toEqual([]);
    });

    it("does not consume RNG during serialization and commits a fresh roll next round", () => {
        const seed = 123456;
        const pressure = makeBindingDef("pressure");
        const alwaysHit = makeMove("certain-threat", "enemy", {
            target: "player",
            accuracy: { hit: 100 },
            resolve: (_state, _actor, targets) => targets.flatMap((target) =>
                isCharacter(target.target)
                    ? [{
                        type: "binding" as const,
                        target: target.target,
                        binding: pressure,
                        amount: 10 * target.effectiveness,
                    }]
                    : []
            ),
        });
        const enemy = makeEnemyDef("foe", [alwaysHit]);
        const encounter = { id: "stable-preview", enemies: [enemy] };
        const engine = new GameEngine([encounter], seed);
        engine.loadCharacter(makeCharacterDef("hero"));
        engine.loadEncounter(encounter.id);

        const previews = Array.from(
            { length: 5 },
            () => engine.getGameState().enemies[0].intention,
        );
        expect(previews.every((preview) => preview !== null)).toBe(true);
        expect(previews).toEqual(Array(5).fill(previews[0]));

        const rng = new XorShift32(seed);
        const firstRoll = rng.accuracy();
        const secondRoll = rng.accuracy();
        expect(previews[0]!.targets[0]).toEqual({
            target: "hero",
            result: "hit",
            effects: [{
                type: "binding",
                target: "hero",
                binding: pressure.id,
                amount: Math.ceil(10 * (0.8 + firstRoll * 0.002)),
            }],
        });
        expect(previews[0]!.effects).toEqual([]);

        expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);
        const nextPreview = engine.getGameState().enemies[0].intention;
        expect(nextPreview?.targets[0]).toEqual({
            target: "hero",
            result: "hit",
            effects: [{
                type: "binding",
                target: "hero",
                binding: pressure.id,
                amount: Math.ceil(10 * (0.8 + secondRoll * 0.002)),
            }],
        });
        expect(nextPreview).not.toEqual(previews[0]);
    });

    it("recalculates against live modifiers while retaining the committed roll", () => {
        const seed = 8224;
        const committedRoll = new XorShift32(seed).accuracy();
        expect(committedRoll).toBeGreaterThan(50);
        expect(committedRoll).toBeLessThan(70);

        const defenseStatus: StatusDef = {
            id: "breathless",
            levels: [{}, { modifiers: { defense: 20 } }],
        };
        const defenseBuff: iBuff = {
            id: "guarded",
            duration: 1,
            active: false,
            statuses: [{ definition: defenseStatus, value: 1 }],
        };
        const guard = makeMove("guard", "mouth", {
            targets: 0,
            resolve: (_state, actor) => [{
                type: "buff",
                source: actor,
                target: actor,
                buff: defenseBuff,
            }],
        });
        const enemyMove = makeMove("swing", "enemy", {
            target: "player",
            accuracy: { miss: 50, hit: 50 },
        });
        const enemy = makeEnemyDef("foe", [enemyMove]);
        const encounter = { id: "live-preview", enemies: [enemy] };
        const engine = new GameEngine([encounter], seed);
        engine.loadCharacter(makeCharacterDef("hero", [guard]));
        engine.loadEncounter(encounter.id);

        const before = engine.getGameState().enemies[0].intention;
        expect(before?.targets[0].result).toBe("hit");

        expect(engine.executeAction({
            type: "attack",
            actor: "hero",
            move: guard.id,
            targets: [],
        }).success).toBe(true);
        const after = engine.getGameState().enemies[0].intention;
        expect(after?.targets[0]).toEqual({
            target: "hero",
            result: "miss",
            effects: [],
        });
        expect(after?.effects).toEqual([]);

        const result = engine.executeAction({ type: "endTurn" });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected endTurn to succeed");
        expect(result.events).toContainEqual({
            type: "moveUsed",
            actor: "foe1",
            move: enemyMove.id,
            targets: [{
                target: "hero",
                result: after!.targets[0].result,
            }],
        });
    });

    it("routes enemies through the enemy executor, not the public player path", () => {
        const { engine, enemyMove, enemyId } = setupPreviewEngine();

        expect(engine.executeAction({
            type: "attack",
            actor: enemyId,
            move: enemyMove.id,
            targets: ["hero"],
        })).toEqual({ success: false, reason: "invalidActor" });

        const result = engine.executeAction({ type: "endTurn" });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected endTurn to succeed");
        expect(result.events).toContainEqual(expect.objectContaining({
            type: "moveUsed",
            actor: enemyId,
            move: enemyMove.id,
        }));
    });
});
