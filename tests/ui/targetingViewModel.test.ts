import { describe, expect, it } from "vitest";
import type { ActionInfo, Effect } from "../../src/engine/public/types";
import { targetingFixtures } from "../../src/ui/web/app/fixtures/targeting";
import {
    createTargetingViewModel,
    isTargetingReady,
    reconcileTargetSelection,
    sanitizeTargetSelection,
    targetingActionIdentity,
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

    it("resets selection when the actor and move identity changes", () => {
        const chooseFixture = targetingFixtures.telekinesisChoose;
        const nextAction: ActionInfo = {
            ...chooseFixture.action,
            move: {
                ...chooseFixture.action.move,
                id: "starlightBindings",
            },
        };
        const nextModel = createTargetingViewModel(
            chooseFixture.state,
            chooseFixture.actorId,
            nextAction,
            chooseFixture.presentation,
        );

        expect(reconcileTargetSelection(
            targetingActionIdentity(chooseFixture.actorId, chooseFixture.action),
            targetingActionIdentity(chooseFixture.actorId, nextAction),
            ["skunkette1"],
            [],
            nextModel,
        )).toEqual([]);

        const sameMoveModel = createTargetingViewModel(
            chooseFixture.state,
            chooseFixture.actorId,
            chooseFixture.action,
            chooseFixture.presentation,
        );
        const sameIdentity = targetingActionIdentity(
            chooseFixture.actorId,
            chooseFixture.action,
        );
        expect(reconcileTargetSelection(
            sameIdentity,
            sameIdentity,
            ["skunkette1"],
            [],
            sameMoveModel,
        )).toEqual(["skunkette1"]);
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
            "enemy",
            "trap",
            "move",
        ]);
        expect(model.targets.every(({ effects: targetEffects }) =>
            targetEffects.every((effect) => effect.kind === "damage-profile"))).toBe(true);
        expect(model.actionEffectGroups).toHaveLength(1);
        expect(model.actionEffectGroups[0]).toMatchObject({
            id: "ko",
            name: "Ko-chan",
        });
        expect(model.actionEffectGroups[0].effects[0]).toMatchObject({
            label: "Add Buff",
            payload: "Fairy Transformation",
            details: ["Defense +3", "Add Reflect"],
        });
    });

    it("groups targetless self-buffs in effect order and puts the operation in the semantic chip", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            move: {
                id: "fairyTransformation",
                targetSide: "player",
                targets: 0,
                type: "mouth",
                traits: ["buff"],
            },
            available: true,
            targets: [],
            effects: [
                {
                    type: "buff",
                    target: "ko",
                    buff: "transformation",
                    operation: "add",
                    effects: { defense: 3 },
                },
                {
                    type: "buff",
                    target: "ko",
                    buff: "pounce",
                    operation: "remove",
                },
                { type: "trap", trap: "trapPuddle", amount: 2 },
            ],
        };
        const model = createTargetingViewModel(
            fixture.state,
            fixture.actorId,
            action,
            fixture.presentation,
        );

        expect(model.actionEffectGroups).toEqual([{
            id: "ko",
            name: "Ko-chan",
            effects: [
                expect.objectContaining({
                    label: "Add Buff",
                    payload: "Fairy Transformation",
                    details: ["Defense +3"],
                }),
                expect.objectContaining({
                    label: "Remove Buff",
                    payload: "Pounce",
                    details: [],
                }),
            ],
        }]);
        expect(model.actionEffects.map(({ type }) => type)).toEqual(["trap"]);
    });

    it("uses the shared linked-player projection for enemy target previews", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const state = {
            ...fixture.state,
            enemies: fixture.state.enemies.map((enemy, index) => index === 0
                ? {
                    ...enemy,
                    buffs: [
                        { id: "pounce", linkedEntity: "ko" },
                        { id: "skunked", linkedEntity: "ko" },
                        { id: "ignored", linkedEntity: "not-a-player" },
                    ],
                }
                : enemy),
        };
        const model = createTargetingViewModel(
            state,
            fixture.actorId,
            fixture.action,
            fixture.presentation,
        );

        expect(model.targets[0].linkedEntities).toEqual([
            { id: "ko", name: "Ko-chan", tone: "ko" },
        ]);
        expect(model.targets[1].linkedEntities).toEqual([]);
    });
});
