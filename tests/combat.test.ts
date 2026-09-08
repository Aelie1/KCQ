import { describe, expect, it } from "vitest";
import { ko } from "../src/content/characters/ko";
import { skunkette } from "../src/content/skunk/skunkette";
import { damageEnemy } from "../src/engine/combat";
import { GameEngine } from "../src/engine/engine";
import { isEnemy } from "../src/engine/helpers";
import type { GameAction } from "../src/engine/types";
import {
    expectMoveRejection,
    makeCharacterDef,
    makeEnemyDef,
    makeMove,
    makeWaitMove,
} from "./helpers";

const AUTHORED_HIT_SEED = 8224;

function setupAuthoredCombat(): GameEngine {
    const engine = new GameEngine(AUTHORED_HIT_SEED);
    engine.loadCharacter(ko);
    engine.loadEnemy(skunkette);
    return engine;
}

describe("move validation and player actions", () => {
    function validationEngine() {
        const legal = makeMove("legal");
        const conditionallyUnavailable = makeMove("conditional", "mouth", {
            targets: 0,
            isValid: () => false,
        });
        const hero = makeCharacterDef("hero", [legal, conditionallyUnavailable]);
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const engine = new GameEngine(1);
        engine.loadCharacter(hero);
        engine.loadEnemy(foe);
        return { engine, hero, legal, conditionallyUnavailable, foeId: `${foe.id}1` };
    }

    it.each([
        [
            "unknown actor",
            { type: "attack", actor: "missing", move: "legal", targets: ["foe1"] },
            "invalidActor",
        ],
        [
            "unknown move",
            { type: "attack", actor: "hero", move: "missing", targets: ["foe1"] },
            "invalidMove",
        ],
        [
            "unknown target",
            { type: "attack", actor: "hero", move: "legal", targets: ["missing"] },
            "invalidTarget",
        ],
        [
            "wrong target count",
            { type: "attack", actor: "hero", move: "legal", targets: [] },
            "moveUnavailable",
        ],
        [
            "wrong target side",
            { type: "attack", actor: "hero", move: "legal", targets: ["hero"] },
            "moveUnavailable",
        ],
        [
            "failed move predicate",
            { type: "attack", actor: "hero", move: "conditional", targets: [] },
            "moveUnavailable",
        ],
    ] as const)("rejects an %s without consuming the action", (_label, action, reason) => {
        const { engine } = validationEngine();
        const mutableAction: GameAction = { ...action, targets: [...action.targets] };

        expect(engine.executeAction(mutableAction)).toEqual({
            success: false,
            reason,
        });
        expect(engine.getGameState().characters[0].acted).toBe(false);
        expect(engine.getGameState().turn.step).toBe(1);
    });

    it("applies nonlethal damage without removing the enemy", () => {
        const damage = 7;
        const strike = makeMove("strike", "arms", {
            activate: (state, _actor, targets) => {
                const target = targets[0].target;
                return isEnemy(target) ? damageEnemy(state, target, damage) : [];
            },
        });
        const hero = makeCharacterDef("hero", [strike]);
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const engine = new GameEngine(1);
        engine.loadCharacter(hero);
        engine.loadEnemy(foe);
        const foeId = `${foe.id}1`;

        const result = engine.executeAction({
            type: "attack",
            actor: hero.id,
            move: strike.id,
            targets: [foeId],
        });
        expect(result).toMatchObject({
            success: true,
            events: [
                { type: "moveUsed", actor: hero.id, move: strike.id, targets: [foeId] },
                {
                    type: "accuracyResult",
                    actor: hero.id,
                    move: strike.id,
                    target: foeId,
                    result: "hit",
                    effectiveness: expect.any(Number),
                },
                { type: "damage", target: foeId, amount: damage },
            ],
        });
        if (!result.success) throw new Error("Expected strike to succeed");
        expect(result.events).not.toContainEqual({ type: "enemyDefeated", target: foeId });
        expect(engine.getGameState().enemies.map((enemy) => enemy.id)).toEqual([foeId]);
        expect(engine.getGameState().enemies[0].currHp).toBe(foe.hp - damage);
        expect(engine.getGameState().characters[0].acted).toBe(true);
        expect(engine.getGameState().turn.step).toBe(2);
        expectMoveRejection(engine, hero.id, strike.id, foeId, "actorAlreadyActed");
    });

    it("emits enemyDefeated and removes an enemy after lethal damage", () => {
        const enemyHp = 5;
        const lethalDamage = enemyHp;
        const strike = makeMove("lethal-strike", "arms", {
            activate: (state, _actor, targets) => {
                const target = targets[0].target;
                return isEnemy(target) ? damageEnemy(state, target, lethalDamage) : [];
            },
        });
        const hero = makeCharacterDef("hero", [strike]);
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        foe.hp = enemyHp;
        const engine = new GameEngine(1);
        engine.loadCharacter(hero);
        engine.loadEnemy(foe);
        const foeId = `${foe.id}1`;

        const result = engine.executeAction({
            type: "attack",
            actor: hero.id,
            move: strike.id,
            targets: [foeId],
        });

        expect(result).toMatchObject({
            success: true,
            events: [
                { type: "moveUsed", actor: hero.id, move: strike.id, targets: [foeId] },
                {
                    type: "accuracyResult",
                    actor: hero.id,
                    move: strike.id,
                    target: foeId,
                    result: "hit",
                    effectiveness: expect.any(Number),
                },
                { type: "damage", target: foeId, amount: lethalDamage },
                { type: "enemyDefeated", target: foeId },
            ],
            state: { enemies: [] },
        });
        expect(engine.getGameState().enemies).toEqual([]);
    });

    it("executes Ko's authored Telekinesis effect through the engine", () => {
        const engine = setupAuthoredCombat();
        const enemyId = `${skunkette.id}1`;
        const move = ko.moves.find((candidate) => candidate.id === "telekinesis");
        if (!move) throw new Error("Expected Ko to have Telekinesis");

        const result = engine.executeAction({
            type: "attack",
            actor: ko.id,
            move: move.id,
            targets: [enemyId],
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected Telekinesis to succeed");

        expect(result.events[0]).toEqual({
            type: "moveUsed",
            actor: ko.id,
            move: move.id,
            targets: [enemyId],
        });
        const damageEvent = result.events.find((event) => event.type === "damage");
        if (!damageEvent || !("amount" in damageEvent)) {
            throw new Error("Expected Telekinesis to deal damage");
        }
        expect(damageEvent.amount).toBeGreaterThan(0);
        expect(engine.getGameState().enemies[0].currHp).toBe(
            skunkette.hp - damageEvent.amount,
        );
    });

    it("reports authored moves without leaking their executable functions", () => {
        const engine = setupAuthoredCombat();

        expect(engine.getActions(ko.id)).toEqual(ko.moves.map((definition) => ({
            move: {
                id: definition.id,
                target: definition.target,
                targets: definition.targets,
                type: definition.type,
            },
            available: true,
        })));
    });

    it.each(["missing", `${skunkette.id}1`])(
        "returns no player actions for non-character id %s",
        (id) => {
            expect(setupAuthoredCombat().getActions(id)).toEqual([]);
        },
    );

    it("rejects attacks and reports every move unavailable outside the player phase", () => {
        const { engine, hero, legal, foeId } = validationEngine();
        engine.advancePhase();

        expectMoveRejection(engine, hero.id, legal.id, foeId, "wrongPhase");
        expect(engine.executeAction({ type: "endTurn" })).toEqual({
            success: false,
            reason: "wrongPhase",
        });
        expect(engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: "anything",
        })).toEqual({ success: false, reason: "wrongPhase" });
    });
});
