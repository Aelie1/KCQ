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

    it("projects ordered nonzero accuracy bands without mojibake", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            ...fixture.action,
            targets: [{
                valid: true,
                target: "skunkette1",
                accuracy: { miss: 40, hit: 60 },
                effects: [],
            }],
        };
        const model = createTargetingViewModel(
            fixture.state, fixture.actorId, action, fixture.presentation,
            fixture.actions, fixture.thresholds,
        );
        const accuracy = model.targets[0].effects[0];

        expect(accuracy).toMatchObject({
            kind: "accuracy-profile",
            bands: [
                { band: "miss", chance: 40, chanceLabel: "Miss · 40%", zero: false },
                { band: "hit", chance: 60, chanceLabel: "Hit · 60%", zero: false },
            ],
        });
        expect(JSON.stringify(accuracy)).not.toContain("Ã‚");
    });

    it("fills omitted damage bands with dim zero ranges without changing authored bands", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            ...fixture.action,
            targets: [{
                valid: true,
                target: "skunkette1",
                damage: { hit: { chance: 100, min: 12, max: 18 } },
                effects: [],
            }],
        };
        const model = createTargetingViewModel(
            fixture.state, fixture.actorId, action, fixture.presentation,
            fixture.actions, fixture.thresholds,
        );

        expect(model.targets[0].effects[0]).toMatchObject({
            kind: "damage-profile",
            bands: [
                { band: "miss", chance: 0, rangeLabel: "0–0", zero: true },
                { band: "graze", chance: 0, rangeLabel: "0–0", zero: true },
                { band: "hit", chance: 100, rangeLabel: "12–18", zero: false },
                { band: "crit", chance: 0, rangeLabel: "0–0", zero: true },
            ],
        });
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
            tone: "ko",
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
            { accessibleLabel: "Linked to Ko-chan", id: "ko", name: "Ko-chan", tone: "ko" },
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
            expect.objectContaining({ kind: "accuracy-profile", type: "accuracy" }),
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
            kind: "binding", currentValue: 27, change: 15, projectedValue: 42, max: fixture.thresholds.max,
            currentLevel: "moderate", projectedLevel: "heavy",
            currentLevelLabel: "Moderate", projectedLevelLabel: "Heavy",
        });
        expect(effects[0]).not.toHaveProperty("deltaLabel");
        expect(effects[0]).not.toHaveProperty("recipient");
        expect(effects[1]).toMatchObject({
            kind: "binding", currentValue: 72, change: -32, projectedValue: 40, max: fixture.thresholds.max,
            currentLevel: "severe", projectedLevel: "heavy",
            currentLevelLabel: "Severe", projectedLevelLabel: "Heavy",
        });
        expect(effects[1]).not.toHaveProperty("deltaLabel");
    });

    it("passes effective binding deltas to previews after high-binding resistance", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            ...fixture.action,
            effects: [
                { type: "binding", target: "ko", binding: "latexTorso", amount: 20 },
                { type: "binding", target: "ko", binding: "latexTorso", amount: -25 },
            ],
        };
        const model = createTargetingViewModel(
            fixture.state, fixture.actorId, action, fixture.presentation,
            fixture.actions, fixture.thresholds,
        );
        const effects = model.actionEffectGroups[0].effects;

        expect(effects[0]).toMatchObject({
            kind: "binding", currentValue: 89, change: 2, projectedValue: 91,
        });
        expect(effects[1]).toMatchObject({
            kind: "binding", currentValue: 89, change: -25, projectedValue: 64,
        });
    });

    it("moves target-derived Resource/Data effects out of target cards", () => {
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

        expect(model.targets[0].effects).toEqual([]);
        expect(model.actionEffects[0]).toMatchObject({
            label: "Data", payload: "Skunkette 1   [data.mystery.name] -4", details: [],
        });
        expect(model.actionEffects).toHaveLength(1);
        expect(model.actionEffectGroups).toHaveLength(1);
        expect(model.actionEffectGroups[0]).toMatchObject({ id: "hinari", name: "Hinari" });
        expect(model.actionEffectGroups[0].effects[0]).toMatchObject({
            kind: "compact", label: "Resource", payload: "Subspace +25", details: [],
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
            tone: "success",
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
            tone: "special",
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

    it("classifies status-only buffs as debuffs and presents Servitude as Blocks Escape", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            ...fixture.action,
            effects: [{
                type: "buff",
                target: "ko",
                operation: "add",
                buff: {
                    id: "servitude",
                    duration: 2,
                    statuses: [{ id: "servitude", value: 1 }],
                },
            }],
        };
        const model = createTargetingViewModel(
            fixture.state, fixture.actorId, action, fixture.presentation,
            fixture.actions, fixture.thresholds,
        );

        expect(model.actionEffectGroups[0].effects[0]).toMatchObject({
            kind: "buff",
            label: "Add Debuff",
            name: "Servitude",
            durationLabel: "2 Rounds",
            details: ["Blocks Escape"],
        });
    });

    it("filters blocked moves through the target's public ActionView but keeps absent added moves", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            ...fixture.action,
            effects: [{
                type: "buff",
                target: "matsuko",
                operation: "add",
                buff: {
                    id: "burnout",
                    moveList: {
                        addedMoves: ["fairyWhiteFlame"],
                        blockedMoves: ["whiteFlame", "fairyWhiteFlame", "immolation"],
                    },
                },
            }],
        };
        const moves = ["whiteFlame", "immolation"].map((id) => ({
            move: { id, targetSide: "enemy" as const, targets: 1, type: "arms" as const },
            available: true,
            targets: [],
            effects: [],
        }));
        const actions = fixture.actions.map((view) => view.id === "matsuko"
            ? { ...view, moves }
            : view);
        const model = createTargetingViewModel(
            fixture.state, fixture.actorId, action, fixture.presentation,
            actions, fixture.thresholds,
        );

        expect(model.actionEffectGroups[0].effects[0]).toMatchObject({
            kind: "buff",
            moveList: [
                "Add Fairy White Flame",
                "Block White Flame",
                "Block Immolation",
            ],
        });
        expect(JSON.stringify(model)).not.toContain("Block Fairy White Flame");
    });

    it("expands non-boss cancellation into named rows without percentages", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const state = {
            ...fixture.state,
            enemies: fixture.state.enemies.map((enemy) => enemy.id === "skunkette1"
                ? {
                    ...enemy,
                    rank: "enemy" as const,
                    intentions: [
                        { move: "latexSpray", targets: [], effects: [] },
                        { move: "pounce", targets: [], effects: [] },
                    ],
                }
                : enemy),
        };
        const action: ActionInfo = {
            ...fixture.action,
            effects: [{ type: "intention", operation: "cancel", target: "skunkette1", amount: 0.25 }],
        };
        const model = createTargetingViewModel(
            state, fixture.actorId, action, fixture.presentation, fixture.actions, fixture.thresholds,
        );

        expect(model.actionEffects).toEqual([
            expect.objectContaining({ label: "Cancel", payload: "Latex Spray" }),
            expect.objectContaining({ label: "Cancel", payload: "Pounce" }),
        ]);
        expect(JSON.stringify(model.actionEffects)).not.toContain("25%");
        expect(JSON.stringify(model.actionEffects)).not.toContain("0.25");
    });

    it("projects a single non-boss intention as one named Cancel row", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const state = {
            ...fixture.state,
            enemies: fixture.state.enemies.map((enemy) => enemy.id === "skunkette1"
                ? { ...enemy, intentions: [{ move: "latexSpray", targets: [], effects: [] }] }
                : enemy),
        };
        const action: ActionInfo = {
            ...fixture.action,
            effects: [{ type: "intention", operation: "cancel", target: "skunkette1", amount: 0.25 }],
        };
        const model = createTargetingViewModel(
            state, fixture.actorId, action, fixture.presentation, fixture.actions, fixture.thresholds,
        );

        expect(model.actionEffects).toEqual([
            expect.objectContaining({ label: "Cancel", payload: "Latex Spray" }),
        ]);
    });

    it("expands boss weakening in intention order with computed percentages", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const state = {
            ...fixture.state,
            enemies: fixture.state.enemies.map((enemy) => enemy.id === "skunketteQueen"
                ? {
                    ...enemy,
                    rank: "boss" as const,
                    intentions: [
                        { move: "skunkGun", targets: [], effects: [] },
                        { move: "latexRain", targets: [], effects: [] },
                    ],
                }
                : enemy),
        };
        const action: ActionInfo = {
            ...fixture.action,
            effects: [{ type: "intention", operation: "cancel", target: "skunketteQueen", amount: 0.25 }],
        };
        const model = createTargetingViewModel(
            state, fixture.actorId, action, fixture.presentation, fixture.actions, fixture.thresholds,
        );

        expect(model.actionEffects).toEqual([
            expect.objectContaining({ label: "Weaken", payload: "Skunk Gun 25%" }),
            expect.objectContaining({ label: "Weaken", payload: "Latex Rain 25%" }),
        ]);

        const fortyPercent = createTargetingViewModel(
            state,
            fixture.actorId,
            { ...action, effects: [{ type: "intention", operation: "cancel", target: "skunketteQueen", amount: 0.4 }] },
            fixture.presentation,
            fixture.actions,
            fixture.thresholds,
        );
        expect(fortyPercent.actionEffects[0]).toMatchObject({ payload: "Skunk Gun 40%" });
    });

    it("projects differing target resources only after selection and updates by target", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            move: { id: "release", targetSide: "either", targets: 1, type: "mouth" },
            available: true,
            targets: [
                { valid: true, target: "ko", effects: [{ type: "data", target: "hinari", name: "subspace", amount: -50 }] },
                { valid: true, target: "matsuko", effects: [{ type: "data", target: "hinari", name: "subspace", amount: -50 }] },
                { valid: true, target: "skunkette1", effects: [{ type: "data", target: "hinari", name: "subspace", amount: -25 }] },
            ],
            effects: [],
        };
        const create = (selected: readonly string[] = []) => createTargetingViewModel(
            fixture.state, fixture.actorId, action, fixture.presentation,
            fixture.actions, fixture.thresholds, selected,
        );

        expect(create().actionEffects).toEqual([]);
        expect(create().targets.every(({ effects }) => effects.length === 0)).toBe(true);
        expect(create(["ko"]).actionEffectGroups[0].effects).toEqual([
            expect.objectContaining({ label: "Resource", payload: "Subspace -50" }),
        ]);
        expect(create(["skunkette1"]).actionEffectGroups[0].effects).toEqual([
            expect.objectContaining({ label: "Resource", payload: "Subspace -25" }),
        ]);
    });

    it("shows one shared target resource before selection and deduplicates selected copies", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const resource = { type: "data" as const, target: "hinari", name: "subspace", amount: -25 };
        const action: ActionInfo = {
            move: { id: "release", targetSide: "enemy", targets: 2, type: "mouth" },
            available: true,
            targets: [
                { valid: true, target: "skunkette1", effects: [resource] },
                { valid: true, target: "skunkette2", effects: [resource] },
            ],
            effects: [],
        };
        const create = (selected: readonly string[] = []) => createTargetingViewModel(
            fixture.state, fixture.actorId, action, fixture.presentation,
            fixture.actions, fixture.thresholds, selected,
        );

        expect(create().actionEffectGroups[0].effects).toEqual([
            expect.objectContaining({ payload: "Subspace -25" }),
        ]);
        expect(create(["skunkette1", "skunkette2"]).actionEffectGroups).toHaveLength(1);
        expect(create(["skunkette1", "skunkette2"]).actionEffectGroups[0].effects).toHaveLength(1);
        expect(create(["skunkette1", "skunkette2"]).actionEffects).toEqual([]);
    });
});
