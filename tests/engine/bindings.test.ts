import { describe, expect, it } from "vitest";
import { latexArms } from "../../src/content/skunk/latex";
import type { BindingDef, MoveDef, StatusDef } from "../../src/engine/protected/definitions";
import {
    bindingState, characterState, execute, makeBehavioralBinding, makeBehavioralCharacter,
    makeBehavioralEngine, makeBehavioralMove, targetAccuracy,
} from "../helpers/behavioralHelpers";

function bindingMove(
    id: string,
    binding: BindingDef,
    amount: number,
    targetIndex = 0,
): MoveDef {
    return makeBehavioralMove(id, "mouth", {
        targetSide: "none",
        targets: 0,
        alwaysAvailable: true,
        freeOnHit: true,
        resolve: (state, actor) => state.characters[targetIndex] ? [{
            type: "binding",
            source: actor,
            target: state.characters[targetIndex],
            binding,
            amount,
        }] : [],
    });
}

function use(engine: ReturnType<typeof makeBehavioralEngine>, actor: string, move: string) {
    return execute(engine, { type: "move", actor, move, targets: [] });
}

describe("binding behavior through GameEngine", () => {
    it("adds, accumulates, scales above Impossible, caps, and removes a binding", () => {
        const rope = makeBehavioralBinding("rope");
        const moves = [
            bindingMove("add-75", rope, 75),
            bindingMove("add-20", rope, 20),
            bindingMove("add-1000", rope, 1_000),
            bindingMove("remove-7", rope, -7),
            bindingMove("remove-all", rope, -1_000),
        ];
        const engine = makeBehavioralEngine([makeBehavioralCharacter("hero", moves)]);

        expect(use(engine, "hero", "add-75").frames).toEqual([{
            type: "useMove", actor: "hero", move: "add-75", targets: [],
            effects: [{ type: "bondageAdded", target: "hero", binding: "rope", amount: 75 }],
        }]);

        expect(use(engine, "hero", "add-20").frames[0].effects[0]).toEqual({
            type: "bondageChanged",
            target: "hero",
            binding: "rope",
            amount: 7,
        });
        expect(bindingState(engine, "rope")?.value).toBe(82);

        expect(use(engine, "hero", "add-1000").frames[0].effects[0]).toEqual({
            type: "bondageChanged",
            target: "hero",
            binding: "rope",
            amount: 18,
        });
        expect(bindingState(engine, "rope")).toMatchObject({ value: 100, level: "impossible" });

        expect(use(engine, "hero", "remove-7").frames[0].effects[0]).toEqual({
            type: "bondageChanged",
            target: "hero",
            binding: "rope",
            amount: -7,
        });
        expect(bindingState(engine, "rope")?.value).toBe(93);

        expect(use(engine, "hero", "remove-all").frames[0].effects[0]).toEqual({
            type: "bondageRemoved",
            target: "hero",
            binding: "rope",
            amount: -93,
        });
        expect(characterState(engine).bindings).toEqual([]);
    });

    it("does nothing publicly when an effect removes a missing binding", () => {
        const missing = makeBehavioralBinding("missing");
        const remove = bindingMove("remove-missing", missing, -10);
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero", [remove]),
        ]);

        expect(use(engine, "hero", remove.id).frames).toEqual([{
            type: "useMove", actor: "hero", move: remove.id, targets: [], effects: [],
        }]);
        expect(characterState(engine).bindings).toEqual([]);
    });

    it("keeps callback-managed state isolated between public binding instances", () => {
        const adaptive = makeBehavioralBinding("adaptive", {
            data: { peak: 0 },
            onAdd: (_state, _target, binding) => {
                binding.data.peak = Math.max(binding.data.peak, binding.value);
                return [];
            },
        });
        const firstMove = bindingMove("bind-first", adaptive, 30, 0);
        const secondMove = bindingMove("bind-second", adaptive, 10, 1);
        const hero = makeBehavioralCharacter("hero", [firstMove, secondMove]);
        const engine = makeBehavioralEngine([
            hero,
            makeBehavioralCharacter("ally"),
        ]);

        use(engine, hero.id, firstMove.id);
        use(engine, hero.id, secondMove.id);

        expect(bindingState(engine, adaptive.id, "hero")?.data).toEqual({ peak: 30 });
        expect(bindingState(engine, adaptive.id, "ally")?.data).toEqual({ peak: 10 });
        expect(adaptive.data).toEqual({ peak: 0 });
    });

    it("preserves Latex's historical maximum and raises it only after a new maximum", () => {
        const add60 = bindingMove("latex-60", latexArms, 60);
        const remove50 = bindingMove("latex-minus-50", latexArms, -50);
        const add30 = bindingMove("latex-30", latexArms, 30);
        const add40 = bindingMove("latex-40", latexArms, 40);
        const hero = makeBehavioralCharacter("hero", [add60, remove50, add30, add40]);
        const engine = makeBehavioralEngine([hero]);

        use(engine, hero.id, add60.id);
        expect(bindingState(engine, latexArms.id)).toMatchObject({
            value: 60,
            data: { peak: 60 },
        });

        use(engine, hero.id, remove50.id);
        expect(bindingState(engine, latexArms.id)?.value).toBe(10);
        expect(bindingState(engine, latexArms.id)?.data).toEqual({ peak: 60 });

        use(engine, hero.id, add30.id);
        expect(bindingState(engine, latexArms.id)?.value).toBe(40);
        expect(bindingState(engine, latexArms.id)?.data).toEqual({ peak: 60 });

        use(engine, hero.id, add40.id);
        expect(bindingState(engine, latexArms.id)).toMatchObject({
            value: 80,
            data: { peak: 80 },
        });
    });
});

describe("binding levels and effective statuses through GameEngine", () => {
    it.each([
        [1, 1, "none"],
        [10, 10, "easy"],
        [20, 20, "medium"],
        [30, 30, "hard"],
        [50, 50, "extreme"],
        [80, 80, "impossible"],
        [1_000, 100, "impossible"],
    ] as const)("serializes binding application %s as value %s at level %s", (amount, value, level) => {
        const rope = makeBehavioralBinding("rope");
        const apply = bindingMove("apply", rope, amount);
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero", [apply]),
        ]);

        use(engine, "hero", apply.id);
        expect(bindingState(engine, rope.id)).toMatchObject({ value, level });
    });

    it("publishes statuses on their bindings and applies the strongest modifier", () => {
        const blinded: StatusDef = {
            id: "blinded",
            levels: [
                {},
                { modifiers: { hit: -1 } },
                { modifiers: { hit: -4 } },
            ],
        };
        const weak = makeBehavioralBinding("weak", {
            status: { easy: [{ definition: blinded, value: 1 }] },
        });
        const strong = makeBehavioralBinding("strong", {
            status: { easy: [{ definition: blinded, value: 2 }] },
        });
        const applyBoth = makeBehavioralMove("apply-both", "mouth", {
            targetSide: "none",
            targets: 0,
            freeOnHit: true,
            resolve: (state, actor) => [
                { type: "binding", source: actor, target: state.characters[0], binding: weak, amount: 10 },
                { type: "binding", source: actor, target: state.characters[0], binding: strong, amount: 10 },
            ],
        });
        const attack = makeBehavioralMove("accuracy-check", "mouth", {
            accuracy: { miss: 20, hit: 80 },
            baseDamage: 10,
        });
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero", [applyBoth, attack]),
        ]);

        use(engine, "hero", applyBoth.id);

        expect(bindingState(engine, weak.id)?.status).toEqual([{ id: "blinded", value: 1 }]);
        expect(bindingState(engine, strong.id)?.status).toEqual([{ id: "blinded", value: 2 }]);
        expect(characterState(engine).modifiers).toEqual({ hit: -4 });
        expect(targetAccuracy(engine, "hero", attack.id, "foe1")).toEqual({
            miss: 60,
            hit: 40,
        });
    });
});
