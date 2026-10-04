import { describe, expect, it } from "vitest";
import type { ActionInfo, Effect } from "../../src/engine/public/types";
import { targetingFixtures } from "../../src/ui/web/app/fixtures/targeting";
import {
    createTargetingViewModel,
    isTargetingReady,
    sanitizeTargetSelection,
    toggleTargetSelection,
} from "../../src/ui/web/app/viewModels/targeting";

describe("targeting view model", () => {
    it("preserves target order and the complete public damage profile", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const model = createTargetingViewModel(
            fixture.state,
            fixture.actorId,
            fixture.action,
            fixture.presentation,
        );

        expect(model.heading).toBe("Target / Choose One");
        expect(model.targets.map(({ target }) => target)).toEqual([
            "skunkette1",
            "skunketteQueen",
            "skunkette2",
        ]);
        expect(model.targets[0].accuracy).toEqual({
            miss: 10,
            graze: 15,
            hit: 65,
            crit: 10,
        });
        expect(model.targets[0].damage).toEqual({
            miss: { chance: 10, min: 0, max: 0 },
            graze: { chance: 15, min: 6, max: 15 },
            hit: { chance: 65, min: 24, max: 30 },
            crit: { chance: 10, min: 45, max: 60 },
        });
        expect(model.targets[0].effects[0]).toMatchObject({
            kind: "damage-profile",
            bands: [
                { band: "miss", chance: 10, min: 0, max: 0 },
                { band: "graze", chance: 15, min: 6, max: 15 },
                { band: "hit", chance: 65, min: 24, max: 30 },
                { band: "crit", chance: 10, min: 45, max: 60 },
            ],
        });
        expect(model.actionEffects).toEqual([]);
    });

    it("requires the exact numeric count and prevents duplicate selections", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            ...fixture.action,
            move: { ...fixture.action.move, targets: 2 },
        };
        const model = createTargetingViewModel(
            fixture.state,
            fixture.actorId,
            action,
            fixture.presentation,
        );

        let selected = toggleTargetSelection([], "skunkette1", 2);
        selected = toggleTargetSelection(selected, "skunkette1", 2);
        expect(selected).toEqual([]);

        selected = toggleTargetSelection(selected, "skunkette1", 2);
        selected = toggleTargetSelection(selected, "skunkette2", 2);
        expect(isTargetingReady(model, selected)).toBe(true);
        expect(toggleTargetSelection(selected, "skunketteQueen", 2)).toEqual(selected);
    });

    it("drops invalid and repeated initial selections", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            ...fixture.action,
            targets: [
                fixture.action.targets[0],
                { valid: false, target: "skunketteQueen", reason: "invalidTarget" },
                fixture.action.targets[2],
            ],
        };
        const model = createTargetingViewModel(
            fixture.state,
            fixture.actorId,
            action,
            fixture.presentation,
        );

        expect(sanitizeTargetSelection(
            ["skunketteQueen", "skunkette1", "skunkette1"],
            model,
        )).toEqual(["skunkette1"]);
        expect(model.targets[1]).toMatchObject({
            valid: false,
            reasonLabel: "Invalid target.",
        });
    });

    it("treats all-target actions as predetermined and ready without cyan selection state", () => {
        const fixture = targetingFixtures.allTargets;
        const model = createTargetingViewModel(
            fixture.state,
            fixture.actorId,
            fixture.action,
            fixture.presentation,
        );

        expect(model.mode).toBe("predetermined");
        expect(model.heading).toBe("Target / All Players");
        expect(model.requiredTargetCount).toBe(0);
        expect(model.targets.map(({ target }) => target)).toEqual(["ko", "matsuko", "hinari"]);
        expect(isTargetingReady(model, [])).toBe(true);
        expect(sanitizeTargetSelection(["ko"], model)).toEqual([]);
    });

    it("maps all public effect variants and keeps action effects separate", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const effects: Effect[] = [
            { type: "damage", target: "skunkette1", amount: 18 },
            { type: "binding", target: "skunkette1", binding: "latexArms", amount: 20 },
            {
                type: "buff",
                target: "ko",
                buff: "transformation",
                operation: "add",
                effects: { defense: 3 },
                moveList: { addedMoves: ["reflect"] },
            },
            { type: "enemy", target: "skunkette2", operation: "defeat" },
            { type: "trap", trap: "trapPuddle", amount: 12 },
            { type: "move", move: "telekinesis" },
        ];
        const action: ActionInfo = { ...fixture.action, effects };
        const model = createTargetingViewModel(
            fixture.state,
            fixture.actorId,
            action,
            fixture.presentation,
        );

        expect(model.actionEffects.map(({ type }) => type)).toEqual([
            "damage",
            "binding",
            "buff",
            "enemy",
            "trap",
            "move",
        ]);
        expect(model.targets.every(({ effects: targetEffects }) =>
            targetEffects.every((effect) => effect.kind === "damage-profile"))).toBe(true);
        expect(model.actionEffects[2]).toMatchObject({
            label: "Buff",
            payload: "Fairy Transformation",
            details: ["Add", "Ko-chan", "Defense +3", "Add Reflect"],
        });
    });
});
