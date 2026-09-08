import { describe, expect, it } from "vitest";
import { addBinding } from "../src/engine/bindings";
import { BINDING_MAX, bindingThresholds } from "../src/engine/constants";
import { GameEngine } from "../src/engine/engine";
import { isCharacter } from "../src/engine/helpers";
import { immobilized, vibrating } from "../src/engine/status";
import type { GameEvent } from "../src/engine/types";
import {
    makeBindingDef,
    makeCharacterDef,
    makeEnemyDef,
    makeMove,
    makeWaitMove,
    setupBoundEngine,
} from "./helpers";

describe("standing stance", () => {
    it("rejects invalid actor", () => {
        const strike = makeMove("strike");
        const hero = makeCharacterDef("hero", [strike]);
        const engine = new GameEngine([], 1);
        engine.loadCharacter(hero);

        const result = engine.executeAction({
            type: "stance",
            actor: "invalid-actor",
            stance: "standing",
        });

        expect(result).toMatchObject({
            success: false,
            reason: "invalidActor"
        });
    });

    it("enters standing stance without consuming the normal action", () => {
        const strike = makeMove("strike");
        const hero = makeCharacterDef("hero", [strike]);
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter = { id: "stance", enemies: [foe] };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(hero);
        engine.loadEncounter(encounter.id);

        const result = engine.executeAction({
            type: "stance",
            actor: hero.id,
            stance: "standing",
        });

        expect(result).toMatchObject({
            success: true,
            events: [{ type: "stanceChanged", actor: hero.id, stance: "standing" }],
            state: {
                turn: { step: 1 },
                characters: [{ id: hero.id, standing: true, acted: false }],
            },
        });
        expect(engine.executeAction({
            type: "attack",
            actor: hero.id,
            move: strike.id,
            targets: [`${foe.id}1`],
        }).success).toBe(true);
    });

    it("returns a mobile standing character to moving stance", () => {
        const hero = makeCharacterDef("hero");
        const engine = new GameEngine([], 1);
        engine.loadCharacter(hero);
        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
            stance: "standing",
        }).success).toBe(true);

        const result = engine.executeAction({
            type: "stance",
            actor: hero.id,
            stance: "moving",
        });

        expect(result).toMatchObject({
            success: true,
            events: [{ type: "stanceChanged", actor: hero.id, stance: "moving" }],
            state: { characters: [{ id: hero.id, standing: false, acted: false }] },
        });
        expect(engine.getGameState().characters[0].standing).toBe(false);
    });

    it("cannot return to moving stance while immobilized", () => {
        const immobilizingBinding = makeBindingDef("immobilizing-binding", {
            easy: [{ definition: immobilized, value: 1 }],
        });
        const { engine, hero } = setupBoundEngine(
            immobilizingBinding,
            bindingThresholds.easy,
        );
        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
            stance: "standing",
        }).success).toBe(true);

        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
            stance: "moving",
        })).toEqual({ success: false, reason: "actorImmobilized" });
        expect(engine.getGameState().characters[0]).toMatchObject({
            standing: true,
            acted: false,
        });
    });

    it("grants exactly one bonus escape after the normal escape", () => {
        const restraint = makeBindingDef("rope");
        const { engine, hero } = setupBoundEngine(restraint, bindingThresholds.impossible);
        const escape = {
            type: "escape" as const,
            actor: hero.id,
            target: hero.id,
            binding: restraint.id,
        };
        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
            stance: "standing",
        }).success).toBe(true);

        const first = engine.executeAction(escape);
        expect(first).toMatchObject({
            success: true,
            state: { characters: [{ id: hero.id, acted: true, bonusEscapes: 1 }] },
        });

        const second = engine.executeAction(escape);
        expect(second).toMatchObject({
            success: true,
            state: { characters: [{ id: hero.id, acted: true, bonusEscapes: 0 }] },
        });

        expect(engine.executeAction(escape)).toEqual({
            success: false,
            reason: "actorAlreadyActed",
        });
    });

    it("allows the bonus escape to assist another character", () => {
        const restraint = makeBindingDef("rope");
        const prepare = makeMove("prepare", "mouth", {
            targets: 0,
            activate: (state): GameEvent[] => [
                ...addBinding(state.characters[0], restraint, bindingThresholds.impossible),
                ...addBinding(state.characters[1], restraint, bindingThresholds.impossible),
            ],
        });
        const helper = makeCharacterDef("helper", [prepare]);
        const target = makeCharacterDef("target");
        const engine = new GameEngine([], 1);
        engine.loadCharacter(helper);
        engine.loadCharacter(target);
        expect(engine.executeAction({
            type: "attack",
            actor: helper.id,
            move: prepare.id,
            targets: [],
        }).success).toBe(true);
        expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);
        expect(engine.executeAction({
            type: "stance",
            actor: helper.id,
            stance: "standing",
        }).success).toBe(true);
        expect(engine.executeAction({
            type: "escape",
            actor: helper.id,
            target: helper.id,
            binding: restraint.id,
        }).success).toBe(true);

        const assist = engine.executeAction({
            type: "escape",
            actor: helper.id,
            target: target.id,
            binding: restraint.id,
        });

        expect(assist.success).toBe(true);
        if (!assist.success) throw new Error("Expected bonus assistance to succeed");
        expect(assist.events).toEqual([
            expect.objectContaining({ target: target.id, binding: restraint.id }),
        ]);
        expect(assist.state.characters.find((character) => character.id === helper.id))
            .toMatchObject({ acted: true, bonusEscapes: 0 });
    });

    it("does not grant a bonus escape when the status blocks it", () => {
        const vibratingBinding = makeBindingDef("vibrating-binding", {
            extreme: [{ definition: vibrating, value: 1 }],
            impossible: [{ definition: vibrating, value: 1 }],
        });
        const { engine, hero } = setupBoundEngine(vibratingBinding, BINDING_MAX);
        const escape = {
            type: "escape" as const,
            actor: hero.id,
            target: hero.id,
            binding: vibratingBinding.id,
        };
        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
            stance: "standing",
        }).success).toBe(true);

        const first = engine.executeAction(escape);
        expect(first).toMatchObject({
            success: true,
            state: { characters: [{ id: hero.id, acted: true, bonusEscapes: 0 }] },
        });
        expect(engine.executeAction(escape)).toEqual({
            success: false,
            reason: "actorAlreadyActed",
        });
    });

    it("returns a mobile standing character to moving at the next player phase", () => {
        const restraint = makeBindingDef("rope");
        const { engine, hero } = setupBoundEngine(restraint, bindingThresholds.impossible);
        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
            stance: "standing",
        }).success).toBe(true);
        expect(engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: restraint.id,
        }).success).toBe(true);
        expect(engine.getGameState().characters[0]).toMatchObject({
            standing: true,
            acted: true,
            bonusEscapes: 1,
        });

        expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);

        expect(engine.getGameState().characters[0]).toMatchObject({
            standing: false,
            acted: false,
            bonusEscapes: 0,
        });
    });

    it("keeps a character standing when the enemy phase immobilizes them", () => {
        const restraint = makeBindingDef("rope");
        const immobilizingBinding = makeBindingDef("immobilizing-binding", {
            easy: [{ definition: immobilized, value: 1 }],
        });
        const immobilize = makeMove("immobilize", "enemy", {
            target: "player",
            activate: (_state, _actor, targets) => {
                const target = targets[0].target;
                return isCharacter(target)
                    ? addBinding(target, immobilizingBinding, bindingThresholds.easy)
                    : [];
            },
        });
        const enemy = makeEnemyDef("immobilizer", [immobilize]);
        const encounter = { id: "immobilizer", enemies: [enemy] };
        const { engine, hero } = setupBoundEngine(
            restraint,
            bindingThresholds.impossible,
            [encounter],
        );
        engine.loadEncounter(encounter.id);
        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
            stance: "standing",
        }).success).toBe(true);
        expect(engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: restraint.id,
        }).success).toBe(true);

        expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);

        expect(engine.getGameState().characters[0]).toMatchObject({
            standing: true,
            acted: false,
            bonusEscapes: 0,
            status: [{ id: immobilized.id, value: 1 }],
        });
    });

    it("cannot change stance after using the normal action", () => {
        const restraint = makeBindingDef("rope");
        const { engine, hero } = setupBoundEngine(restraint, bindingThresholds.impossible);
        expect(engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: restraint.id,
        }).success).toBe(true);

        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
            stance: "standing",
        })).toEqual({ success: false, reason: "actorAlreadyActed" });
        expect(engine.getGameState().characters[0].standing).toBe(false);
    });
});
