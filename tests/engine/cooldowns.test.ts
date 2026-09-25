import { describe, expect, it } from "vitest";
import type { EnemyDef, MoveDef } from "../../src/engine/protected/definitions";
import { createCustomEngine } from "../../src/engine/protected/engine";
import type { Engine } from "../../src/engine/public/types";
import { actionView } from "../helpers/actionView";
import {
    makeCharacterDef,
    makeEnemyDef,
    makeMove,
    makeWaitMove,
} from "../helpers/helpers";

function makeCooldownEngine(moves: MoveDef[], enemy?: EnemyDef): Engine {
    const foe = enemy ?? makeEnemyDef("foe", [makeWaitMove()]);
    const encounter = {
        id: "cooldown-test",
        enemies: [foe],
        bindings: [],
        traps: [],
    };
    const hero = makeCharacterDef("hero", moves);
    const engine = createCustomEngine([encounter], [hero], 1);
    engine.loadCharacter(hero.id);
    engine.loadEncounter(encounter.id);
    return engine;
}

function moveAction(engine: Engine, id: string) {
    const action = actionView(engine, "hero").moves.find(({ move }) => move.id === id);
    if (!action) throw new Error(`Expected move ${id}`);
    return action;
}

function playerCooldowns(engine: Engine): Record<string, number> {
    return engine.getGameState().characters[0].cooldowns;
}

describe("move cooldowns", () => {
    it("applies cross-cooldowns, reports cooldownIncomplete, ticks players, and never shortens a longer cooldown", () => {
        const first = makeMove("first", "none", {
            targetSide: "none",
            targets: 0,
            accuracy: undefined,
            freeOnHit: true,
            cooldown: { first: 5, second: 2 },
        });
        const second = makeMove("second", "none", {
            targetSide: "none",
            targets: 0,
            accuracy: undefined,
            freeOnHit: true,
            cooldown: { first: 2, second: 4 },
        });
        const engine = makeCooldownEngine([first, second]);

        expect(engine.executeAction({
            type: "move",
            actor: "hero",
            move: first.id,
            targets: [],
        }).success).toBe(true);
        expect(playerCooldowns(engine)).toEqual({ first: 5, second: 2 });
        expect(moveAction(engine, second.id)).toMatchObject({
            available: false,
            reason: "cooldownIncomplete",
        });
        expect(engine.executeAction({
            type: "move",
            actor: "hero",
            move: second.id,
            targets: [],
        })).toEqual({ success: false, reason: "cooldownIncomplete" });

        expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);
        expect(playerCooldowns(engine)).toEqual({ first: 4, second: 1 });
        expect(moveAction(engine, second.id)).toMatchObject({
            available: false,
            reason: "cooldownIncomplete",
        });

        expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);
        expect(playerCooldowns(engine)).toEqual({ first: 3, second: 0 });
        expect(moveAction(engine, second.id)).toMatchObject({ available: true });

        expect(engine.executeAction({
            type: "move",
            actor: "hero",
            move: second.id,
            targets: [],
        }).success).toBe(true);
        expect(playerCooldowns(engine)).toEqual({ first: 3, second: 4 });
    });

    it("applies a cooldown when the move executes but misses", () => {
        const miss = makeMove("miss", "arms", {
            accuracy: { miss: 100 },
            cooldown: { miss: 3 },
        });
        const engine = makeCooldownEngine([miss]);

        const result = engine.executeAction({
            type: "move",
            actor: "hero",
            move: miss.id,
            targets: ["foe1"],
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected miss move to execute");
        expect(result.frames[0].event).toMatchObject({
            type: "useMove",
            actor: "hero",
            move: miss.id,
            targets: [{ target: "foe1", result: "miss" }],
        });
        expect(playerCooldowns(engine)).toEqual({ miss: 3 });
    });

    it("applies every authored enemy cooldown key before the phase-end tick", () => {
        const primary = makeMove("primary", "none", {
            targetSide: "player",
            targets: 1,
            accuracy: undefined,
            cooldown: { primary: 3, secondary: 2 },
        });
        const secondary = makeMove("secondary", "none", {
            targetSide: "player",
            targets: 1,
            accuracy: undefined,
        });
        const enemy = makeEnemyDef("foe", [primary, secondary]);
        const engine = makeCooldownEngine([], enemy);

        const result = engine.executeAction({ type: "endTurn" });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected enemy phase to resolve");
        expect(result.frames.map(({ event }) => event).find(
            (event) => event.type === "useMove" && event.actor === "foe1",
        )).toMatchObject({
            type: "useMove",
            actor: "foe1",
            move: primary.id,
        });
        expect(engine.getGameState().enemies[0].cooldowns).toEqual({
            primary: 2,
            secondary: 1,
        });
    });
});
