import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { createStockEngine } from "../../src/stock";
import type { ActionInfo, DataEffect, Effect } from "../../src/engine/public/types";
import { EffectPreview } from "../../src/ui/web/app/components/EffectPreview";
import { EncounterDetailsPanel } from "../../src/ui/web/app/components/EncounterDetailsPanel";
import { TargetingPanel } from "../../src/ui/web/app/panels/TargetingPanel";
import { targetingFixtures } from "../../src/ui/web/app/fixtures/targeting";
import { createEffectPreviewViewModels } from "../../src/ui/web/app/viewModels/effectPreviews";
import { createEncounterDetailsViewModel } from "../../src/ui/web/app/viewModels/encounters";
import { createTargetingViewModel } from "../../src/ui/web/app/viewModels/targeting";
import { getThresholds } from "../../src/engine/public/mechanics";
import { Presentation } from "../../src/ui/presentation/presentation";
import { stockStrings } from "../helpers/stockStrings";
import { groupEffectPreviews } from "../../src/ui/web/app/viewModels/effectGroups";

const presentation = targetingFixtures.telekinesisChoose.presentation;
const library = createStockEngine().getLibrary();
const resource: DataEffect = { type: "data", target: "hinari", name: "subspace", amount: 25 };
const trap: Effect = { type: "trap", trap: "trapPuddle", amount: 70 };

const visibleMarkup = (html: string) => html.replace(/<!--.*?-->/g, "");

function runtimeState() {
    const engine = createStockEngine(1);
    engine.loadCharacter("hinari");
    engine.loadEncounter("plains_2");
    return engine.getGameState();
}

describe("linked buff preview chips", () => {
    it.each(["pounce", "skunked"])("keeps %s link data and hides only its chip when requested", id => {
        const [effect] = createEffectPreviewViewModels([{
            type: "buff", operation: "add", target: "ko",
            buff: { id, linkedEntity: "skunkette1", statuses: [{ id: "immobilized", value: 1 }] },
        }], { presentation, scopeTarget: "ko" });
        expect(effect).toMatchObject({ linkedEntity: "Skunkette 1", details: ["Immobilized"] });
        const renderPreview = (showLinkedEntities?: boolean) => visibleMarkup(renderToString(() =>
            createComponent(EffectPreview, { effect, showLinkedEntities })));
        for (const showLinkedEntities of [undefined, true]) {
            expect(renderPreview(showLinkedEntities)).toMatch(/kcq-status-chip[^>]*>Skunkette 1<\/span>/);
        }
        expect(renderPreview(false)).not.toContain("Skunkette 1");
        expect(renderPreview(false)).toMatch(/kcq-status-chip[^>]*>Immobilized<\/span>/);
        expect(effect).toHaveProperty("linkedEntity", "Skunkette 1");
    });

    it("retains participant chips in ordinary Targeting target cards and action effect groups", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            ...fixture.action,
            targets: [{ valid: true, target: "skunkette1", effects: [{
                type: "buff", operation: "add", target: "skunkette1",
                buff: { id: "pounce", linkedEntity: "ko" },
            }] }],
            effects: [{ type: "buff", operation: "add", target: "ko",
                buff: { id: "pounce", linkedEntity: "skunkette1" } }],
        };
        const html = visibleMarkup(renderToString(() => createComponent(TargetingPanel, { ...fixture, action })));
        expect(html).toMatch(/kcq-status-chip[^>]*>Ko-chan<\/span>/);
        expect(html).toMatch(/kcq-status-chip[^>]*>Skunkette 1<\/span>/);
    });
});

describe("bounded numeric effect previews", () => {
    it("derives Subspace current/max/change/projected from public runtime state without mutation", () => {
        const state = runtimeState();
        const hinari = state.characters.find(({ id }) => id === "hinari")!;
        const before = JSON.stringify(state);
        const [preview] = createEffectPreviewViewModels([resource], { state, presentation });
        expect(preview).toMatchObject({
            kind: "resource", type: "data", tone: "primary", label: "Resource", resourceName: "Subspace",
            currentValue: hinari.data.subspace, max: hinari.data.subspaceMax, change: 25,
            projectedValue: Math.min(hinari.data.subspaceMax, hinari.data.subspace + 25),
            recipient: "Hinari",
        });
        expect(preview).not.toHaveProperty("currentLevel");
        expect(JSON.stringify(state)).toBe(before);
    });

    it.each([
        { current: 90, amount: 25, projected: 100 },
        { current: 20, amount: -50, projected: 0 },
        { current: 60, amount: -25, projected: 35 },
    ])("clamps resource projections: $current + $amount", ({ current, amount, projected }) => {
        const state = runtimeState();
        state.characters[0].data.subspace = current;
        state.characters[0].data.subspaceMax = 100;
        expect(createEffectPreviewViewModels([{ ...resource, amount }], { state, presentation })[0]).toMatchObject({
            kind: "resource", currentValue: current, change: amount, max: 100, projectedValue: projected,
        });
    });

    it("keeps unknown DataEffects and Subspace without complete context compact", () => {
        const state = runtimeState();
        delete state.characters[0].data.subspaceMax;
        expect(createEffectPreviewViewModels([resource], { state, presentation, scopeTarget: "hinari" })[0]).toMatchObject({
            kind: "compact", label: "Resource", payload: "Subspace +25",
        });
        expect(createEffectPreviewViewModels([resource], { presentation })[0]).toMatchObject({
            kind: "compact", payload: "Hinari   Subspace +25",
        });
        const mystery = { ...resource, name: "mystery" };
        expect(createEffectPreviewViewModels([mystery], { state: runtimeState(), presentation })[0]).toMatchObject({
            kind: "compact", label: "Data",
        });
    });

    it("groups selected Subspace with other Hinari effects and deduplicates selected copies", () => {
        const state = runtimeState();
        const action: ActionInfo = {
            move: { id: "release", targetSide: "enemy", targets: 2, type: "mouth" },
            available: true,
            effects: [{ type: "buff", target: "hinari", operation: "add", buff: { id: "subspaceClutter" } }],
            targets: [
                { valid: true, target: "skunkette1", effects: [resource] },
                { valid: true, target: "skunkette2", effects: [resource] },
            ],
        };
        const model = createTargetingViewModel(state, "hinari", action, presentation, [], getThresholds(), ["skunkette1", "skunkette2"]);
        expect(model.actionEffects).toEqual([]);
        expect(model.actionEffectGroups).toHaveLength(1);
        const [group] = model.actionEffectGroups;
        expect(group).toMatchObject({ id: "hinari", name: presentation.entity("hinari"), tone: "hinari" });
        expect(group.effects).toHaveLength(2);
        expect(group.effects[1]).toMatchObject({ kind: "resource", resourceName: "Subspace", currentValue: 0, projectedValue: 25 });
        group.effects.forEach((effect) => expect(effect).not.toHaveProperty("recipient"));
        expect(model.targets.every(({ effects }) => effects.length === 0)).toBe(true);
        const effectHtml = renderToString(() => createComponent(EffectPreview, { effect: group.effects[1] }));
        expect(effectHtml).toContain("Subspace");
        expect(visibleMarkup(effectHtml)).toContain("0 → 25");
        expect(effectHtml).toContain("kcq-projected-meter--primary");
        expect(effectHtml).not.toContain("Hinari");
        const html = renderToString(() => createComponent(TargetingPanel, {
            ...targetingFixtures.telekinesisChoose, state, actorId: "hinari", action,
            initialSelectedTargetIds: ["skunkette1", "skunkette2"],
        }));
        expect(html).toContain("kcq-targeting__action-effect-group");
        expect(html).toContain("kcq-projected-meter--primary");
    });

    it.each([
        { amount: 70, projected: 100 },
        { amount: -20, projected: 30 },
        { amount: -100, projected: 0 },
    ])("projects traps from actual runtime amount: 50 + $amount", ({ amount, projected }) => {
        const state = runtimeState();
        expect(state.traps).toContainEqual({ id: "trapPuddle", amount: 50 });
        const [preview] = createEffectPreviewViewModels([{ ...trap, amount }], { state, presentation });
        expect(preview).toMatchObject({
            kind: "trap", type: "trap", tone: "warning", trapName: "Latex Puddle",
            currentValue: 50, change: amount, max: 100, projectedValue: projected,
        });
        const html = renderToString(() => createComponent(EffectPreview, { effect: preview }));
        expect(visibleMarkup(html)).toContain("50 → " + projected);
        expect(html).toContain("kcq-projected-meter--warning");
        expect(html).not.toContain("Amount");
        expect(preview).not.toHaveProperty("currentLevel");
    });

    it("uses zero for empty runtime traps and explicit encounter setup, with a standalone fallback", () => {
        const state = runtimeState();
        state.traps = [];
        expect(createEffectPreviewViewModels([trap], { state, presentation })[0]).toMatchObject({
            kind: "trap", currentValue: 0, projectedValue: 70,
        });
        expect(createEffectPreviewViewModels([{ ...trap, amount: 150 }], { presentation, encounterSetup: true })[0]).toMatchObject({
            kind: "trap", currentValue: 0, change: 150, max: 100, projectedValue: 100,
        });
        expect(createEffectPreviewViewModels([trap], { presentation })[0]).toMatchObject({
            kind: "compact", payload: "Latex Puddle", details: ["Amount 70"],
        });
        expect(createEffectPreviewViewModels([{ ...trap, amount: Number.NaN }], { state, presentation })[0].kind).toBe("compact");
    });
});

describe("encounter setup recipient groups", () => {
    it("groups tower recipients in authored order with one Allies group and a rich zero-baseline binding", () => {
        const model = createEncounterDetailsViewModel(library, "tower_1", presentation);
        expect(model.effects).toEqual([]);
        expect(model.effectGroups.map(({ id, name }) => ({ id, name }))).toEqual([
            { id: "empress", name: "Skunk Empress" },
            { id: "skunketteQueen", name: "Skunkette Queen" },
            { id: "allies", name: "Allies" },
        ]);
        const allies = model.effectGroups[2];
        expect(allies.effects).toHaveLength(2);
        expect(allies.effects[0]).toMatchObject({
            kind: "binding", bindingName: "Skunk Collar", currentValue: 0, change: 50, projectedValue: 50,
            currentLevel: "none", projectedLevel: "severe", max: getThresholds().max,
        });
        expect(allies.effects[1]).toMatchObject({ kind: "buff", name: "Ambushed!", durationLabel: "1 Rounds", details: ["Helpless"] });
        model.effectGroups.flatMap(({ effects }) => effects).forEach((effect) => expect(effect).not.toHaveProperty("recipient"));
        const html = renderToString(() => createComponent(EncounterDetailsPanel, { model, onChooseDifficulty: () => {}, onBack: () => {} }));
        expect(html.match(/class="kcq-encounter-details__effect-group"/g)).toHaveLength(3);
        expect(visibleMarkup(html)).toContain("<h3>Allies</h3>");
        expect(html).toContain("kcq-binding-meter--increase");
        expect(visibleMarkup(html)).toContain("0 → ");
        expect(html).not.toMatch(/kcq-status-chip[^>]*>Allies/);
        expect(html).not.toMatch(/kcq-status-chip[^>]*>Skunk Empress/);
        expect(html).not.toContain("+50 Binding");
    });

    it("leaves setup traps ungrouped and projects them from zero", () => {
        const model = createEncounterDetailsViewModel(library, "plains_2", presentation);
        expect(model.effectGroups).toEqual([]);
        expect(model.effects).toHaveLength(1);
        expect(model.effects[0]).toMatchObject({ kind: "trap", currentValue: 0, change: 50, max: 100, projectedValue: 50 });
        const html = renderToString(() => createComponent(EncounterDetailsPanel, { model, onChooseDifficulty: () => {}, onBack: () => {} }));
        expect(visibleMarkup(html)).toContain("0 → 50");
        expect(html).toContain("kcq-projected-meter--warning");
        expect(html).not.toContain("kcq-encounter-details__effect-group");
    });

    it("shares grouping and scopes compact fallbacks while keeping traps independent of recipients", () => {
        const effects: Effect[] = [
            { type: "binding", target: "allies", binding: "latexCollar", amount: 50 },
            trap,
            { type: "buff", target: "empress", operation: "add", buff: { id: "empressMight" } },
            { type: "data", target: "allies", name: "subspace", amount: 25 },
            { type: "binding", target: "allies", binding: "latexArms" },
        ];
        const grouped = groupEffectPreviews(effects, { presentation, encounterSetup: true, thresholds: getThresholds() });
        expect(grouped.groups.map(({ id }) => id)).toEqual(["allies", "empress"]);
        expect(grouped.groups[0].effects).toHaveLength(3);
        expect(grouped.groups[0].effects[1]).toMatchObject({ kind: "compact", payload: "Subspace +25", details: [] });
        expect(grouped.groups[0].effects[2]).toMatchObject({ kind: "compact", details: [] });
        expect(grouped.ungrouped).toHaveLength(1);
        expect(grouped.ungrouped[0]).toMatchObject({ kind: "trap", currentValue: 0 });
        expect(grouped.ungrouped[0]).not.toHaveProperty("recipient");
    });
});

describe("projected spawn identities", () => {
    it.each(["skunk", "fairy"])("uses the generic definition name for %s, even in a scoped preview", definition => {
        const [preview] = createEffectPreviewViewModels([
            { type: "enemy", operation: "spawn", target: definition },
        ], { presentation, scopeTarget: definition });
        expect(preview).toMatchObject({
            kind: "compact", label: "Spawn", payload: presentation.enemyDefinition(definition),
        });
        expect(JSON.stringify(preview)).not.toContain("{index}");
    });

    it("uses localized generic names and preserves indexed existing enemies", () => {
        const localized = new Presentation({
            ...stockStrings,
            "entity.skunk.generic": "Créature invoquée",
            "entity.skunk.name": "Créature {index}",
        });
        const grouped = groupEffectPreviews([
            { type: "enemy", operation: "spawn", target: "skunk" },
            { type: "enemy", operation: "defeat", target: "skunk2" },
        ], { presentation: localized });
        expect(grouped.groups.map(group => group.name)).toEqual(["Créature 2"]);
        expect(grouped.ungrouped).toHaveLength(1);
        expect(grouped.ungrouped[0]).toMatchObject({ payload: "Créature invoquée" });
        expect(createEffectPreviewViewModels([
            { type: "enemy", operation: "defeat", target: "skunk2" },
        ], { presentation: localized })[0]).toMatchObject({ payload: "Créature 2" });
    });
});
