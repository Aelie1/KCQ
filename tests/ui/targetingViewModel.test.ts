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
        expect(model.targets[0].health).toEqual({
            current: 152,
            currentLabel: "152",
            max: 200,
            fillPercent: 76,
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
                buff: {
                    id: "transformation",
                    modifiers: { defense: 3 },
                    moveList: { addedMoves: ["reflect"] }
                },
                operation: "add",
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

        expect(model.actionEffects.map((effect) => effect.kind === "damage-profile" ? "damage" : effect.type)).toEqual([
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
            kind: "buff",
            label: "Add Buff",
            name: "Fairy Transformation",
            modifiers: [expect.objectContaining({ label: "DEF", signedValue: "+3" })],
            moveList: ["Add Reflect"],
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
                    buff: { id: "transformation", modifiers: { defense: 3 } },
                    operation: "add",
                },
                {
                    type: "buff",
                    target: "ko",
                    buff: { id: "pounce" },
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
                    kind: "buff",
                    label: "Add Buff",
                    name: "Fairy Transformation",
                    modifiers: [expect.objectContaining({ label: "DEF", signedValue: "+3" })],
                }),
                expect.objectContaining({
                    kind: "buff",
                    label: "Remove Buff",
                    name: "Pounce",
                    modifiers: [],
                }),
            ],
        }]);
        expect(model.actionEffects.map((effect) => effect.kind === "damage-profile" ? "damage" : effect.type)).toEqual(["trap"]);
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

    it("omits fake zero-target cards while preserving meaningful null-target previews", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            move: { id: "throwOff", targetSide: "none", targets: 0, type: "mouth" },
            available: true,
            targets: [{
                valid: true,
                target: null,
                accuracy: { hit: 100 },
                effects: [{ type: "data", target: "ko", name: "subspace", amount: 25 }],
            }],
            effects: [],
        };
        const model = createTargetingViewModel(
            fixture.state, fixture.actorId, action, fixture.presentation,
            fixture.actions, fixture.thresholds,
        );

        expect(model.heading).toBeUndefined();
        expect(model.targets).toEqual([]);
        expect(model.actionEffects).toEqual([
            expect.objectContaining({ kind: "compact", type: "accuracy" }),
            expect.objectContaining({ label: "Resource", payload: "Ko-chan   Subspace +25" }),
        ]);
    });

    it("uses shared ActionView state for immobilized target summaries", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            move: { id: "assist", targetSide: "player", targets: 1, type: "mouth" },
            available: true,
            targets: [{ valid: true, target: "ko", effects: [] }],
            effects: [],
        };
        const model = createTargetingViewModel(
            fixture.state, fixture.actorId, action, fixture.presentation,
            fixture.actions, fixture.thresholds,
        );

        expect(model.targets[0].characterSummary).toBe("Ready · Immobilized");
    });

    it("formats signed binding projections and crosses public thresholds", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            ...fixture.action,
            effects: [
                { type: "binding", target: "ko", binding: "latexArms", amount: 15 },
                { type: "binding", target: "ko", binding: "latexHead", amount: -32 },
            ],
        };
        const model = createTargetingViewModel(
            fixture.state, fixture.actorId, action, fixture.presentation,
            fixture.actions, fixture.thresholds,
        );
        const effects = model.actionEffectGroups[0].effects;

        expect(effects[0]).toMatchObject({
            kind: "binding", currentValue: 27, projectedValue: 42,
            currentLevel: "moderate", projectedLevel: "heavy",
            levelLabel: "Heavy", deltaLabel: "+15 Binding",
        });
        expect(effects[0]).not.toHaveProperty("recipient");
        expect(effects[1]).toMatchObject({
            kind: "binding", currentValue: 72, projectedValue: 40,
            currentLevel: "severe", projectedLevel: "heavy",
            levelLabel: "Heavy", deltaLabel: "-32 Binding",
        });
    });

    it("suppresses same-scope recipients and retains cross-scope Resource/Data recipients", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            ...fixture.action,
            targets: [{
                valid: true,
                target: "skunkette1",
                effects: [
                    { type: "data", target: "skunkette1", name: "mystery", amount: -4 },
                    { type: "data", target: "hinari", name: "subspace", amount: 25 },
                ],
            }],
        };
        const model = createTargetingViewModel(
            fixture.state, fixture.actorId, action, fixture.presentation,
            fixture.actions, fixture.thresholds,
        );

        expect(model.targets[0].effects[0]).toMatchObject({
            label: "Data", payload: "[data.mystery.name] -4", details: [],
        });
        expect(model.targets[0].effects[1]).toMatchObject({
            label: "Resource", payload: "Hinari   Subspace +25", details: [],
        });
    });

    it("keeps nested buff name primary and move-list changes secondary", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            ...fixture.action,
            effects: [{
                type: "buff",
                target: "ko",
                operation: "add",
                buff: {
                    id: "empowerment",
                    duration: 3,
                    modifiers: { defense: 3, hit: 2, potency: 1 },
                    moveList: { addedMoves: ["fairyTelekinesis", "fairyStarlightBindings"] },
                },
            }],
        };
        const model = createTargetingViewModel(
            fixture.state, fixture.actorId, action, fixture.presentation,
            fixture.actions, fixture.thresholds,
        );

        expect(model.actionEffectGroups[0].effects[0]).toMatchObject({
            kind: "buff",
            name: "Fairy Empowerment",
            durationLabel: "3 Rounds",
            modifiers: [
                expect.objectContaining({ signedValue: "+3" }),
                expect.objectContaining({ signedValue: "+2" }),
            ],
            moveList: ["Add Fairy Telekinesis", "Add Fairy Starlight Bindings"],
        });
    });

    it("classifies clearly harmful public modifier payloads as debuffs", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            ...fixture.action,
            effects: [
                {
                    type: "buff", target: "ko", operation: "add",
                    buff: { id: "subspaceClutter", modifiers: { defense: -2, hit: -2 } },
                },
                {
                    type: "buff", target: "ko", operation: "remove",
                    buff: { id: "subspaceClutter", duration: 2, modifiers: { defense: -2 } },
                },
            ],
        };
        const model = createTargetingViewModel(
            fixture.state, fixture.actorId, action, fixture.presentation,
            fixture.actions, fixture.thresholds,
        );

        expect(model.actionEffectGroups[0].effects[0]).toMatchObject({
            label: "Add Debuff",
            modifiers: [
                expect.objectContaining({ label: "DEF", signedValue: "-2", direction: "right" }),
                expect.objectContaining({ label: "HIT", signedValue: "-2", direction: "right" }),
            ],
        });
        expect(model.actionEffectGroups[0].effects[1]).toMatchObject({
            label: "Remove Debuff", modifiers: [],
        });
        expect(model.actionEffectGroups[0].effects[1]).not.toHaveProperty("durationLabel");
    });
});
