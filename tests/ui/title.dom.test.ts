import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getStringTable } from "../../localization";
import { createEngine, type KCQCampaign } from "../../src/content";
import { stockCharacters } from "../../src/stock";
import type { DifficultyId, EncounterId } from "../../src/engine/public/types";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import type { LanguageOption } from "../../src/ui/web/app/language";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import { TitleScreen } from "../../src/ui/web/app/components/TitleScreen";
import { createTitleViewModel } from "../../src/ui/web/app/viewModels/title";

let unmount: (() => void) | undefined;
afterEach(() => { unmount?.(); unmount = undefined; document.body.replaceChildren(); });

function click(selector: string) {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (!button) throw new Error("Missing button " + selector);
    button.click();
}

function mount(languages?: readonly LanguageOption[]) {
    const compositions: ReturnType<typeof createEngine>[] = [];
    const composeCampaign = vi.fn((campaign: KCQCampaign) => {
        const engine = createEngine(stockCharacters, campaign, 12345);
        compositions.push(engine);
        return { engine, presentation: new Presentation(getStringTable("en", stockCharacters, campaign)), languages };
    });
    const prepareBattle = vi.fn((campaign: KCQCampaign, encounter: EncounterId, difficulty: DifficultyId) => {
        const engine = createEngine(stockCharacters, campaign, 12345);
        createBattle(engine, encounter, difficulty);
        return { engine, dispose: vi.fn() };
    });
    const root = document.createElement("div");
    document.body.append(root);
    unmount = render(() => createComponent(GraphicalApp, {
        campaigns: ["skunk"], release: "test", presentation: new Presentation(getStringTable("en", stockCharacters)), languages,
        composeCampaign, prepareBattle,
    }), root);
    return { composeCampaign, prepareBattle, compositions };
}

describe("title navigation", () => {
    it("keeps the header and footer outside the scrolling content and Party visible without a save placeholder", () => {
        mount();
        const screen = document.querySelector(".kcq-title-screen")!;
        expect([...screen.children].map(child => child.className)).toEqual([
            "kcq-screen-layout__header", "kcq-screen-layout__body", "kcq-screen-layout__footer",
        ]);
        const main = screen.querySelector(".kcq-screen-layout__body .kcq-title-screen__main")!;
        expect([...main.children].map(child => child.className)).toEqual([
            "kcq-title-screen__upper", "kcq-title-screen__campaigns",
        ]);
        const upper = main.querySelector(".kcq-title-screen__upper")!;
        expect(upper.children).toHaveLength(1);
        expect(upper.querySelector(".kcq-title-screen__party")).not.toBeNull();
        expect(upper.querySelector(".kcq-encounter-card")).toBeNull();
        const footer = screen.querySelector(".kcq-screen-layout__footer")!;
        for (const selector of [".kcq-title-screen__credits", ".kcq-title-screen__language", ".kcq-title-screen__version"]) {
            expect(footer.querySelector(selector)?.parentElement?.className).toBe("kcq-title-screen__bottom");
            expect(main.querySelector(selector)).toBeNull();
        }
    });

    it.each([0, 1, 3])("renders %i campaign cards in their own list with full descriptions", count => {
        const presentation = new Presentation(getStringTable("en"));
        const description = "A complete campaign description. ".repeat(30);
        const model = createTitleViewModel([], presentation, "test");
        model.campaigns = Array.from({ length: count }, (_, index) => ({
            id: "skunk", name: `Campaign ${index + 1}`, description,
        }));
        const onSelect = vi.fn();
        const root = document.createElement("div");
        document.body.append(root);
        unmount = render(() => createComponent(TitleScreen, {
            model, onSelect,
            language: { value: "en", options: [{ id: "en", label: "English", presentation }], onChange: vi.fn() },
        }), root);
        expect(root.querySelector(".kcq-title-screen__upper")).toBeNull();
        const list = root.querySelector(".kcq-title-screen__campaigns > .kcq-title-screen__campaign-list")!;
        expect(list.children).toHaveLength(count);
        for (const card of list.querySelectorAll<HTMLButtonElement>("button")) {
            expect(card.querySelector("span")?.textContent).toBe(description);
            card.click();
        }
        expect(onSelect).toHaveBeenCalledTimes(count);
        if (count) expect(onSelect).toHaveBeenCalledWith("skunk");
    });

    it("has a labeled native language selector and a keyboard-focusable semantic campaign button", () => {
        const { composeCampaign, prepareBattle } = mount();
        const presentation = new Presentation(getStringTable("en"));
        expect([...document.querySelectorAll(".kcq-title-screen h2")].map(heading => heading.textContent))
            .toEqual([presentation.ui("title.party"), presentation.ui("title.campaigns")]);
        const party = document.querySelector(".kcq-title-screen__party")!;
        expect(party.getAttribute("aria-label")).toBe(presentation.ui("title.party"));
        expect(party.querySelector("p")?.textContent).toBe("Ko-chan, Matsuko, Hinari");
        const changeParty = party.querySelector<HTMLButtonElement>("button")!;
        expect(changeParty.classList.contains("kcq-battle-overview__secondary-action")).toBe(true);
        expect(changeParty.classList.contains("kcq-targeting__back")).toBe(false);
        expect(changeParty.type).toBe("button");
        changeParty.focus();
        expect(document.activeElement).toBe(changeParty);
        const label = document.querySelector<HTMLLabelElement>(".kcq-title-screen__language")!;
        const select = label.querySelector("select")!;
        expect(label.querySelector(".kcq-title-screen__language-label")?.textContent)
            .toBe(presentation.ui("battleSettings.language"));
        expect(select.value).toBe("en");
        expect(select.selectedOptions[0]?.textContent).toBe(presentation.ui("language.en"));
        select.focus();
        expect(document.activeElement).toBe(select);
        const campaign = document.querySelector<HTMLButtonElement>(".kcq-title-screen__campaign")!;
        expect(campaign.type).toBe("button");
        expect(campaign.disabled).toBe(false);
        expect(campaign.tabIndex).toBe(0);
        campaign.focus();
        expect(document.activeElement).toBe(campaign);
        expect(document.querySelector(".kcq-title-screen .kcq-combat-header__settings")).toBeNull();
        expect(composeCampaign).not.toHaveBeenCalled();
        expect(prepareBattle).not.toHaveBeenCalled();
    });

    it("updates localized title content in place and shares language with campaign screens and return to title", () => {
        const presentation = new Presentation(getStringTable("en"));
        const alternate = new Presentation({ ...getStringTable("en", stockCharacters, "skunk"),
            "ui.title.name": "Test Quest", "ui.title.campaigns": "Test campaigns", "ui.title.party": "Test party",
            "ui.battleSettings.language": "Test language label",
            "campaign.skunk.name": "Test campaign", "campaign.skunk.desc": "Test description",
        });
        const { composeCampaign, prepareBattle } = mount([
            { id: "en", label: presentation.ui("language.en"), presentation },
            { id: "test", label: "Test language", presentation: alternate },
        ]);
        const panel = document.querySelector(".kcq-title-screen");
        const select = document.querySelector<HTMLSelectElement>(".kcq-title-screen__language select")!;
        select.value = "test";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        expect(document.querySelector(".kcq-title-screen")).toBe(panel);
        expect(panel?.querySelector("h1")?.textContent).toBe("Test Quest");
        expect([...panel!.querySelectorAll("h2")].map(heading => heading.textContent)).toEqual(["Test party", "Test campaigns"]);
        expect(panel?.querySelector(".kcq-title-screen__party")?.getAttribute("aria-label")).toBe("Test party");
        expect(panel?.querySelector("strong")?.textContent).toBe("Test campaign");
        expect(panel?.querySelector(".kcq-title-screen__campaign > span")?.textContent).toBe("Test description");
        expect(panel?.querySelector(".kcq-title-screen__language-label")?.textContent).toBe("Test language label");
        expect(composeCampaign).not.toHaveBeenCalled();
        click(".kcq-title-screen__campaign");
        expect(document.querySelector(".kcq-encounter-picker h1")?.textContent).toBe("Test campaign");
        click(".kcq-encounter-picker .kcq-combat-header__settings");
        expect(document.querySelector<HTMLSelectElement>(".kcq-battle-settings select")?.value).toBe("test");
        document.querySelector<HTMLButtonElement>(".kcq-battle-settings__overlay button")!.click();
        click(".kcq-encounter-picker .kcq-targeting__back");
        expect(document.querySelector<HTMLSelectElement>(".kcq-title-screen__language select")?.value).toBe("test");
        expect(document.querySelector(".kcq-title-screen h1")?.textContent).toBe("Test Quest");
        expect(prepareBattle).not.toHaveBeenCalled();
    });

    it("selects the campaign library without starting a battle and composes anew after returning to title", () => {
        const { composeCampaign, prepareBattle, compositions } = mount();
        expect(document.querySelector(".kcq-title-screen")).not.toBeNull();
        expect(composeCampaign).not.toHaveBeenCalled();
        click(".kcq-title-screen__campaign");
        expect(composeCampaign).toHaveBeenCalledExactlyOnceWith("skunk", ["ko", "matsuko", "hinari"]);
        expect(document.querySelector(".kcq-title-screen")).toBeNull();
        const library = compositions[0]!.getLibrary();
        const presentation = new Presentation(getStringTable("en", stockCharacters, "skunk"));
        expect([...document.querySelectorAll(".kcq-encounter-picker__row:not(:disabled) .kcq-encounter-picker__name")].map(row => row.textContent))
            .toEqual(library.campaigns.skunk.initial.map(id => presentation.encounter(id)));
        expect(library.encounters).toHaveProperty("forest_3");
        expect(compositions[0]!.getGameState().characters).toEqual([]);
        expect(prepareBattle).not.toHaveBeenCalled();
        click(".kcq-encounter-picker .kcq-targeting__back");
        expect(document.querySelector(".kcq-title-screen")).not.toBeNull();
        click(".kcq-title-screen__campaign");
        expect(composeCampaign).toHaveBeenCalledTimes(2);
        expect(compositions[1]).not.toBe(compositions[0]);
        expect(prepareBattle).not.toHaveBeenCalled();
    });

    it("keeps campaign composition through difficulty, battle, retry, and level select, then clears it at title", () => {
        const { composeCampaign, prepareBattle } = mount();
        click(".kcq-title-screen__campaign");
        click('.kcq-encounter-picker__row[data-kcq-shortcut="1"]');
        click(".kcq-encounter-details__footer button");
        click('.kcq-encounter-picker__row[data-kcq-shortcut="2"]');
        click(".kcq-encounter-details .kcq-battle-overview__primary-action");
        click(".kcq-difficulty-select .kcq-battle-overview__primary-action");
        expect(prepareBattle).toHaveBeenCalledExactlyOnceWith("skunk", "plains_1", "standard", ["ko", "matsuko", "hinari"]);
        click(".kcq-battle-overview .kcq-combat-header__settings");
        const button = (label: string) => {
            const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
            if (!found) throw new Error("Missing " + label);
            found.click();
        };
        button("Retry Battle");
        expect(prepareBattle).toHaveBeenNthCalledWith(2, "skunk", "plains_1", "standard", ["ko", "matsuko", "hinari"]);
        expect(prepareBattle.mock.results[0]!.value.dispose).toHaveBeenCalledOnce();
        expect(prepareBattle.mock.results[1]!.value.engine).not.toBe(prepareBattle.mock.results[0]!.value.engine);
        click(".kcq-battle-overview .kcq-combat-header__settings");
        button("Back to Level Select");
        expect(document.querySelector(".kcq-encounter-picker")).not.toBeNull();
        expect(composeCampaign).toHaveBeenCalledOnce();
        click(".kcq-encounter-picker .kcq-targeting__back");
        expect(document.querySelector(".kcq-title-screen")).not.toBeNull();
        expect(document.querySelector(".kcq-battle-stage")).toBeNull();
        expect(prepareBattle.mock.results[1]!.value.dispose).toHaveBeenCalledOnce();
    });
});
