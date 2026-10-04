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
            "H",
            "A",
            "T",
            "L",
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
            fixture.presentation,
            selectedId,
        );
        const ko = model.groups[0];
        const hinari = model.groups[2];

        expect(model.command.tags.map(({ id }) => id)).toEqual(["ally", "self", "spread"]);
        expect(ko.choices[0].projection).toBeUndefined();
        expect(ko.choices[1].projection).toEqual({
            amount: 8,
            projectedValue: 35,
            tone: "danger",
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
});
