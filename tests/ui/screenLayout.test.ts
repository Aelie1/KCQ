import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { englishStrings } from "../../localization/en";
import { createEngine } from "../../src/engine/public/engine";
import { Presentation } from "../../src/ui/presentation/presentation";
import { EncounterDetailsPanel } from "../../src/ui/web/app/components/EncounterDetailsPanel";
import { EncounterPickerPanel } from "../../src/ui/web/app/components/EncounterPickerPanel";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { characterDetailsFixture } from "../../src/ui/web/app/fixtures/characterDetails";
import { escapeFixtures } from "../../src/ui/web/app/fixtures/escape";
import { gameLogFixture } from "../../src/ui/web/app/fixtures/gameLog";
import { targetingFixtures } from "../../src/ui/web/app/fixtures/targeting";
import { BattleOverviewPanel } from "../../src/ui/web/app/panels/BattleOverviewPanel";
import { CharacterDetailsPanel } from "../../src/ui/web/app/panels/CharacterDetailsPanel";
import { EscapePanel } from "../../src/ui/web/app/panels/EscapePanel";
import { GameLogPanel } from "../../src/ui/web/app/panels/GameLogPanel";
import { TargetingPanel } from "../../src/ui/web/app/panels/TargetingPanel";
import { createEncounterDetailsViewModel, createEncounterPickerViewModel } from "../../src/ui/web/app/viewModels/encounters";

const library = createEngine().getLibrary();
const presentation = new Presentation(englishStrings);
const noop = () => {};
const screens = [
    { name: "Encounter Picker", render: () => createComponent(EncounterPickerPanel, {
        model: createEncounterPickerViewModel(library, presentation), onSelect: noop,
    }), content: "kcq-encounter-picker__row", footer: undefined, roster: false },
    { name: "Encounter Details", render: () => createComponent(EncounterDetailsPanel, {
        model: createEncounterDetailsViewModel(library, "forest_3", presentation), onBack: noop, onStart: noop,
    }), content: "kcq-encounter-details__description", footer: "kcq-encounter-details__footer", roster: false },
    { name: "Battle Overview", render: () => createComponent(BattleOverviewPanel, battleOverviewFixture),
        content: "kcq-battle-section", footer: "kcq-battle-overview__footer", roster: false },
    { name: "Character Details", render: () => createComponent(CharacterDetailsPanel, characterDetailsFixture),
        content: "kcq-character-commands", footer: "kcq-character-details__footer", roster: true },
    { name: "Targeting", render: () => createComponent(TargetingPanel, targetingFixtures.telekinesisReady),
        content: "kcq-targeting__panel", footer: "kcq-targeting__footer", roster: true },
    { name: "Escape", render: () => createComponent(EscapePanel, escapeFixtures.selectedAssist),
        content: "kcq-escape__panel", footer: "kcq-escape__footer", roster: true },
    { name: "Game Log", render: () => createComponent(GameLogPanel, gameLogFixture),
        content: "kcq-game-log__group", footer: undefined, roster: false },
];

describe("graphical screen regions", () => {
    it.each(screens)("keeps $name headers and actions outside the scrollable content", (screen) => {
        const html = renderToString(screen.render);
        expect(html.match(/class="kcq-screen-layout /g)).toHaveLength(1);
        const headerStart = html.indexOf('class="kcq-screen-layout__header"');
        const bodyStart = html.indexOf('class="kcq-screen-layout__body"');
        const footerStart = html.indexOf('class="kcq-screen-layout__footer"');
        expect(headerStart).toBeGreaterThan(0);
        expect(bodyStart).toBeGreaterThan(headerStart);
        const header = html.slice(headerStart, bodyStart);
        const body = html.slice(bodyStart, footerStart < 0 ? undefined : footerStart);
        expect(header).toContain("kcq-combat-header");
        expect(body).toContain(screen.content);
        expect(body).not.toContain("<footer");
        if (screen.roster) {
            expect(header).toContain("kcq-character-roster");
            expect(body).not.toContain("kcq-character-roster");
            expect(body).toContain("kcq-character-capabilities");
        }
        if (screen.footer) {
            expect(footerStart).toBeGreaterThan(bodyStart);
            expect(html.slice(footerStart)).toContain(screen.footer);
            expect(html.slice(footerStart).match(/<button/g)).toHaveLength(2);
        } else {
            expect(footerStart).toBe(-1);
        }
    });
});
