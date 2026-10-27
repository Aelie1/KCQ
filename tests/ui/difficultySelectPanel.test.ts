import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import type { DifficultyId } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { DifficultySelectPanel } from "../../src/ui/web/app/components/DifficultySelectPanel";
import { createDifficultySelectViewModel } from "../../src/ui/web/app/viewModels/difficulty";
import { stockStrings } from "../helpers/stockStrings";

const library = createStockEngine().getLibrary();
const presentation = new Presentation(stockStrings);
const noop = () => { };

function render(difficulty: DifficultyId, encounter = "forest_3") {
    const model = createDifficultySelectViewModel(library, encounter, difficulty, presentation);
    return renderToString(() => createComponent(DifficultySelectPanel, {
        model, onSelectDifficulty: noop, onBack: noop, onStart: noop,
    }));
}

describe("difficulty select panel", () => {
    it.each(["casual", "standard", "veteran", "extreme", "mythic"] as const)("renders five choices with one selected button for %s", difficulty => {
        const html = render(difficulty);
        expect(html).toContain("kcq-difficulty-select__card");
        const buttons = html.match(/<button[^>]*kcq-difficulty-select__choice[^>]*>[^<]*<\/button>/g);
        expect(buttons).toHaveLength(5);
        expect(buttons?.filter(button => button.includes('aria-pressed="true"'))).toHaveLength(1);
        expect(buttons?.find(button => button.includes('aria-pressed="true"'))).toContain("is-selected");
        expect(buttons?.find(button => button.includes('aria-pressed="true"'))).toContain(presentation.difficulty(difficulty));
        expect(buttons?.filter(button => button.includes('aria-pressed="false"'))).toHaveLength(4);
        expect(html).toContain(presentation.difficulty(difficulty, "desc"));
        expect(html).toContain(presentation.encounter("forest_3"));
        expect(html).toMatch(/<button[^>]*aria-label="Settings"[^>]*disabled/);
    });

    it.each([
        ["casual", true, false, 2], ["standard", false, false, 0], ["veteran", true, false, 1],
        ["extreme", true, true, 1], ["mythic", true, true, 2],
    ] as const)("renders the required optional cards for %s", (difficulty, global, special, value) => {
        const html = render(difficulty);
        expect(html.includes("kcq-difficulty-select__global-effects")).toBe(global);
        expect(html.includes("kcq-difficulty-select__special-rules")).toBe(special);
        if (global) {
            expect(html).toContain("kcq-buff-effect");
            expect(html).toContain("kcq-preview-effect--success");
            expect(html).toContain("Difficulty Modifier");
            expect(html).toContain("kcq-pip-meter");
            expect(html).toContain(`+${value}`);
            expect(html).not.toContain("kcq-effect-recipient");
        }
        if (special) {
            expect(html).toContain('scope="col">Enemy');
            expect(html).toContain('scope="col">Change');
            expect(html.match(/scope="row"/g)).toHaveLength(5);
            for (const enemy of ["rainmaker", "skunkette", "skunk", "fairy", "queen"]) {
                expect(html).toContain(presentation.difficulty(difficulty, enemy));
            }
            expect(html).not.toMatch(/\[difficulty\./);
        }
    });

    it("renders scoped ally HIT and ESC modifiers for Casual", () => {
        const html = render("casual");
        expect(html).toContain("<h3>Allies</h3>");
        expect(html).toContain(">HIT<");
        expect(html).toContain(">ESC<");
        expect(html.match(/class="kcq-effect-modifier"/g)).toHaveLength(2);
    });

    it("renders enemies POT for Extreme and places both actions in the shared footer", () => {
        const html = render("extreme");
        expect(html).toContain("<h3>Enemies</h3>");
        expect(html).toContain(">POT<");
        const bodyStart = html.indexOf('class="kcq-screen-layout__body"');
        const footerStart = html.indexOf('class="kcq-screen-layout__footer"');
        expect(footerStart).toBeGreaterThan(bodyStart);
        expect(html.slice(bodyStart, footerStart)).not.toContain("<footer");
        const footer = html.slice(footerStart);
        expect(footer).toContain("kcq-screen-actions");
        expect(footer).toContain("Go Back");
        expect(footer).toContain("Start Encounter");
        expect(footer.match(/<button/g)).toHaveLength(2);
        expect(html).not.toContain("href=");
    });
});
