import { describe, expect, it } from "vitest";
import { latexArms } from "../src/content/skunk/latex";
import type { BindingDef, MoveDef, StatusDef } from "../src/engine/itypes";
import {
    bindingState,
    characterState,
    execute,
    makeBehavioralBinding,
    makeBehavioralCharacter,
    makeBehavioralEngine,
    makeBehavioralMove,
} from "./behavioralHelpers";

function bindingMove(
    id: string,
    binding: BindingDef,
    amount: number,
    targetIndex = 0,
): MoveDef {
    return makeBehavioralMove(id, "mouth", {
        target: "player",
        targets: 0,
        alwaysAvailable: true,
        freeOnHit: true,
        resolve: (state) => [{
            type: "binding",
            target: state.characters[targetIndex],
            binding,
            amount,
        }],
    });
}

function use(engine: ReturnType<typeof makeBehavioralEngine>, actor: string, move: string) {
    return execute(engine, { type: "attack", actor, move, targets: [] });
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

        expect(use(engine, "hero", "add-75").events).toEqual([
            { type: "moveUsed", actor: "hero", move: "add-75", targets: [] },
            { type: "bondageAdded", target: "hero", binding: "rope", amount: 75 },
        ]);

        expect(use(engine, "hero", "add-20").events[1]).toEqual({
            type: "bondageChanged",
            target: "hero",
            binding: "rope",
            amount: 7,
        });
        expect(bindingState(engine, "rope")?.value).toBe(82);

        expect(use(engine, "hero", "add-1000").events[1]).toEqual({
            type: "bondageChanged",
            target: "hero",
            binding: "rope",
            amount: 18,
        });
        expect(bindingState(engine, "rope")).toMatchObject({ value: 100, level: "impossible" });

        expect(use(engine, "hero", "remove-7").events[1]).toEqual({
            type: "bondageChanged",
            target: "hero",
            binding: "rope",
            amount: -7,
        });
        expect(bindingState(engine, "rope")?.value).toBe(93);

        expect(use(engine, "hero", "remove-all").events[1]).toEqual({
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

        expect(use(engine, "hero", remove.id).events).toEqual([
            { type: "moveUsed", actor: "hero", move: remove.id, targets: [] },
        ]);
        expect(characterState(engine).bindings).toEqual([]);
    });

    it("keeps callback-managed state isolated between public binding instances", () => {
        const adaptive = makeBehavioralBinding("adaptive", {
            initialState: { peak: 0 },
            onAdd: (_target, binding) => {
                binding.state.peak = Math.max(binding.state.peak, binding.value);
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

        expect(bindingState(engine, adaptive.id, "hero")?.state).toEqual({ peak: 30 });
        expect(bindingState(engine, adaptive.id, "ally")?.state).toEqual({ peak: 10 });
        expect(adaptive.initialState).toEqual({ peak: 0 });
    });

    it("preserves Latex's historical maximum after removal and reapplication", () => {
        const add60 = bindingMove("latex-60", latexArms, 60);
        const remove50 = bindingMove("latex-minus-50", latexArms, -50);
        const add30 = bindingMove("latex-30", latexArms, 30);
        const hero = makeBehavioralCharacter("hero", [add60, remove50, add30]);
        const engine = makeBehavioralEngine([hero]);

        use(engine, hero.id, add60.id);
        expect(bindingState(engine, latexArms.id)).toMatchObject({
            value: 60,
            state: { max: 60 },
        });

        use(engine, hero.id, remove50.id);
        expect(bindingState(engine, latexArms.id)?.value).toBe(10);
        expect(bindingState(engine, latexArms.id)?.state).toEqual({ max: 60 });

        use(engine, hero.id, add30.id);
        expect(bindingState(engine, latexArms.id)?.value).toBe(40);
        expect(bindingState(engine, latexArms.id)?.state).toEqual({ max: 60 });
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

    it("publishes only the strongest duplicate status and applies its modifier", () => {
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
            target: "player",
            targets: 0,
            resolve: (state) => [
                { type: "binding", target: state.characters[0], binding: weak, amount: 10 },
                { type: "binding", target: state.characters[0], binding: strong, amount: 10 },
            ],
        });
        const attack = makeBehavioralMove("accuracy-check", "mouth", {
            accuracy: { miss: 20, hit: 80 },
        });
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero", [applyBoth, attack]),
        ]);

        use(engine, "hero", applyBoth.id);

        expect(characterState(engine).status).toEqual([{ id: "blinded", value: 2 }]);
        expect(engine.getAccuracyPreview("hero", "foe1", attack.id)).toEqual({
            miss: 60,
            hit: 40,
        });
    });
});
