import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { stockStrings } from "../helpers/stockStrings";
import { createStockEngine } from "../../src/stock";
import type { ContentLibrary } from "../../src/engine/public/library";
import { Presentation } from "../../src/ui/presentation/presentation";
import { EncounterPickerPanel } from "../../src/ui/web/app/components/EncounterPickerPanel";
import { EncounterDetailsPanel } from "../../src/ui/web/app/components/EncounterDetailsPanel";
import { createEncounterPickerViewModel, createEncounterDetailsViewModel } from "../../src/ui/web/app/viewModels/encounters";

const library = createStockEngine().getLibrary();
const presentation = new Presentation(stockStrings);

describe("encounter panels", () => {
    it.each([undefined, [], ["missing"], ["missing", "plains_1"], ["__proto__"]])("omits story Next Level without a valid first unlock: %s", unlocks => {
        const changed: ContentLibrary = { ...library, campaigns: { skunk: { ...library.campaigns.skunk,
            victory: unlocks ? { prologue: unlocks } : {} } } };
        const model = createEncounterDetailsViewModel(changed, "prologue", presentation, undefined, "skunk");
        const html = renderToString(() => createComponent(EncounterDetailsPanel, { model, onChooseDifficulty: () => {}, onNextLevel: () => {}, onBack: () => {} }));
        expect(model.nextEncounter).toBeUndefined();
        expect(html).toContain("Go Back");
        expect(html).not.toContain("Next Level");
        expect(html).not.toContain("Choose Difficulty");
    });

    it("keeps Choose Difficulty instead of Next Level for a combat encounter", () => {
        const model = createEncounterDetailsViewModel(library, "plains_1", presentation, undefined, "skunk");
        const html = renderToString(() => createComponent(EncounterDetailsPanel, { model, onChooseDifficulty: () => {}, onNextLevel: () => {}, onBack: () => {} }));
        expect(html).toContain("Choose Difficulty");
        expect(html).not.toContain("Next Level");
    });

    it("renders a selectable row for every catalog entry with accessible challenge values", () => {
        const model = createEncounterPickerViewModel(library, presentation, library.campaigns.skunk, {}, [], true);
        const html = renderToString(() => createComponent(EncounterPickerPanel, { model, onSelect: () => {} }));
        expect(html.match(/class="kcq-encounter-card kcq-encounter-picker__row kcq-shortcut-host"/g)).toHaveLength(model.encounters.length);
        for (const encounter of model.encounters) {
            expect(html).toContain(encounter.name);
            if (encounter.stars > 0) {
                expect(html).toContain(encounter.starsText);
                expect(html).toContain(encounter.challengeLabel);
            } else {
                expect(html).not.toContain(encounter.challengeLabel);
            }
        }
        expect(html).toContain("👑 ---");
    });

    it.each(["prologue", "interlude_1", "interlude_2", "interlude_3", "epilogue"])("renders %s as story-only details", id => {
        const model = createEncounterDetailsViewModel(library, id, presentation, undefined, "skunk");
        const html = renderToString(() => createComponent(EncounterDetailsPanel, { model, onChooseDifficulty: () => {}, onBack: () => {} }));
        expect(model.stars).toBe(0);
        expect(model.enemies).toEqual([]);
        expect(model.description).not.toMatch(/\[encounter\./);
        expect(model.description.trim()).not.toBe("");
        expect(html).toContain("kcq-encounter-details__description");
        expect(html).toContain("Go Back");
        expect(html).not.toContain("kcq-encounter-details__info");
        expect(html).not.toContain("kcq-encounter-details__enemies");
        expect(html).not.toContain("Choose Difficulty");
    });

    it("puts enemy rows in one outer card and uses shared effect previews", () => {
        const model = createEncounterDetailsViewModel(library, "outside", presentation);
        const html = renderToString(() => createComponent(EncounterDetailsPanel, { model, onChooseDifficulty: () => {}, onBack: () => {} }));
        expect(html.match(/class="kcq-encounter-card kcq-encounter-details__enemies"/g)).toHaveLength(1);
        expect(html.match(/class="kcq-encounter-details__enemy"/g)).toHaveLength(model.enemies.length);
        expect(html).toContain("kcq-status-chip--danger");
        expect(html).toContain("kcq-preview-effect");
        expect(html).toContain("Choose Difficulty");
        expect(html).not.toContain("Start Encounter");
        expect(html).toContain("Go Back");
        expect(html).not.toContain("{index}");
    });

    it("omits special rules when the public setup is empty", () => {
        const model = createEncounterDetailsViewModel(library, "plains_1", presentation);
        expect(model.effects).toEqual([]);
        const html = renderToString(() => createComponent(EncounterDetailsPanel, { model, onChooseDifficulty: () => {}, onBack: () => {} }));
        expect(html).not.toContain("kcq-encounter-details__rules");
        expect(html).toContain("Choose Difficulty");
        expect(html).not.toContain("Start Encounter");
    });
});
