import { describe, expect, it } from "vitest";
import {
    latexArms,
    latexHead,
    latexLegs,
    latexTorso,
} from "../src/content/skunk/latex";
import type { BindingDef } from "../src/engine/protected/definitions";
import type { iEffect } from "../src/engine/protected/types";
import { GameEngine } from "../src/engine/public/engine";
import {
    bindingState,
    characterState,
    execute,
    makeBehavioralCharacter,
    makeBehavioralMove,
} from "./behavioralHelpers";

interface BindingSetup {
    character: string;
    binding: BindingDef;
    amount: number;
}

function setupLatexScenario(
    characterIds: string[],
    bindings: BindingSetup[],
    spreadModifiers: Record<string, number> = {},
): GameEngine {
    const prepare = makeBehavioralMove("prepare-latex", "none", {
        targetSide: "none",
        targets: 0,
        resolve: (state, actor) => {
            const effects: iEffect[] = [];
            for (const setup of bindings) {
                const target = state.characters.find(({ id }) => id === setup.character);
                if (!target) throw new Error(`Expected character ${setup.character}`);
                effects.push({
                    type: "binding",
                    source: actor,
                    target,
                    binding: setup.binding,
                    amount: setup.amount,
                });
            }
            for (const [characterId, spread] of Object.entries(spreadModifiers)) {
                const target = state.characters.find(({ id }) => id === characterId);
                if (!target) throw new Error(`Expected character ${characterId}`);
                effects.push({
                    type: "buff",
                    target,
                    buff: {
                        id: `spread-${characterId}`,
                        active: true,
                        modifiers: { spread },
                    },
                    operation: "add",
                });
            }
            return effects;
        },
    });
    const engine = new GameEngine([], 1);
    for (const [index, id] of characterIds.entries()) {
        engine.loadCharacter(makeBehavioralCharacter(id, index === 0 ? [prepare] : []));
    }
    execute(engine, {
        type: "attack",
        actor: characterIds[0],
        move: prepare.id,
        targets: [],
    });
    execute(engine, { type: "endTurn" });
    return engine;
}

describe("latex escape spread through GameEngine", () => {
    it("lowers current Latex through escape while preserving its saved peak", () => {
        const engine = setupLatexScenario(
            ["hero"],
            [{ character: "hero", binding: latexHead, amount: 60 }],
        );

        const result = execute(engine, {
            type: "escape", actor: "hero", target: "hero", binding: latexHead.id,
        });
        const escaped = result.state.characters[0].bindings.find(({ id }) => id === latexHead.id);
        expect(escaped?.value).toBeLessThan(60);
        expect(escaped?.data).toEqual({ peak: 60 });
    });

    it("does not spread below Hard without a modifier, but does with one", () => {
        const plain = setupLatexScenario(
            ["hero"],
            [{ character: "hero", binding: latexHead, amount: 20 }],
        );
        const boosted = setupLatexScenario(
            ["hero"],
            [{ character: "hero", binding: latexHead, amount: 20 }],
            { hero: 1 },
        );

        const plainResult = execute(plain, {
            type: "escape",
            actor: "hero",
            target: "hero",
            binding: latexHead.id,
        });
        const boostedResult = execute(boosted, {
            type: "escape",
            actor: "hero",
            target: "hero",
            binding: latexHead.id,
        });

        expect(plainResult.events).toEqual([{
            type: "bondageRemoved",
            target: "hero",
            binding: latexHead.id,
            amount: -20,
        }]);
        expect(characterState(plain).bindings).toEqual([]);

        expect(boostedResult.events).toEqual([
            {
                type: "bondageRemoved",
                target: "hero",
                binding: latexHead.id,
                amount: -20,
            },
            {
                type: "bondageAdded",
                target: "hero",
                binding: latexArms.id,
                amount: 2,
            },
        ]);
        expect(bindingState(boosted, latexArms.id)?.value).toBe(2);
    });

    it.each([
        {
            range: "Hard",
            application: 30,
            initial: 30,
            removed: 18,
            spread: 5,
        },
        {
            range: "Extreme",
            application: 50,
            initial: 50,
            removed: 15,
            spread: 8,
        },
        {
            range: "Impossible",
            application: 180,
            initial: 90,
            removed: 5,
            spread: 8,
        },
    ])("applies representative $range-range spread", ({
        application,
        initial,
        removed,
        spread,
    }) => {
        const engine = setupLatexScenario(
            ["hero"],
            [{ character: "hero", binding: latexHead, amount: application }],
        );

        const result = execute(engine, {
            type: "escape",
            actor: "hero",
            target: "hero",
            binding: latexHead.id,
        });

        expect(result.events).toEqual([
            {
                type: "bondageChanged",
                target: "hero",
                binding: latexHead.id,
                amount: -removed,
            },
            {
                type: "bondageAdded",
                target: "hero",
                binding: latexArms.id,
                amount: spread,
            },
        ]);
        expect(bindingState(engine, latexHead.id)?.value).toBe(initial - removed);
        expect(bindingState(engine, latexArms.id)?.value).toBe(spread);
    });

    it("rounds the Hard threshold's 4.5 spread upward to 5", () => {
        const engine = setupLatexScenario(
            ["hero"],
            [{ character: "hero", binding: latexLegs, amount: 30 }],
        );

        const result = execute(engine, {
            type: "escape",
            actor: "hero",
            target: "hero",
            binding: latexLegs.id,
        });

        expect(result.events).toEqual([
            {
                type: "bondageChanged",
                target: "hero",
                binding: latexLegs.id,
                amount: -18,
            },
            {
                type: "bondageAdded",
                target: "hero",
                binding: latexArms.id,
                amount: 5,
            },
        ]);
    });

    it("puts assist spread on the assisting actor rather than the escape target", () => {
        const engine = setupLatexScenario(
            ["helper", "victim"],
            [{ character: "victim", binding: latexHead, amount: 30 }],
        );

        const result = execute(engine, {
            type: "escape",
            actor: "helper",
            target: "victim",
            binding: latexHead.id,
        });

        expect(result.events).toEqual([
            {
                type: "bondageChanged",
                target: "victim",
                binding: latexHead.id,
                amount: -27,
            },
            {
                type: "bondageAdded",
                target: "helper",
                binding: latexArms.id,
                amount: 7,
            },
        ]);
        expect(bindingState(engine, latexHead.id, "victim")?.value).toBe(3);
        expect(bindingState(engine, latexArms.id, "helper")?.value).toBe(7);
        expect(characterState(engine, "victim").bindings).toEqual([
            expect.objectContaining({ id: latexHead.id, value: 3 }),
        ]);
    });

    it("splashes overflow while excluding the escaped and primary locations", () => {
        const engine = setupLatexScenario(
            ["hero"],
            [
                { character: "hero", binding: latexHead, amount: 80 },
                { character: "hero", binding: latexArms, amount: 78 },
            ],
        );

        const result = execute(engine, {
            type: "escape",
            actor: "hero",
            target: "hero",
            binding: latexHead.id,
        });

        expect(result.events).toEqual([
            {
                type: "bondageChanged",
                target: "hero",
                binding: latexHead.id,
                amount: -5,
            },
            {
                type: "bondageChanged",
                target: "hero",
                binding: latexArms.id,
                amount: 2,
            },
            {
                type: "bondageAdded",
                target: "hero",
                binding: latexTorso.id,
                amount: 2,
            },
            {
                type: "bondageAdded",
                target: "hero",
                binding: latexLegs.id,
                amount: 2,
            },
        ]);
        expect(bindingState(engine, latexHead.id)?.value).toBe(75);
        expect(bindingState(engine, latexArms.id)?.value).toBe(80);
        expect(bindingState(engine, latexTorso.id)?.value).toBe(2);
        expect(bindingState(engine, latexLegs.id)?.value).toBe(2);
    });

    it("carries a full splash location forward to the next eligible location", () => {
        const engine = setupLatexScenario(
            ["hero"],
            [
                { character: "hero", binding: latexHead, amount: 80 },
                { character: "hero", binding: latexArms, amount: 80 },
                { character: "hero", binding: latexTorso, amount: 80 },
            ],
        );

        const result = execute(engine, {
            type: "escape",
            actor: "hero",
            target: "hero",
            binding: latexHead.id,
        });

        expect(result.events).toEqual([
            {
                type: "bondageChanged",
                target: "hero",
                binding: latexHead.id,
                amount: -3,
            },
            {
                type: "bondageAdded",
                target: "hero",
                binding: latexLegs.id,
                amount: 4,
            },
        ]);
        expect(bindingState(engine, latexHead.id)?.value).toBe(77);
        expect(bindingState(engine, latexArms.id)?.value).toBe(80);
        expect(bindingState(engine, latexTorso.id)?.value).toBe(80);
        expect(bindingState(engine, latexLegs.id)?.value).toBe(4);
    });
});
