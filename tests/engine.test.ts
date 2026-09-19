import { describe, expect, it } from "vitest";
import { ko } from "../src/content/characters/ko";
import { encounterList } from "../src/content/content";
import { plains_1 } from "../src/content/skunk/encounters";
import { skunkette } from "../src/content/skunk/skunkette";
import type { StatusDef } from "../src/engine/protected/definitions";
import { stunned } from "../src/engine/protected/statuses";
import { GameEngine } from "../src/engine/public/engine";
import type { PlayerAction } from "../src/engine/public/types";
import {
    makeBindingDef,
    makeCharacterDef,
    makeEnemyDef,
    makeMove,
    makeWaitMove,
} from "./helpers";

const AUTHORED_HIT_SEED = 3;

function setupAuthoredCombat(): GameEngine {
    const encounter = { id: "authored-skunkette", enemies: [skunkette], bindings: [], traps: [] };
    const engine = new GameEngine([encounter], AUTHORED_HIT_SEED);
    engine.loadCharacter(ko);
    engine.loadEncounter(encounter.id);
    return engine;
}

describe("turn phases and enemy intentions", () => {
    it("replays an authored encounter identically despite aggressive public queries", () => {
        const run = (queryBetweenActions: boolean) => {
            const engine = new GameEngine(encounterList, 123456);
            engine.loadCharacter(ko);
            const loadEvents = engine.loadEncounter(plains_1.id);
            const snapshots = [engine.getGameState()];
            const results: ReturnType<GameEngine["executeAction"]>[] = [];
            const actions: PlayerAction[] = [
                { type: "stance", actor: ko.id },
                { type: "move", actor: ko.id, move: "telekinesis", targets: ["skunkette1"] },
                { type: "endTurn" },
            ];
            const query = () => {
                engine.getGameState();
                engine.getMoves(ko.id);
                engine.getEscapes(ko.id);
                engine.getAvailability();
                engine.stanceAvailable(ko.id);
            };

            for (const action of actions) {
                if (queryBetweenActions) {
                    query();
                    query();
                }
                const result = engine.executeAction(action);
                expect(result.success).toBe(true);
                results.push(result);
                snapshots.push(engine.getGameState());
                if (queryBetweenActions) query();
            }

            return { loadEvents, results, snapshots, finalState: engine.getGameState() };
        };

        expect(run(true)).toEqual(run(false));
    });

    it("executes Skunkette's authored intention between phase changes", () => {
        const engine = setupAuthoredCombat();
        const enemyId = `${skunkette.id}1`;
        const intentions = engine.getGameState().enemies[0].intentions;
        expect(intentions).toHaveLength(1);
        const preview = intentions[0];
        if (!preview) throw new Error("Expected an authored intention");
        const result = engine.executeAction({ type: "endTurn" });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected endTurn to succeed");

        expect(result.events[0]).toEqual({ type: "phaseChanged", phase: "enemy" });
        expect(result.events[1]).toEqual({
            type: "moveUsed",
            actor: enemyId,
            move: preview.move,
            targets: preview.targets.map(({ target, band: band }) => ({
                target,
                result: band,
            })),
        });
        expect(result.events).toContainEqual({
            type: "buffAdded",
            target: ko.id,
            buff: "pounce",
        });
        expect(result.events).toContainEqual({
            type: "buffAdded",
            target: enemyId,
            buff: "pounce",
        });
        expect(result.events.at(-1)).toEqual({ type: "phaseChanged", phase: "player" });

        const state = engine.getGameState();
        expect(state.turn).toEqual({ outcome: "ongoing", round: 2, step: 1, phase: "player" });
        expect(state.characters[0].acted).toBe(false);
        expect(state.characters[0].buffs).toContainEqual(
            expect.objectContaining({ id: "pounce", linkedEntity: enemyId }),
        );
        expect(state.enemies[0].buffs).toContainEqual(
            expect.objectContaining({ id: "pounce", linkedEntity: ko.id }),
        );
        expect(state.enemies[0].intentions).toHaveLength(1);
    });

    it("resets acted characters only when returning to the player phase", () => {
        const move = makeMove("move");
        const hero = makeCharacterDef("hero", [move]);
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter = { id: "turn-phases", enemies: [foe], bindings: [], traps: [] };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(hero);
        engine.loadEncounter(encounter.id);

        expect(engine.executeAction({
            type: "move",
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

    it("cancels a committed enemy intention when an active status blocks attacking", () => {
        const threatened = makeBindingDef("threatened");
        const threat = makeMove("threat", "none", {
            targetSide: "player",
            resolve: (state, actor) => [{
                type: "binding",
                source: actor,
                target: state.characters[0],
                binding: threatened,
                amount: 10,
            }],
        });
        const stunEnemy = makeMove("stun-enemy", "mouth", {
            targetSide: "none",
            targets: 0,
            resolve: (state) => [{
                type: "buff",
                target: state.enemies[0],
                buff: {
                    id: "stunned-enemy",
                    active: true,
                    statuses: [{ definition: stunned, value: 1 }],
                },
                operation: "add",
            }],
        });
        const foe = makeEnemyDef("foe", [threat]);
        const encounter = { id: "cancel-intention", enemies: [foe], bindings: [], traps: [] };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(makeCharacterDef("hero", [stunEnemy]));
        engine.loadEncounter(encounter.id);

        expect(engine.getGameState().enemies[0].intentions[0]?.move).toBe(threat.id);
        expect(engine.executeAction({
            type: "move",
            actor: "hero",
            move: stunEnemy.id,
            targets: [],
        }).success).toBe(true);

        const result = engine.executeAction({ type: "endTurn" });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected the enemy phase to resolve");
        expect(result.events.filter(({ type }) => type === "moveUsed")).toEqual([]);
        expect(engine.getGameState().characters[0].bindings).toEqual([]);
    });

    it("drops a committed target that is no longer in state without adding a replacement", () => {
        const threat = makeMove("threat", "none", {
            targetSide: "enemy",
        });
        const watcher = makeEnemyDef("watcher", [threat], (state, actor) => [{
            type: "move",
            actor,
            move: { definition: threat },
            targets: state.enemies.filter((candidate) => candidate !== actor).slice(0, 1),
        }]);
        const doomed = makeEnemyDef("doomed", [makeWaitMove()]);
        const survivor = makeEnemyDef("survivor", [makeWaitMove()]);
        const strike = makeMove("strike", "arms", {
            resolve: (state, actor, _move, targets) => {
                const target = state.enemies.find((candidate) => candidate === targets[0]?.target);
                return target ? [{
                    type: "damage" as const,
                    source: actor,
                    target,
                    amount: 999,
                }] : [];
            },
        });
        const encounter = {
            id: "missing-intention-target",
            enemies: [watcher, doomed, survivor],
            bindings: [],
            traps: [],
        };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(makeCharacterDef("hero", [strike]));
        engine.loadEncounter(encounter.id);

        expect(engine.getGameState().enemies[0].intentions[0]?.targets).toEqual([{
            target: "doomed1",
            band: "hit",
            effects: [],
        }]);
        expect(engine.executeAction({
            type: "move",
            actor: "hero",
            move: strike.id,
            targets: ["doomed1"],
        }).success).toBe(true);

        const result = engine.executeAction({ type: "endTurn" });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected the enemy phase to resolve");
        expect(result.events).toContainEqual({
            type: "moveUsed",
            actor: "watcher1",
            move: threat.id,
            targets: [],
        });
    });
});

describe("enemy intention previews", () => {
    function setupPreviewEngine(seed = 8224) {
        const enemyMove = makeMove("threat", "none", {
            targetSide: "player",
            accuracy: { miss: 20, graze: 20, hit: 50, crit: 10 },
        });
        const enemy = makeEnemyDef("foe", [enemyMove]);
        const encounter = { id: "preview", enemies: [enemy], bindings: [], traps: [] };
        const engine = new GameEngine([encounter], seed);
        engine.loadCharacter(makeCharacterDef("hero"));
        engine.loadEncounter(encounter.id);
        return { engine, enemyMove, enemyId: "foe1" };
    }

    it("matches the eventual enemy result when live state is unchanged", () => {
        const { engine, enemyMove, enemyId } = setupPreviewEngine();
        const preview = engine.getGameState().enemies[0].intentions[0];
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
                result: preview.targets[0].band,
            }],
        });
        expect(preview.targets[0].effects).toEqual([]);
        expect(preview.effects).toEqual([]);
    });

    it("does not consume RNG during serialization and commits a fresh roll next round", () => {
        const seed = 123456;
        const pressure = makeBindingDef("pressure");
        const alwaysHit = makeMove("certain-threat", "none", {
            targetSide: "player",
            accuracy: { hit: 100 },
            resolve: (state, actor, _move, targets) => targets.flatMap((target) => {
                const character = state.characters.find(
                    (candidate) => candidate === target.target,
                );
                return character
                    ? [{
                        type: "binding" as const,
                        source: actor,
                        target: character,
                        binding: pressure,
                        amount: 100 * target.effectiveness,
                    }]
                    : [];
            }),
        });
        const enemy = makeEnemyDef("foe", [alwaysHit]);
        const encounter = { id: "stable-preview", enemies: [enemy], bindings: [], traps: [] };
        const engine = new GameEngine([encounter], seed);
        engine.loadCharacter(makeCharacterDef("hero"));
        engine.loadEncounter(encounter.id);

        const previews = Array.from(
            { length: 5 },
            () => engine.getGameState().enemies[0].intentions[0],
        );
        expect(previews.every((preview) => preview !== undefined)).toBe(true);
        expect(previews).toEqual(Array(5).fill(previews[0]));

        expect(previews[0]!.targets[0]).toMatchObject({
            target: "hero",
            band: "hit",
            effects: [{ type: "binding", target: "hero", binding: pressure.id }],
        });
        expect(previews[0]!.effects).toEqual([]);

        expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);
        const nextPreview = engine.getGameState().enemies[0].intentions[0];
        expect(nextPreview?.targets[0]).toMatchObject({
            target: "hero",
            band: "hit",
            effects: [{ type: "binding", target: "hero", binding: pressure.id }],
        });
        expect(nextPreview).not.toEqual(previews[0]);
    });

    it("recalculates against live modifiers while retaining the committed roll", () => {
        const seed = 2;
        const defenseStatus: StatusDef = {
            id: "breathless",
            levels: [{}, { modifiers: { defense: 20 } }],
        };
        const defenseBuff = {
            id: "guarded",
            duration: 1,
            active: true,
            statuses: [{ definition: defenseStatus, value: 1 }],
        };
        const guard = makeMove("guard", "mouth", {
            targetSide: "none",
            targets: 0,
            resolve: (_state, actor) => [{
                type: "buff",
                target: actor,
                buff: defenseBuff,
                operation: "add"
            }],
        });
        const enemyMove = makeMove("swing", "none", {
            targetSide: "player",
            accuracy: { miss: 50, hit: 50 },
        });
        const enemy = makeEnemyDef("foe", [enemyMove]);
        const encounter = { id: "live-preview", enemies: [enemy], bindings: [], traps: [] };
        const engine = new GameEngine([encounter], seed);
        engine.loadCharacter(makeCharacterDef("hero", [guard]));
        engine.loadEncounter(encounter.id);

        const before = engine.getGameState().enemies[0].intentions[0];
        expect(before?.targets[0].band).toBe("hit");

        expect(engine.executeAction({
            type: "move",
            actor: "hero",
            move: guard.id,
            targets: [],
        }).success).toBe(true);
        const after = engine.getGameState().enemies[0].intentions[0];
        expect(after?.targets[0]).toEqual({
            target: "hero",
            band: "miss",
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
                result: after!.targets[0].band,
            }],
        });
    });

    it("routes enemies through the enemy executor, not the public player path", () => {
        const { engine, enemyMove, enemyId } = setupPreviewEngine();

        expect(engine.executeAction({
            type: "move",
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
