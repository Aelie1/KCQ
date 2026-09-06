import { describe, expect, it } from "vitest";
import { latexarms } from "../src/content/bindings/latex";
import { ko } from "../src/content/characters/ko";
import { skunkette } from "../src/content/enemies/skunk/skunkette";
import { addBinding } from "../src/engine/bindings";
import { GameEngine } from "../src/engine/engine";
import type { iGameState } from "../src/engine/itypes";

function setup() {
    const engine = new GameEngine();
    engine.loadCharacter(ko);
    engine.loadEnemy(skunkette);
    return engine;
}

describe("GameEngine state and loading", () => {
    it("starts with a valid blank game state", () => {
        expect(new GameEngine().getGameState()).toEqual({
            turn: { round: 1, step: 1, phase: "player" },
            characters: [],
            enemies: [],
        });
    });

    it("loads characters and creates numbered combatants", () => {
        const engine = setup();
        engine.loadEnemy(skunkette);
        expect(engine.getGameState()).toMatchObject({
            characters: [{ id: "ko", acted: false, bindings: [], buffs: [] }],
            enemies: [
                { id: "skunkette1", currHp: 20, currDef: 10, intention: null, buffs: [] },
                { id: "skunkette2", currHp: 20, currDef: 10, intention: null, buffs: [] },
            ],
        });
    });

    it("returns serialized snapshots that cannot mutate engine state", () => {
        const engine = setup();
        engine.updateIntentions();
        engine.executeAction({ type: "endTurn" });
        const snapshot = engine.getGameState();

        snapshot.turn.step = 99;
        snapshot.turn.round = 99;
        snapshot.characters[0].acted = true;
        snapshot.characters[0].bindings[0].value = 99;
        snapshot.characters[0].buffs.push({ duration: 1, effect: 2 });
        snapshot.enemies[0].currHp = 1;
        snapshot.enemies[0].currDef = 1;
        const intention = snapshot.enemies[0].intention;

        expect(intention?.type).toBe("attack");

        if (intention?.type === "attack") {
            intention.targets.push("mutated");
        }
        snapshot.enemies[0].buffs.push({ duration: 1, effect: 2 });

        const current = engine.getGameState();
        expect(current).toMatchObject({
            turn: { round: 2, step: 1, phase: "player" },
            characters: [{ acted: false, bindings: [{ id: "latexarms", value: 10 }], buffs: [] }],
            enemies: [{ currHp: 20, currDef: 10, buffs: [], intention: { type: "attack", actor: "skunkette1", move: "latexspray", targets: ["ko"] } }],
        });
    });
});

describe("player actions", () => {
    it("reports legal moves and rejects invalid or unavailable actions", () => {
        const engine = setup();
        expect(
            engine.executeAction({
                type: "attack",
                actor: "missing",
                move: "telekinesis",
                targets: ["skunkette1"],
            })
        ).toEqual({
            success: false,
            reason: "invalidActor",
        });
        expect(engine.getActions("ko")).toEqual([
            { move: { id: "telekinesis", target: "enemy", targets: 1, type: "mystical" }, available: true },
            { move: { id: "starlight", target: "enemy", targets: 0, type: "mystical" }, available: true },
        ]);
        expect(engine.executeAction({ type: "attack", actor: "ko", move: "missing", targets: ["skunkette1"] })).toEqual({ success: false, reason: "invalidMove" });
        expect(engine.executeAction({ type: "attack", actor: "ko", move: "telekinesis", targets: ["missing"] })).toEqual({ success: false, reason: "invalidTarget" });
        expect(engine.executeAction({ type: "attack", actor: "ko", move: "telekinesis", targets: ["ko"] })).toEqual({ success: false, reason: "moveUnavailable" });
    });

    it("executes an attack and prevents the character acting twice", () => {
        const engine = setup();
        const result = engine.executeAction({ type: "attack", actor: "ko", move: "telekinesis", targets: ["skunkette1"] });
        expect(result).toMatchObject({
            success: true, events: [
                { type: "moveUsed", actor: "ko", move: "telekinesis", targets: ["skunkette1"] },
                { type: "damage", target: "skunkette1", amount: 10 },
            ]
        });
        expect(engine.getGameState().enemies[0].currHp).toBe(10);
        expect(engine.getActions("ko").every(action => !action.available)).toBe(true);
        expect(engine.executeAction({ type: "attack", actor: "ko", move: "telekinesis", targets: ["skunkette1"] })).toEqual({ success: false, reason: "actorAlreadyActed" });
    });
});

describe("turn phases and enemy actions", () => {
    it("ends the player turn, executes enemy intention, and starts the next player phase", () => {
        const engine = setup();
        engine.updateIntentions();
        const result = engine.executeAction({ type: "endTurn" });
        expect(result).toMatchObject({
            success: true, events: [
                { type: "phaseChanged", phase: "enemy" },
                { type: "moveUsed", actor: "skunkette1", move: "latexspray", targets: ["ko"] },
                { type: "bondageAdded", target: "ko", binding: "latexarms", amount: 10 },
                { type: "phaseChanged", phase: "player" },
            ]
        });
        expect(engine.getGameState()).toMatchObject({ turn: { round: 2, step: 1, phase: "player" }, characters: [{ acted: false, bindings: [{ id: "latexarms", value: 10 }] }] });
    });

    it("rejects player turn ending outside the player phase and rejects player actions in enemy phase", () => {
        const engine = setup();
        engine.advancePhase();
        expect(engine.executeAction({ type: "endTurn" })).toEqual({ success: false, reason: "wrongPhase" });
        expect(engine.executeAction({ type: "attack", actor: "ko", move: "telekinesis", targets: ["skunkette1"] })).toEqual({ success: false, reason: "wrongPhase" });
        expect(engine.getActions("ko").every(action => action.reason === "wrongPhase")).toBe(true);
    });
});

describe("bindings", () => {
    it("creates, modifies, and caps a binding", () => {
        const state: iGameState = { turn: { round: 1, step: 1, phase: "player" }, characters: [{ id: "ko", definition: ko, acted: false, bindings: [], buffs: [] }], enemies: [] };
        const character = state.characters[0];
        expect(addBinding(state, character, latexarms, 30)).toEqual([{ type: "bondageAdded", target: "ko", binding: "latexarms", amount: 30 }]);
        expect(addBinding(state, character, latexarms, 80)).toEqual([{ type: "bondageChanged", target: "ko", binding: "latexarms", amount: 70 }]);
        expect(character.bindings).toEqual([{ definition: latexarms, id: "latexarms", value: 100 }]);
    });
});
