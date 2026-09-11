import { describe, expect, it } from "vitest";
import { ko } from "../src/content/characters/ko";
import { skunkette } from "../src/content/skunk/skunkette";
import { GameEngine } from "../src/engine/engine";
import type { ActionFailureReason, PlayerAction } from "../src/engine/types";
import {
    bindingState,
    buffState,
    execute,
    makeBehavioralBinding,
    makeBehavioralCharacter as makeCharacterDef,
    makeBehavioralEnemy as makeEnemyDef,
    makeBehavioralEngine,
    makeBehavioralMove as makeMove,
    makeEnemyWaitMove as makeWaitMove,
} from "./behavioralHelpers";

const AUTHORED_HIT_SEED = 3;

function expectMoveRejection(
    engine: GameEngine,
    actor: string,
    move: string,
    target: string,
    reason: ActionFailureReason,
) {
    expect(engine.getMoves(actor).find((action) => action.move.id === move)).toMatchObject({
        available: false,
        reason,
    });
    expect(engine.executeAction({
        type: "attack",
        actor,
        move,
        targets: [target],
    })).toEqual({ success: false, reason });
}

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
            resolve: (state, actor) => [{
                type: "damage",
                source: actor,
                target: state.enemies[0],
                amount: damage,
            }],
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
            resolve: (state, actor) => [{
                type: "damage",
                source: actor,
                target: state.enemies[0],
                amount: lethalDamage,
            }],
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

        expect(engine.getMoves(ko.id)).toEqual(ko.moves.map((definition) => ({
            move: {
                id: definition.id,
                target: definition.target,
                targets: definition.targets,
                type: definition.type,
            },
            available: true,
        })));
    });

    it("applies a guaranteed all-player move to every party member", () => {
        const rally = makeMove("rally", "none", {
            target: "player",
            targets: "all",
            accuracy: undefined,
            resolve: (_state, _actor, _move, targets) => targets.map(({ target }) => ({
                type: "buff" as const,
                target,
                buff: { id: "rallied", active: true },
                operation: "add" as const,
            })),
        });
        const engine = makeBehavioralEngine([
            makeCharacterDef("hero", [rally]),
            makeCharacterDef("ally"),
        ]);

        expect(engine.getAccuracyPreview("hero", "ally", rally.id)).toEqual({ none: 100 });
        const result = execute(engine, {
            type: "attack",
            actor: "hero",
            move: rally.id,
            targets: [],
        });

        expect(result.events).toEqual([
            {
                type: "moveUsed",
                actor: "hero",
                move: rally.id,
                targets: [
                    { target: "hero", result: "none" },
                    { target: "ally", result: "none" },
                ],
            },
            { type: "buffAdded", target: "hero", buff: "rallied" },
            { type: "buffAdded", target: "ally", buff: "rallied" },
        ]);
        expect(buffState(engine, "rallied", "hero")?.active).toBe(true);
        expect(buffState(engine, "rallied", "ally")?.active).toBe(true);
    });

    it.each(["missing", `${skunkette.id}1`])(
        "returns no player actions for non-character id %s",
        (id) => {
            expect(setupAuthoredCombat().getMoves(id)).toEqual([]);
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

describe("move and effect resolution through GameEngine", () => {
    it("filters missed targets and normalizes successful effects before applying them", () => {
        const move = makeMove("fractional-damage", "arms", {
            targets: "all",
            accuracy: { miss: 50, hit: 50 },
            resolve: (state, actor, _move, targets) => targets.flatMap(({ target }) => {
                const enemy = state.enemies.find((candidate) => candidate === target);
                return enemy ? [{
                    type: "damage" as const,
                    source: actor,
                    target: enemy,
                    amount: 2.2,
                }] : [];
            }),
        });
        const first = makeEnemyDef("first", [makeWaitMove()]);
        const second = makeEnemyDef("second", [makeWaitMove()]);
        const engine = makeBehavioralEngine([
            makeCharacterDef("hero", [move]),
        ], [first, second], 1);

        const result = execute(engine, {
            type: "attack",
            actor: "hero",
            move: move.id,
            targets: [],
        });
        const moveEvent = result.events[0];
        if (moveEvent.type !== "moveUsed") throw new Error("Expected moveUsed event");
        const successfulIds = moveEvent.targets
            .filter(({ result: band }) => band !== "miss")
            .map(({ target }) => target);
        const damageEvents = result.events.filter((event) => event.type === "damage");

        expect(moveEvent.targets.map(({ result: band }) => band)).toContain("miss");
        expect(successfulIds.length).toBeGreaterThan(0);
        expect(damageEvents).toEqual(successfulIds.map((target) => ({
            type: "damage",
            target,
            amount: 3,
        })));
        expect(result.state.enemies.map(({ id, currHp }) => ({ id, currHp }))).toEqual([
            { id: "first1", currHp: successfulIds.includes("first1") ? 34 : 37 },
            { id: "second2", currHp: successfulIds.includes("second2") ? 34 : 37 },
        ]);
    });

    it("resolves initial and generated effects depth-first exactly once", () => {
        const finalBuff = { id: "chain-finished", active: true };
        const chained = makeBehavioralBinding("chained", {
            onAdd: (target) => [{
                type: "buff",
                target,
                buff: finalBuff,
                operation: "add",
            }],
        });
        const trigger = makeBehavioralBinding("trigger", {
            onAdd: (target) => [{
                type: "binding",
                target,
                binding: chained,
                amount: 2,
            }],
        });
        const sibling = makeBehavioralBinding("sibling");
        const chain = makeMove("chain", "mouth", {
            target: "none",
            targets: 0,
            resolve: (state) => [
                {
                    type: "binding",
                    target: state.characters[0],
                    binding: trigger,
                    amount: 1,
                },
                {
                    type: "binding",
                    target: state.characters[0],
                    binding: sibling,
                    amount: 3,
                },
            ],
        });
        const engine = makeBehavioralEngine([
            makeCharacterDef("hero", [chain]),
        ]);

        const result = execute(engine, {
            type: "attack",
            actor: "hero",
            move: chain.id,
            targets: [],
        });

        expect(result.events).toEqual([
            { type: "moveUsed", actor: "hero", move: "chain", targets: [] },
            { type: "bondageAdded", target: "hero", binding: "trigger", amount: 1 },
            { type: "bondageAdded", target: "hero", binding: "chained", amount: 2 },
            { type: "buffAdded", target: "hero", buff: "chain-finished" },
            { type: "bondageAdded", target: "hero", binding: "sibling", amount: 3 },
        ]);
        expect(bindingState(engine, "trigger")?.value).toBe(1);
        expect(bindingState(engine, "chained")?.value).toBe(2);
        expect(bindingState(engine, "sibling")?.value).toBe(3);
        expect(buffState(engine, "chain-finished")?.active).toBe(true);
    });

    it("propagates the damage source into onDamage and resolves its effects", () => {
        const reaction = makeBehavioralBinding("damage-reaction");
        const strike = makeMove("strike", "arms", {
            resolve: (state, actor) => [{
                type: "damage",
                source: actor,
                target: state.enemies[0],
                amount: 4,
            }],
        });
        const foe = makeEnemyDef("reactive", [makeWaitMove()]);
        let receivedSource: string | undefined;
        foe.onDamage = (state, source) => {
            receivedSource = source.id;
            return [{
                type: "binding",
                target: state.characters[0],
                binding: reaction,
                amount: 1,
            }];
        };
        const engine = makeBehavioralEngine([
            makeCharacterDef("hero", [strike]),
        ], [foe]);

        const result = execute(engine, {
            type: "attack",
            actor: "hero",
            move: strike.id,
            targets: ["reactive1"],
        });

        expect(receivedSource).toBe("hero");
        expect(result.events.slice(1)).toEqual([
            { type: "damage", target: "reactive1", amount: 4 },
            { type: "bondageAdded", target: "hero", binding: "damage-reaction", amount: 1 },
        ]);
        expect(bindingState(engine, reaction.id)?.value).toBe(1);
    });

    it("resolves onDamage before defeat and onDefeat after the defeat event", () => {
        const damageReaction = makeBehavioralBinding("damage-reaction");
        const defeatReaction = makeBehavioralBinding("defeat-reaction");
        const strike = makeMove("lethal-strike", "arms", {
            resolve: (state, actor) => [{
                type: "damage",
                source: actor,
                target: state.enemies[0],
                amount: 5,
            }],
        });
        const foe = makeEnemyDef("reactive", [makeWaitMove()]);
        foe.hp = 5;
        foe.onDamage = (state) => [{
            type: "binding",
            target: state.characters[0],
            binding: damageReaction,
            amount: 1,
        }];
        foe.onDefeat = (state) => [{
            type: "binding",
            target: state.characters[0],
            binding: defeatReaction,
            amount: 1,
        }];
        const engine = makeBehavioralEngine([
            makeCharacterDef("hero", [strike]),
        ], [foe]);

        const result = execute(engine, {
            type: "attack",
            actor: "hero",
            move: strike.id,
            targets: ["reactive1"],
        });

        expect(result.events.slice(1)).toEqual([
            { type: "damage", target: "reactive1", amount: 5 },
            { type: "bondageAdded", target: "hero", binding: "damage-reaction", amount: 1 },
            { type: "enemyDefeated", target: "reactive1" },
            { type: "bondageAdded", target: "hero", binding: "defeat-reaction", amount: 1 },
        ]);
        expect(result.state.enemies).toEqual([]);
        expect(bindingState(engine, damageReaction.id)?.value).toBe(1);
        expect(bindingState(engine, defeatReaction.id)?.value).toBe(1);
    });
});
