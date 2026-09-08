import { describe, expect, it } from "vitest";
import { latexarms } from "../src/content/skunk/latex";
import { addBinding, removeBinding } from "../src/engine/bindings";
import { BINDING_MAX, bindingThresholds } from "../src/engine/constants";
import { getBindingLevel } from "../src/engine/helpers";
import { getModifier, getStatuses } from "../src/engine/status";
import type { StatusDef } from "../src/engine/itypes";
import {
    makeBinding,
    makeBindingDef,
    makeCharacter,
} from "./helpers";

describe("binding lifecycle", () => {
    it("creates a binding with an isolated copy of its initial state", () => {
        const definition = makeBindingDef("rope");
        definition.initialState = { peak: 2 };
        const target = makeCharacter();

        expect(addBinding(target, definition, 12)).toEqual([{
            type: "bondageAdded",
            target: target.id,
            binding: definition.id,
            amount: 12,
        }]);
        expect(target.bindings[0]).toMatchObject({
            id: definition.id,
            definition,
            value: 12,
            state: { peak: 2 },
        });

        target.bindings[0].state.peak = 99;
        expect(definition.initialState.peak).toBe(2);
    });

    it("accumulates repeated applications into the existing binding", () => {
        const definition = makeBindingDef("rope");
        const target = makeCharacter();
        addBinding(target, definition, 10);

        expect(addBinding(target, definition, 5)).toEqual([{
            type: "bondageChanged",
            target: target.id,
            binding: definition.id,
            amount: 5,
        }]);
        expect(target.bindings).toHaveLength(1);
        expect(target.bindings[0].value).toBe(15);
    });

    it("scales only the portion of an application above 80", () => {
        const definition = makeBindingDef("rope");
        const target = makeCharacter();
        addBinding(target, definition, bindingThresholds.impossible - 5);

        const events = addBinding(target, definition, 20);

        const expectedIncrease = Math.ceil(5 + 15 * 0.1);
        expect(events).toEqual([{
            type: "bondageChanged",
            target: target.id,
            binding: definition.id,
            amount: expectedIncrease,
        }]);
        expect(target.bindings[0].value).toBe(bindingThresholds.impossible - 5 + expectedIncrease);
    });

    it("scales the whole application when already above 80", () => {
        const definition = makeBindingDef("rope");
        const target = makeCharacter();
        addBinding(target, definition, bindingThresholds.impossible + 1);

        const events = addBinding(target, definition, 10);

        expect(events).toEqual([{
            type: "bondageChanged",
            target: target.id,
            binding: definition.id,
            amount: Math.ceil(10 * 0.1),
        }]);
        expect(target.bindings[0].value).toBe(bindingThresholds.impossible + 2);
    });

    it("caps binding value and reports only the applied amount", () => {
        const definition = makeBindingDef("rope");
        const target = makeCharacter();

        const [event] = addBinding(target, definition, 1_000);

        expect(target.bindings[0].value).toBe(BINDING_MAX);
        expect(event).toMatchObject({ type: "bondageAdded", amount: BINDING_MAX });
    });

    it("keeps callback-managed state independent per binding instance", () => {
        const definition = makeBindingDef("adaptive");
        definition.initialState = { peak: 0 };
        definition.onBindingAdd = (binding) => {
            binding.state.peak = Math.max(binding.state.peak, binding.value);
        };
        const first = makeCharacter("first");
        const second = makeCharacter("second");

        addBinding(first, definition, 30);
        addBinding(second, definition, 10);
        removeBinding(first, definition, 20);

        expect(first.bindings[0].state).toEqual({ peak: 30 });
        expect(second.bindings[0].state).toEqual({ peak: 10 });
        expect(first.bindings[0].state).not.toBe(second.bindings[0].state);
        expect(definition.initialState).toEqual({ peak: 0 });
    });

    it("preserves Latex's historical maximum after a smaller reapplication", () => {
        const target = makeCharacter();

        addBinding(target, latexarms, 60);
        expect(target.bindings[0]).toMatchObject({ value: 60, state: { max: 60 } });

        removeBinding(target, latexarms, 50);
        expect(target.bindings[0]).toMatchObject({ value: 10, state: { max: 60 } });

        addBinding(target, latexarms, 30);
        expect(target.bindings[0]).toMatchObject({ value: 40, state: { max: 60 } });
    });

    it("partially removes a binding without deleting it", () => {
        const definition = makeBindingDef("rope");
        const target = makeCharacter("hero", [makeBinding(definition, 20)]);

        expect(removeBinding(target, definition, 7)).toEqual([{
            type: "bondageChanged",
            target: target.id,
            binding: definition.id,
            amount: -7,
        }]);
        expect(target.bindings[0].value).toBe(13);
    });

    it("emits bondageRemoved and deletes the instance on exact zero", () => {
        const definition = makeBindingDef("rope");
        const value = 12;
        const target = makeCharacter("hero", [makeBinding(definition, value)]);

        expect(removeBinding(target, definition, value)).toEqual([{
            type: "bondageRemoved",
            target: target.id,
            binding: definition.id,
            amount: -value,
        }]);
        expect(target.bindings).toEqual([]);
    });

    it("clamps over-removal to zero and reports the actual change", () => {
        const definition = makeBindingDef("rope");
        const value = 12;
        const target = makeCharacter("hero", [makeBinding(definition, value)]);

        expect(removeBinding(target, definition, value + 100)).toEqual([{
            type: "bondageRemoved",
            target: target.id,
            binding: definition.id,
            amount: -value,
        }]);
        expect(target.bindings).toEqual([]);
    });

    it("leaves state unchanged when asked to remove a missing binding", () => {
        const existing = makeBindingDef("existing");
        const missing = makeBindingDef("missing");
        const target = makeCharacter("hero", [makeBinding(existing, bindingThresholds.easy)]);

        expect(removeBinding(target, missing, 10)).toEqual([]);
        expect(target.bindings).toEqual([makeBinding(existing, bindingThresholds.easy)]);
    });
});

describe("binding levels and effective statuses", () => {
    it.each([
        [0, "none"],
        [bindingThresholds.easy - 1, "none"],
        [bindingThresholds.easy, "easy"],
        [bindingThresholds.medium - 1, "easy"],
        [bindingThresholds.medium, "medium"],
        [bindingThresholds.hard - 1, "medium"],
        [bindingThresholds.hard, "hard"],
        [bindingThresholds.extreme - 1, "hard"],
        [bindingThresholds.extreme, "extreme"],
        [bindingThresholds.impossible - 1, "extreme"],
        [bindingThresholds.impossible, "impossible"],
        [BINDING_MAX, "impossible"],
    ] as const)("maps binding value %s to %s", (value, level) => {
        expect(getBindingLevel(makeBinding(makeBindingDef("rope"), value))).toBe(level);
    });

    it("keeps the strongest value when bindings grant the same status", () => {
        const sharedStatus: StatusDef = {
            id: "bound",
            levels: [{}, {}, {}, {}, {}],
        };
        const otherStatus: StatusDef = {
            id: "gagged",
            levels: [{}, {}],
        };
        const weak = makeBindingDef("weak", {
            easy: [{ definition: sharedStatus, value: 1 }],
        });
        const strong = makeBindingDef("strong", {
            easy: [{ definition: sharedStatus, value: 3 }],
        });
        const other = makeBindingDef("other", {
            easy: [{ definition: otherStatus, value: 1 }],
        });
        const target = makeCharacter("hero", [
            makeBinding(weak, bindingThresholds.easy),
            makeBinding(strong, bindingThresholds.easy),
            makeBinding(other, bindingThresholds.easy),
        ]);

        expect(getStatuses(target)).toEqual([
            { definition: sharedStatus, value: 3 },
            { definition: otherStatus, value: 1 },
        ]);

        const reversed = makeCharacter("reversed", [
            makeBinding(strong, bindingThresholds.easy),
            makeBinding(weak, bindingThresholds.easy),
        ]);
        expect(getStatuses(reversed)).toEqual([
            { definition: sharedStatus, value: 3 },
        ]);
    });

    it("sums modifiers from the effective status levels", () => {
        const strongestPenalty = -5;
        const bonus = 3;
        const penaltyStatus: StatusDef = {
            id: "bound",
            levels: [
                {},
                { modifiers: { defense: -1 } },
                { modifiers: { defense: -3 } },
                { modifiers: { defense: strongestPenalty } },
            ],
        };
        const bonusStatus: StatusDef = {
            id: "gagged",
            levels: [{}, { modifiers: { defense: bonus } }],
        };
        const first = makeBindingDef("first", {
            easy: [{ definition: penaltyStatus, value: 1 }],
        });
        const second = makeBindingDef("second", {
            easy: [{ definition: penaltyStatus, value: 3 }],
        });
        const third = makeBindingDef("third", {
            easy: [{ definition: bonusStatus, value: 1 }],
        });
        const target = makeCharacter("hero", [first, second, third].map((definition) =>
            makeBinding(definition, bindingThresholds.easy),
        ));

        expect(getModifier(target, "defense")).toBe(strongestPenalty + bonus);
        expect(getModifier(target, "willpower")).toBe(0);
    });
});
