import { describe, expect, it } from "vitest";
import { ko } from "../src/content/characters/ko";
import { skunkette } from "../src/content/skunk/skunkette";
import { resolveMove } from "../src/engine/moves";
import { GameEngine } from "../src/engine/engine";
import { isEnemy } from "../src/engine/helpers";
import type { iGameState } from "../src/engine/itypes";
import type { PlayerAction } from "../src/engine/types";
import {
    expectMoveRejection,
    makeCharacter,
    makeCharacterDef,
    makeEnemy,
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

describe("move validation and player actions", () => {
    function validationEngine() {
        const legal = makeMove("legal");
        const conditionallyUnavailable = makeMove("conditional", "mouth", {
            targets: 0,
            isValid: () => false,
        });
        const hero = makeCharacterDef("hero", [legal, conditionallyUnavailable]);
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter = { id: "validation", enemies: [foe] };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(hero);
        engine.loadEncounter(encounter.id);
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
        const mutableAction: PlayerAction = { ...action, targets: [...action.targets] };

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
            resolve: (_state, _actor, targets) => {
                const target = targets[0].target;
                return isEnemy(target)
                    ? [{ type: "damage", target, amount: damage }]
                    : [];
            },
        });
        const hero = makeCharacterDef("hero", [strike]);
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter = { id: "nonlethal-damage", enemies: [foe] };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(hero);
        engine.loadEncounter(encounter.id);
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
                {
                    type: "moveUsed",
                    actor: hero.id,
                    move: strike.id,
                    targets: [{ target: foeId, result: "hit" }],
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
            resolve: (_state, _actor, targets) => {
                const target = targets[0].target;
                return isEnemy(target)
                    ? [{ type: "damage", target, amount: lethalDamage }]
                    : [];
            },
        });
        const hero = makeCharacterDef("hero", [strike]);
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        foe.hp = enemyHp;
        const encounter = { id: "lethal-damage", enemies: [foe] };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(hero);
        engine.loadEncounter(encounter.id);
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
                {
                    type: "moveUsed",
                    actor: hero.id,
                    move: strike.id,
                    targets: [{ target: foeId, result: "hit" }],
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
            targets: [{ target: enemyId, result: "hit" }],
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

    it("rejects enemy actors through the public player-action path", () => {
        const { engine, legal, foeId } = validationEngine();

        expect(engine.executeAction({
            type: "attack",
            actor: foeId,
            move: legal.id,
            targets: ["hero"],
        })).toEqual({ success: false, reason: "invalidActor" });
    });
});

describe("move resolution", () => {
    it("filters misses and normalizes effects without mutating state", () => {
        const actor = makeCharacter("hero");
        const enemyDefinition = makeEnemyDef("foe", [makeWaitMove()]);
        const missed = makeEnemy(enemyDefinition, "foe1");
        const hit = makeEnemy(enemyDefinition, "foe2");
        const state: iGameState = {
            turn: { round: 1, step: 1, phase: "player" },
            nextEntityId: 3,
            characters: [actor],
            enemies: [missed, hit],
        };
        let resolvedTargetIds: string[] = [];
        const move = makeMove("fractional-damage", "arms", {
            targets: 2,
            resolve: (_state, _actor, targets) => {
                resolvedTargetIds = targets.map((target) => target.target.id);
                return targets.flatMap((target) => isEnemy(target.target)
                    ? [{ type: "damage" as const, target: target.target, amount: 2.2 }]
                    : []
                );
            },
        });

        const effects = resolveMove(state, move, actor, [
            { target: missed, result: "miss", effectiveness: 0 },
            { target: hit, result: "hit", effectiveness: 0.9 },
        ]);

        expect(resolvedTargetIds).toEqual([hit.id]);
        expect(effects).toEqual([{ type: "damage", target: hit, amount: 3 }]);
        expect(state.enemies.map((enemy) => enemy.currHp)).toEqual([
            enemyDefinition.hp,
            enemyDefinition.hp,
        ]);
    });
});
