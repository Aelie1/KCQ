import { describe, expect, it } from "vitest";
import { escapeFixtures } from "../../src/ui/web/app/fixtures/escape";
import {
    createEscapeViewModel,
    escapeChoiceId,
    initialEscapeSelection,
    sanitizeEscapeSelection,
} from "../../src/ui/web/app/viewModels/escape";

describe("escape view model", () => {
    it("groups public escapes by target in public order and previews each choice", () => {
        const fixture = escapeFixtures.unselected;
        const model = createEscapeViewModel(
            fixture.state,
            fixture.actions,
            fixture.actorId,
            fixture.thresholds,
            fixture.presentation,
        );

        expect(model.groups.map(({ id }) => id)).toEqual(["ko", "matsuko", "hinari"]);
        expect(model.groups[0].choices.map(({ binding }) => binding)).toEqual([
            "latexHead",
            "latexArms",
            "latexTorso",
            "latexLegs",
        ]);
        expect(model.groups[0].choices.map(({ bindingName }) => bindingName)).toEqual([
            "Head",
            "Arms",
            "Torso",
            "Legs",
        ]);
        expect(model.groups[0].choices[1].projection).toMatchObject({
            amount: -19,
            projectedValue: 8,
        });
        expect(model.groups[0].choices[3].projection).toBeUndefined();
        expect(model.command.tags.map(({ id }) => id)).toEqual(["ally", "self"]);
        expect(model.selectedEscapeId).toBeUndefined();
        expect(model.controls.executeLabel).toBe("Use Escape");
    });

    it("uses only the selected public effects across visible binding choices", () => {
        const fixture = escapeFixtures.selectedAssist;
        const actorEscapes = fixture.actions.find(({ id }) => id === fixture.actorId)?.escapes ?? [];
        const selectedId = initialEscapeSelection(actorEscapes, fixture.initialSelectedEscape);
        const model = createEscapeViewModel(
            fixture.state,
            fixture.actions,
            fixture.actorId,
            fixture.thresholds,
            fixture.presentation,
            selectedId
        );
        const ko = model.groups[0];
        const hinari = model.groups[2];

        expect(model.command.tags.map(({ id }) => id)).toEqual(["ally", "self", "spread"]);
        expect(ko.choices[0].projection).toBeUndefined();
        expect(ko.choices[1].projection).toEqual({
            amount: 8,
            projectedValue: 35,
            tone: "moderate",
        });
        expect(hinari.selected).toBe(true);
        expect(hinari.choices[3]).toMatchObject({
            selected: true,
            projection: { amount: -8, projectedValue: 72 },
        });
        expect(model.controls.executeLabel).toBe("Assist Hinari's Skunk Legs");
    });

    it("rejects unavailable and unknown selections", () => {
        const escapes = [
            {
                available: false,
                reason: "escapeUnavailable" as const,
                target: "ko",
                binding: "latexArms",
                effects: [],
            },
        ];
        const id = escapeChoiceId(escapes[0], 0);

        expect(sanitizeEscapeSelection(id, escapes)).toBeUndefined();
        expect(sanitizeEscapeSelection("missing", escapes)).toBeUndefined();
        expect(initialEscapeSelection(escapes, {
            target: "ko",
            binding: "latexArms",
        })).toBeUndefined();
    });

    it("shows every encounter zone in order, including display-only zero slots", () => {
        const fixture = escapeFixtures.unselected;
        const state = {
            ...fixture.state,
            characters: fixture.state.characters.map((character) => character.id === "ko"
                ? { ...character, bindings: character.bindings.filter(({ id }) => id === "latexLegs") }
                : character),
        };
        const actions = fixture.actions.map((action) => action.id === "ko"
            ? { ...action, escapes: action.escapes.filter(({ target, binding }) =>
                target !== "ko" || binding === "latexLegs") }
            : action);
        const model = createEscapeViewModel(
            state, actions, fixture.actorId, fixture.thresholds, fixture.presentation,
        );
        const ko = model.groups.find(({ id }) => id === "ko")!;

        expect(ko.choices.map(({ binding, currentValue }) => [binding, currentValue])).toEqual([
            ["latexHead", 0], ["latexArms", 0], ["latexTorso", 0], ["latexLegs", 0],
        ]);
        expect(ko.choices.slice(0, 3).every(({ displayOnly, available }) => displayOnly && !available)).toBe(true);
        expect(sanitizeEscapeSelection(ko.choices[0].id, actions[0].escapes)).toBeUndefined();
    });

    it("projects selected Spread into zero slots and another visible target group", () => {
        const fixture = escapeFixtures.unselected;
        const actions = fixture.actions.map((action) => action.id === "ko"
            ? {
                ...action,
                escapes: [
                    {
                        available: true,
                        target: "ko",
                        binding: "latexLegs",
                        effects: [
                            { type: "binding" as const, target: "ko", binding: "latexLegs", amount: -7 },
                            { type: "binding" as const, target: "ko", binding: "latexHead", amount: 7 },
                            { type: "binding" as const, target: "matsuko", binding: "latexArms", amount: 6 },
                        ],
                    },
                    { available: false, target: "matsuko", binding: "latexTorso", effects: [] },
                ],
            }
            : action);
        const selectedId = escapeChoiceId(actions[0].escapes[0], 0);
        const state = {
            ...fixture.state,
            characters: fixture.state.characters.map((character) => {
                if (character.id === "ko") {
                    return { ...character, bindings: character.bindings.filter(({ id }) => id !== "latexHead") };
                }
                if (character.id === "matsuko") {
                    return { ...character, bindings: character.bindings.filter(({ id }) => id !== "latexArms") };
                }
                return character;
            }),
        };
        const model = createEscapeViewModel(
            state, actions, fixture.actorId, fixture.thresholds, fixture.presentation, selectedId,
        );
        const ko = model.groups.find(({ id }) => id === "ko")!;
        const matsuko = model.groups.find(({ id }) => id === "matsuko")!;

        expect(ko.choices.find(({ binding }) => binding === "latexHead")?.projection)
            .toMatchObject({ amount: 7, projectedValue: 7, tone: "none" });
        expect(matsuko.choices.find(({ binding }) => binding === "latexArms")?.projection)
            .toMatchObject({ amount: 6, projectedValue: 6, tone: "none" });
        expect(ko.choices.find(({ binding }) => binding === "latexHead")?.displayOnly).toBe(true);
    });

    it("advertises SELF and ALLY only for currently available escapes", () => {
        const fixture = escapeFixtures.unselected;
        const variants = [
            { self: true, ally: false, expected: ["self"] },
            { self: false, ally: true, expected: ["ally"] },
            { self: true, ally: true, expected: ["ally", "self"] },
            { self: false, ally: false, expected: [] },
        ];

        for (const variant of variants) {
            const actions = fixture.actions.map((action) => action.id === "ko" ? {
                ...action,
                escapes: action.escapes.map((escape) => ({
                    ...escape,
                    available: escape.target === "ko" ? variant.self : variant.ally,
                })),
            } : action);
            const model = createEscapeViewModel(
                fixture.state, actions, fixture.actorId, fixture.thresholds, fixture.presentation,
            );
            expect(model.command.tags.map(({ id }) => id)).toEqual(variant.expected);
        }
    });
});
