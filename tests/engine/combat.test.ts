import { describe, expect, it } from "vitest";
import { ko } from "../../src/content/characters/ko";
import { skunkette } from "../../src/content/skunk/skunkette";
import { createCustomEngine } from "../../src/engine/protected/engine";
import type { Engine, FailureReason, PlayerAction } from "../../src/engine/public/types";
import {
    bindingState, buffState, execute, makeBehavioralBinding, makeBehavioralEngine, makeBehavioralCharacter as makeCharacterDef,
    makeBehavioralEnemy as makeEnemyDef, makeBehavioralMove as makeMove, makeEnemyWaitMove as makeWaitMove, targetAccuracy,
} from "../helpers/behavioralHelpers";
import { actionView } from "../helpers/gameView";

const AUTHORED_HIT_SEED = 2;

function expectMoveRejection(
    engine: Engine,
    actor: string,
    move: string,
    target: string,
    reason: FailureReason,
) {
    expect(actionView(engine, actor).moves.find((action) => action.move.id === move)).toMatchObject({
        available: false,
        reason,
    });
    expect(engine.executeAction({
        type: "move",
        actor,
        move,
        targets: [target],
    })).toEqual({ success: false, reason });
}

function setupAuthoredCombat(): Engine {
    const encounter = { id: "authored-skunkette", enemies: [skunkette], bindings: [], traps: [] };
    const engine = createCustomEngine([encounter], [ko], AUTHORED_HIT_SEED);
    engine.loadCharacter(ko.id);
    engine.loadEncounter(encounter.id);
    return engine;
}

describe("move validation and player actions", () => {
    function validationEngine() {
        const legal = makeMove("legal");
        const targetless = makeMove("targetless", "mouth", {
            targetSide: "none",
            targets: 0,
        });
        const allTargets = makeMove("all-targets", "mouth", { targets: "all" });
        const twoTargets = makeMove("two-targets", "mouth", { targets: 2 });
        const hero = makeCharacterDef("hero", [legal, targetless, allTargets, twoTargets]);
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter = { id: "validation", enemies: [foe], bindings: [], traps: [] };
        const engine = createCustomEngine([encounter], [hero], 1);
        engine.loadCharacter(hero.id);
        engine.loadEncounter(encounter.id);
        return { engine, hero, legal, targetless, allTargets, twoTargets, foeId: `${foe.id}1` };
    }

    it.each([
        [
            "unknown actor",
            { type: "move", actor: "missing", move: "legal", targets: ["foe1"] },
            "invalidActor",
        ],
        [
            "unknown move",
            { type: "move", actor: "hero", move: "missing", targets: ["foe1"] },
            "invalidMove",
        ],
        [
            "unknown target",
            { type: "move", actor: "hero", move: "legal", targets: ["missing"] },
            "invalidTarget",
        ],
        [
            "wrong target count",
            { type: "move", actor: "hero", move: "legal", targets: [] },
            "invalidTargetCount",
        ],
        [
            "wrong target side",
            { type: "move", actor: "hero", move: "legal", targets: ["hero"] },
            "invalidTarget",
        ],
        [
            "duplicate numeric targets",
            { type: "move", actor: "hero", move: "two-targets", targets: ["foe1", "foe1"] },
            "duplicateTargets",
        ],
        [
            "explicit target for a targetless move",
            { type: "move", actor: "hero", move: "targetless", targets: ["foe1"] },
            "invalidTargetCount",
        ],
        [
            "explicit target for an all-target move",
            { type: "move", actor: "hero", move: "all-targets", targets: ["foe1"] },
            "invalidTargetCount",
        ],
    ] as const)("rejects an %s without consuming the action", (_label, action, reason) => {
        const { engine } = validationEngine();
        const mutableAction: PlayerAction = { ...action, targets: [...action.targets] };

        expect(engine.executeAction(mutableAction)).toEqual({
            success: false,
            reason,
        });
        expect(engine.getGameView().characters[0].acted).toBe(false);
        expect(engine.getGameView().turn.step).toBe(1);
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
        const encounter = { id: "nonlethal-damage", enemies: [foe], bindings: [], traps: [] };
        const engine = createCustomEngine([encounter], [hero], 1);
        engine.loadCharacter(hero.id);
        engine.loadEncounter(encounter.id);
        const foeId = `${foe.id}1`;

        const result = engine.executeAction({
            type: "move",
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
                { type: "enemyDamaged", target: foeId, amount: damage },
            ],
        });
        if (!result.success) throw new Error("Expected strike to succeed");
        expect(result.events).not.toContainEqual({ type: "enemyDefeated", target: foeId });
        expect(engine.getGameView().enemies.map((enemy) => enemy.id)).toEqual([foeId]);
        expect(engine.getGameView().enemies[0].currHp).toBe(foe.hp - damage);
        expect(engine.getGameView().characters[0].acted).toBe(true);
        expect(engine.getGameView().turn.step).toBe(2);
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
        const encounter = { id: "lethal-damage", enemies: [foe], bindings: [], traps: [] };
        const engine = createCustomEngine([encounter], [hero], 1);
        engine.loadCharacter(hero.id);
        engine.loadEncounter(encounter.id);
        const foeId = `${foe.id}1`;

        const result = engine.executeAction({
            type: "move",
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
                { type: "enemyDamaged", target: foeId, amount: lethalDamage },
                { type: "enemyDefeated", target: foeId },
            ],
            view: { enemies: [] },
        });
        expect(engine.getGameView().enemies).toEqual([]);
    });

    it("executes Ko's authored Telekinesis effect through the engine", () => {
        const engine = setupAuthoredCombat();
        const enemyId = `${skunkette.id}1`;
        const move = actionView(engine, ko.id).moves.find(({ move }) => move.id === "telekinesis")?.move;
        if (!move) throw new Error("Expected Ko to have Telekinesis");

        const result = engine.executeAction({
            type: "move",
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
        const damageEvent = result.events.find((event) => event.type === "enemyDamaged");
        if (!damageEvent || !("amount" in damageEvent)) {
            throw new Error("Expected Telekinesis to deal damage");
        }
        expect(damageEvent.amount).toBeGreaterThan(0);
        expect(engine.getGameView().enemies[0].currHp).toBe(
            skunkette.hp - damageEvent.amount,
        );
    });

    it("exposes, targets, and executes Ko's authored Fairy Telekinesis", () => {
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        foe.hp = 500;
        const encounter = { id: "fairy-telekinesis", enemies: [foe], bindings: [], traps: [] };
        const engine = createCustomEngine([encounter], [ko], AUTHORED_HIT_SEED);
        engine.loadCharacter(ko.id);
        engine.loadEncounter(encounter.id);
        const enemyId = "foe1";
        expect(engine.executeAction({
            type: "move",
            actor: ko.id,
            move: "fairyTransformation",
            targets: [],
        }).success).toBe(true);
        expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);

        const action = actionView(engine, ko.id).moves.find(({ move }) => move.id === "fairyTelekinesis");
        if (!action) throw new Error("Expected empowered Ko to have Fairy Telekinesis");
        const { move } = action;

        expect(action).toMatchObject({
            move: {
                id: move.id,
                targetSide: "enemy",
                targets: "all",
                type: "mouth",
            },
            available: true,
        });
        expect(action.targets).toContainEqual({
            target: enemyId,
            valid: true,
            accuracy: expect.any(Object),
            damage: expect.any(Object),
            effects: expect.any(Array),
        });

        const result = engine.executeAction({
            type: "move",
            actor: ko.id,
            move: move.id,
            targets: [],
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected Fairy Telekinesis to succeed");

        expect(result.events[0]).toEqual({
            type: "moveUsed",
            actor: ko.id,
            move: move.id,
            targets: [{ target: enemyId, result: "hit" }, { target: enemyId, result: "crit" }],
        });
        const damageEvents = result.events.filter((event) => event.type === "enemyDamaged");
        let totalDamage = 0;
        for (const damageEvent of damageEvents) {
            if (!damageEvent || damageEvent.type !== "enemyDamaged") {
                throw new Error("Expected Fairy Telekinesis to damage an enemy");
            }
            expect(damageEvent).toMatchObject({ target: enemyId, amount: expect.any(Number) });
            expect(damageEvent.amount).toBeGreaterThan(0);
            totalDamage += damageEvent.amount;
        }
        expect(engine.getGameView().enemies[0].currHp).toBe(
            foe.hp - totalDamage,
        );
    });

    it("reports authored moves without leaking their executable functions", () => {
        const engine = setupAuthoredCombat();

        const definitions = ko.getMoves({
            id: ko.id,
            definition: ko,
            acted: false,
            standing: false,
            bonusEscapes: 0,
            bindings: [],
            buffs: [],
            data: {}
        });
        const moves = actionView(engine, ko.id).moves.map(({ move, available }) => ({ move, available }));
        expect(moves).toEqual(definitions.map((definition) => ({
            move: {
                id: definition.id,
                targetSide: definition.targetSide,
                targets: definition.targets,
                type: definition.type,
            },
            available: true,
        })));
    });

    it("applies a guaranteed all-player move to every party member", () => {
        const rally = makeMove("rally", "none", {
            targetSide: "player",
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

        expect(targetAccuracy(engine, "hero", rally.id, "ally")).toBeNull();
        const result = execute(engine, {
            type: "move",
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
        expect(buffState(engine, "rallied", "hero")).toMatchObject({ id: "rallied" });
        expect(buffState(engine, "rallied", "ally")).toMatchObject({ id: "rallied" });
        expect(buffState(engine, "rallied", "hero")).not.toHaveProperty("active");
        expect(buffState(engine, "rallied", "ally")).not.toHaveProperty("active");
    });

    it.each(["missing", `${skunkette.id}1`])(
        "returns no player actions for non-character id %s",
        (id) => {
            expect(setupAuthoredCombat().getGameView().actions
                .find((action) => action.id === id)).toBeUndefined();
        },
    );

    it("rejects enemy actors through the public player-action path", () => {
        const { engine, legal, foeId } = validationEngine();

        expect(engine.executeAction({
            type: "move",
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
            type: "move",
            actor: "hero",
            move: move.id,
            targets: [],
        });
        const moveEvent = result.events[0];
        if (moveEvent.type !== "moveUsed") throw new Error("Expected moveUsed event");
        const successfulIds = moveEvent.targets
            .filter(({ result: band }) => band !== "miss")
            .map(({ target }) => target);
        const damageEvents = result.events.filter((event) => event.type === "enemyDamaged");

        expect(moveEvent.targets.map(({ result: band }) => band)).toContain("miss");
        expect(successfulIds.length).toBeGreaterThan(0);
        expect(damageEvents).toEqual(successfulIds.map((target) => ({
            type: "enemyDamaged",
            target,
            amount: 3,
        })));
        expect(result.view.enemies.map(({ id, currHp }) => ({ id, currHp }))).toEqual([
            { id: "first1", currHp: successfulIds.includes("first1") ? 34 : 37 },
            { id: "second1", currHp: successfulIds.includes("second2") ? 34 : 37 },
        ]);
    });

    it("resolves initial and generated effects depth-first exactly once", () => {
        const finalBuff = { id: "chain-finished", active: true };
        const chained = makeBehavioralBinding("chained", {
            onAdd: (_state, target) => [{
                type: "buff",
                target,
                buff: finalBuff,
                operation: "add",
            }],
        });
        const trigger = makeBehavioralBinding("trigger", {
            onAdd: (_state, target) => [{
                type: "binding",
                source: target,
                target,
                binding: chained,
                amount: 2,
            }],
        });
        const sibling = makeBehavioralBinding("sibling");
        const chain = makeMove("chain", "mouth", {
            targetSide: "none",
            targets: 0,
            resolve: (state, actor) => [
                {
                    type: "binding",
                    source: actor,
                    target: state.characters[0],
                    binding: trigger,
                    amount: 1,
                },
                {
                    type: "binding",
                    source: actor,
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
            type: "move",
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
        expect(buffState(engine, "chain-finished")).toMatchObject({ id: "chain-finished" });
        expect(buffState(engine, "chain-finished")).not.toHaveProperty("active");
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
        foe.onDamage = (state, source, target) => {
            receivedSource = source.id;
            return [{
                type: "binding",
                source: target,
                target: state.characters[0],
                binding: reaction,
                amount: 1,
            }];
        };
        const engine = makeBehavioralEngine([
            makeCharacterDef("hero", [strike]),
        ], [foe]);

        const result = execute(engine, {
            type: "move",
            actor: "hero",
            move: strike.id,
            targets: ["reactive1"],
        });

        expect(receivedSource).toBe("hero");
        expect(result.events.slice(1)).toEqual([
            { type: "enemyDamaged", target: "reactive1", amount: 4 },
            { type: "bondageAdded", target: "hero", binding: "damage-reaction", amount: 1 },
        ]);
        expect(bindingState(engine, reaction.id)?.value).toBe(1);
    });

    it("resolves onDamage and onDefeat depth-first before removing the enemy", () => {
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
        foe.onDamage = (state, _source, target) => [{
            type: "binding",
            source: target,
            target: state.characters[0],
            binding: damageReaction,
            amount: 1,
        }];
        foe.onDefeat = (state, target) => [{
            type: "binding",
            source: target,
            target: state.characters[0],
            binding: defeatReaction,
            amount: 1,
        }];
        const engine = makeBehavioralEngine([
            makeCharacterDef("hero", [strike]),
        ], [foe]);

        const result = execute(engine, {
            type: "move",
            actor: "hero",
            move: strike.id,
            targets: ["reactive1"],
        });

        expect(result.events.slice(1)).toEqual([
            { type: "enemyDamaged", target: "reactive1", amount: 5 },
            { type: "bondageAdded", target: "hero", binding: "damage-reaction", amount: 1 },
            { type: "bondageAdded", target: "hero", binding: "defeat-reaction", amount: 1 },
            { type: "enemyDefeated", target: "reactive1" },
        ]);
        expect(result.view.enemies).toEqual([]);
        expect(bindingState(engine, damageReaction.id)?.value).toBe(1);
        expect(bindingState(engine, defeatReaction.id)?.value).toBe(1);
    });
});
