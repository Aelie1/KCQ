import { readFileSync } from "node:fs";
import { createComponent, type JSX } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { PartySelectionPanel } from "../../src/ui/web/app/components/PartySelectionPanel";
import { EncounterPickerPanel } from "../../src/ui/web/app/components/EncounterPickerPanel";
import { EncounterDetailsPanel } from "../../src/ui/web/app/components/EncounterDetailsPanel";
import { DifficultySelectPanel } from "../../src/ui/web/app/components/DifficultySelectPanel";
import { availableCharacters } from "../../src/ui/web/app/partySelection";
import { ResponsiveLayoutContext } from "../../src/ui/web/app/responsiveScale";
import { createPartySelectionViewModel } from "../../src/ui/web/app/viewModels/partySelection";
import { createEncounterPickerViewModel, createEncounterDetailsViewModel } from "../../src/ui/web/app/viewModels/encounters";
import { createDifficultySelectViewModel } from "../../src/ui/web/app/viewModels/difficulty";
import { stockStrings } from "../helpers/stockStrings";

const library = createStockEngine().getLibrary();
const presentation = new Presentation(stockStrings);
const noop = () => {};
const picker = (onBack: (() => void) | undefined, onChangeParty: (() => void) | undefined) => createComponent(EncounterPickerPanel, {
    model: createEncounterPickerViewModel(library, presentation, library.campaigns.skunk), onSelect: noop, onBack, onChangeParty,
});
const screens: Record<string, () => JSX.Element> = {
    party: () => createComponent(PartySelectionPanel, {
        model: createPartySelectionViewModel(availableCharacters, availableCharacters, presentation), canContinue: true,
        onToggle: noop, onBack: noop, onContinue: noop,
    }),
    picker: () => picker(noop, noop),
    details: () => createComponent(EncounterDetailsPanel, {
        model: createEncounterDetailsViewModel(library, "plains_1", presentation), onBack: noop, onChooseDifficulty: noop,
    }),
    difficulty: () => createComponent(DifficultySelectPanel, {
        model: createDifficultySelectViewModel(library, "plains_1", "standard", presentation),
        onBack: noop, onStart: noop, onSelectDifficulty: noop,
    }),
};
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.replaceChildren(); });
function mount(view: () => JSX.Element, columns: 1 | 3 = 3) {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
    const host = document.createElement("div");
    document.body.append(style, host);
    dispose = render(() => createComponent(ResponsiveLayoutContext.Provider, {
        value: () => ({ columns, zoom: 1 }), get children() { return view(); },
    }), host);
    return host;
}

describe("shared pregame actions", () => {
    it.each(Object.entries(screens).flatMap(([name, view]) => ([1, 3] as const).map(columns => ({ name, view, columns }))))(
        "uses matching actions for $name with $columns columns", ({ view, columns }) => {
            const host = mount(view, columns);
            const footer = host.querySelector<HTMLElement>(".kcq-pregame-actions")!;
            const layout = getComputedStyle(footer);
            expect(footer.parentElement?.className).toBe("kcq-screen-layout__footer");
            expect(host.querySelector(".kcq-screen-layout__body")?.contains(footer)).toBe(false);
            expect(layout.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
            expect(layout.maxWidth).toBe("640px");
            expect(layout.marginInline).toBe("auto");
            expect(layout.gap).toBe("8px");
            const buttons = [...footer.querySelectorAll("button")];
            expect(buttons).toHaveLength(2);
            expect(buttons[0]!.textContent).toContain("Go Back");
            for (const button of buttons) {
                const style = getComputedStyle(button);
                expect([style.width, style.height, style.padding, style.fontSize, style.fontWeight, style.borderRadius])
                    .toEqual(["100%", "42px", "0px 10px", "12px", "700", "8px"]);
            }
            const back = buttons[0]!;
            expect(back.dataset.kcqShortcut).toBe("escape");
            expect(back.querySelector(".kcq-shortcut")).not.toBeNull();
        },
    );

    it.each(["back", "change"])("centers a single picker action: %s", action => {
        const onAction = vi.fn();
        const host = mount(() => picker(action === "back" ? onAction : undefined, action === "change" ? onAction : undefined));
        const footer = host.querySelector<HTMLElement>(".kcq-pregame-actions")!;
        expect(footer.querySelectorAll("button")).toHaveLength(1);
        expect(getComputedStyle(footer).gridTemplateColumns).toBe("minmax(0, 1fr)");
        expect(getComputedStyle(footer).maxWidth).toBe("316px");
        footer.querySelector("button")!.click();
        expect(onAction).toHaveBeenCalledOnce();
    });
});
