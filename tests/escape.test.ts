import { describe, expect, it } from "vitest";
import { calculateProgress } from "../src/engine/bindings";
import { BINDING_MAX, bindingThresholds } from "../src/engine/constants";
import { GameEngine } from "../src/engine/engine";
import type { StatusDef } from "../src/engine/itypes";
import {
    makeBinding,
    makeBindingDef,
    makeCharacter,
    makeCharacterDef,
    setupBoundEngine,
} from "./helpers";

describe("escape progress", () => {
    it("falls as binding strength rises and does not worsen past Impossible", () => {
        const definition = makeBindingDef("rope");
        const actor = makeCharacter("hero");
        const easy = makeCharacter("easy", [makeBinding(definition, bindingThresholds.easy)]);
        const impossible = makeCharacter("impossible", [
            makeBinding(definition, bindingThresholds.impossible),
        ]);
        const overImpossible = makeCharacter("over-impossible", [
            makeBinding(definition, BINDING_MAX),
        ]);

        const easyProgress = calculateProgress(actor, easy, definition.id);
        const impossibleProgress = calculateProgress(actor, impossible, definition.id);
        const overImpossibleProgress = calculateProgress(
            actor,
            overImpossible,
            definition.id,
        );

        expect(easyProgress).toBeGreaterThan(impossibleProgress);
        expect(overImpossibleProgress).toBe(impossibleProgress);
    });

    it("applies the actor's escape modifier and the assistance multiplier", () => {
        const escapeModifier = -2;
        const modifierStatus: StatusDef = {
            id: "vibrating",
            levels: [{}, { modifiers: { escape: escapeModifier } }],
        };
        const modifierBinding = makeBindingDef("modifier", {
            easy: [{ definition: modifierStatus, value: 1 }],
        });
        const targetBinding = makeBindingDef("rope");
        const target = makeCharacter("target", [
            makeBinding(targetBinding, bindingThresholds.medium),
        ]);
        const helper = makeCharacter("helper", [
            makeBinding(modifierBinding, bindingThresholds.easy),
        ]);
        const unpenalizedHelper = makeCharacter("unpenalized-helper");

        const unpenalizedProgress = calculateProgress(
            unpenalizedHelper,
            target,
            targetBinding.id,
        );
        const penalizedAssistedProgress = calculateProgress(
            helper,
            target,
            targetBinding.id,
        );
        expect(penalizedAssistedProgress).toBeLessThanOrEqual(unpenalizedProgress);

        target.bindings.push(makeBinding(modifierBinding, bindingThresholds.easy));
        const penalizedSelfProgress = calculateProgress(
            target,
            target,
            targetBinding.id,
        );
        expect(penalizedAssistedProgress).toBeGreaterThanOrEqual(penalizedSelfProgress);
    });

    it("applies progress through the engine and consumes the actor's action", () => {
        const restraint = makeBindingDef("rope");
        const startingValue = bindingThresholds.hard;
        const { engine, hero } = setupBoundEngine(restraint, startingValue);
        const calculationTarget = makeCharacter(hero.id, [
            makeBinding(restraint, startingValue),
        ]);
        const amount = calculateProgress(
            calculationTarget,
            calculationTarget,
            restraint.id,
        );

        const result = engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: restraint.id,
        });

        expect(result).toMatchObject({
            success: true,
            events: [{
                type: "bondageChanged",
                target: hero.id,
                binding: restraint.id,
                amount: -amount,
            }],
        });
        expect(engine.getGameState().characters[0].bindings[0].value).toBe(
            startingValue - amount,
        );
        expect(engine.getGameState().characters[0].acted).toBe(true);
        expect(engine.getGameState().turn.step).toBe(2);
        expect(engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: restraint.id,
        })).toEqual({ success: false, reason: "actorAlreadyActed" });
    });

    it.each([
        ["unknown actor", { type: "escape", actor: "missing", target: "hero", binding: "rope" }, "invalidActor"],
        ["unknown target", { type: "escape", actor: "hero", target: "missing", binding: "rope" }, "invalidTarget"],
        ["unknown binding", { type: "escape", actor: "hero", target: "hero", binding: "missing" }, "invalidBinding"],
    ] as const)("rejects an %s", (_label, action, reason) => {
        const engine = new GameEngine([], 1);
        engine.loadCharacter(makeCharacterDef("hero"));

        expect(engine.executeAction(action)).toEqual({ success: false, reason });
    });
});
