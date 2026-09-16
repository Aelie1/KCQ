import { describe, expect, it } from "vitest";
import { latexArms } from "../src/content/skunk/latex";
import type { BindingDef, StatusDef } from "../src/engine/protected/definitions";
import { thresholds } from "../src/engine/protected/helpers";
import { GameEngine } from "../src/engine/public/engine";
import type { Effect } from "../src/engine/public/types";
import {
    makeBindingDef,
    makeCharacterDef,
    makeMove,
} from "./helpers";

interface BindingSetup {
    target: string;
    binding: BindingDef;
    amount: number;
}

function setupEscapeScenario(
    actorId: string,
    characterIds: string[],
    bindings: BindingSetup[],
): GameEngine {
    const prepare = makeMove("prepare-bindings", "mouth", {
        targetSide: "none",
        targets: 0,
        resolve: (state, actor) => bindings.map((setup) => ({
            type: "binding" as const,
            source: actor,
            target: state.characters.find((character) => character.id === setup.target)!,
            binding: setup.binding,
            amount: setup.amount,
        })),
    });
    const engine = new GameEngine([], 1);
    for (const id of characterIds) {
        engine.loadCharacter(makeCharacterDef(id, id === actorId ? [prepare] : []));
    }
    expect(engine.executeAction({
        type: "attack",
        actor: actorId,
        move: prepare.id,
        targets: [],
    }).success).toBe(true);
    expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);
    return engine;
}

function escapeEffects(engine: GameEngine, actor: string, target: string, binding: string): Effect[] {
    const option = engine.getEscapes(actor)?.options.find(
        (candidate) => candidate.target === target && candidate.binding === binding,
    );
    if (!option) throw new Error(`Expected ${actor} to have an escape for ${target}/${binding}`);
    return option.effects;
}

function escapeAmount(engine: GameEngine, actor: string, target: string, binding: string): number {
    const effect = escapeEffects(engine, actor, target, binding).find(
        (candidate) => candidate.type === "binding"
            && candidate.target === target
            && candidate.binding === binding
            && candidate.amount !== undefined
            && candidate.amount < 0,
    );
    if (!effect || effect.type !== "binding") {
        throw new Error(`Expected ${actor} to remove ${target}/${binding}`);
    }
    return -effect.amount!;
}

describe("escape progress", () => {
    it("falls as binding strength rises and does not worsen past Impossible", () => {
        const restraint = makeBindingDef("rope");
        const engine = setupEscapeScenario(
            "helper",
            ["helper", "easy", "impossible", "over-impossible"],
            [
                { target: "easy", binding: restraint, amount: thresholds.easy },
                { target: "impossible", binding: restraint, amount: thresholds.impossible },
                { target: "over-impossible", binding: restraint, amount: thresholds.max },
            ],
        );

        const easy = escapeAmount(engine, "helper", "easy", restraint.id);
        const impossible = escapeAmount(engine, "helper", "impossible", restraint.id);
        const overImpossible = escapeAmount(engine, "helper", "over-impossible", restraint.id);

        expect(easy).toBeGreaterThan(impossible);
        expect(overImpossible).toBe(impossible);
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
        const engine = setupEscapeScenario(
            "setup",
            ["setup", "unpenalized-helper", "penalized-helper", "target"],
            [
                { target: "penalized-helper", binding: modifierBinding, amount: thresholds.easy },
                { target: "target", binding: modifierBinding, amount: thresholds.easy },
                { target: "target", binding: targetBinding, amount: thresholds.medium },
            ],
        );

        const unpenalizedAssist = escapeAmount(
            engine,
            "unpenalized-helper",
            "target",
            targetBinding.id,
        );
        const penalizedAssist = escapeAmount(
            engine,
            "penalized-helper",
            "target",
            targetBinding.id,
        );
        const penalizedSelfEscape = escapeAmount(
            engine,
            "target",
            "target",
            targetBinding.id,
        );

        expect(penalizedAssist).toBeLessThan(unpenalizedAssist);
        expect(penalizedAssist).toBeGreaterThan(penalizedSelfEscape);
    });

    it("reports and applies escape progress through the public API", () => {
        const restraint = makeBindingDef("rope");
        const engine = setupEscapeScenario(
            "hero",
            ["hero"],
            [{ target: "hero", binding: restraint, amount: thresholds.hard }],
        );
        const before = engine.getGameState().characters[0].bindings[0].value;
        const amount = escapeAmount(engine, "hero", "hero", restraint.id);

        expect(escapeEffects(engine, "hero", "hero", restraint.id)).toEqual([{
            type: "binding",
            target: "hero",
            binding: restraint.id,
            amount: -amount,
        }]);

        const result = engine.executeAction({
            type: "escape",
            actor: "hero",
            target: "hero",
            binding: restraint.id,
        });

        expect(result).toMatchObject({
            success: true,
            events: [{
                type: "bondageChanged",
                target: "hero",
                binding: restraint.id,
                amount: -amount,
            }],
        });
        expect(engine.getGameState().characters[0].bindings[0].value).toBe(before - amount);
        expect(engine.getGameState().characters[0].acted).toBe(true);
        expect(engine.getGameState().turn.step).toBe(2);
        expect(engine.getEscapes("hero")).toEqual({ options: [], assistAllowed: false, "reason": "actorAlreadyActed" });
        expect(engine.executeAction({
            type: "escape",
            actor: "hero",
            target: "hero",
            binding: restraint.id,
        })).toEqual({ success: false, reason: "actorAlreadyActed" });
    });

    it("previews and applies additional effects produced by an escape", () => {
        const engine = setupEscapeScenario(
            "hero",
            ["hero"],
            [{ target: "hero", binding: latexArms, amount: thresholds.hard }],
        );

        expect(escapeEffects(engine, "hero", "hero", latexArms.id)).toEqual([
            {
                type: "binding",
                target: "hero",
                binding: "latexArms",
                amount: -18,
            },
            {
                type: "binding",
                target: "hero",
                binding: "latexHead",
                amount: 5,
            },
        ]);

        const result = engine.executeAction({
            type: "escape",
            actor: "hero",
            target: "hero",
            binding: latexArms.id,
        });

        expect(result).toMatchObject({
            success: true,
            events: [
                {
                    type: "bondageChanged",
                    target: "hero",
                    binding: "latexArms",
                    amount: -18,
                },
                {
                    type: "bondageAdded",
                    target: "hero",
                    binding: "latexHead",
                    amount: 5,
                },
            ],
        });
        expect(engine.getGameState().characters[0].bindings).toEqual([
            expect.objectContaining({ id: "latexArms", value: 12 }),
            expect.objectContaining({ id: "latexHead", value: 5 }),
        ]);
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

    it("returns null escape options for an invalid actor", () => {
        expect(new GameEngine([], 1).getEscapes("missing")).toBeNull();
    });
});
