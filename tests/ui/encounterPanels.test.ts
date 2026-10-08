import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { stockStrings } from "../helpers/stockStrings";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { EncounterPickerPanel } from "../../src/ui/web/app/components/EncounterPickerPanel";
import { EncounterDetailsPanel } from "../../src/ui/web/app/components/EncounterDetailsPanel";
import { createEncounterPickerViewModel, createEncounterDetailsViewModel } from "../../src/ui/web/app/viewModels/encounters";

const library = createStockEngine().getLibrary();
const presentation = new Presentation(stockStrings);

describe("encounter panels", () => {
    it("renders a selectable row for every catalog entry with accessible challenge values", () => {
        const model = createEncounterPickerViewModel(library, presentation);
        const html = renderToString(() => createComponent(EncounterPickerPanel, { model, onSelect: () => {} }));
        expect(html.match(/class="kcq-encounter-card kcq-encounter-picker__row"/g)).toHaveLength(model.encounters.length);
        for (const encounter of model.encounters) {
            expect(html).toContain(encounter.name);
            expect(html).toContain(encounter.stars);
            expect(html).toContain(encounter.challengeLabel);
        }
        expect(html).toContain("👑 ---");
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
