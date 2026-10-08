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
        campaigns: ["skunk"], release: "test", presentation: new Presentation(getStringTable("en")), languages,
        composeCampaign, prepareBattle,
    }), root);
    return { composeCampaign, prepareBattle, compositions };
}

describe("title navigation", () => {
    it("has a labeled native language selector and a keyboard-focusable semantic campaign button", () => {
        const { composeCampaign, prepareBattle } = mount();
        const presentation = new Presentation(getStringTable("en"));
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
            "ui.title.name": "Test Quest", "ui.title.campaigns": "Test campaigns",
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
        expect(panel?.querySelector("h2")?.textContent).toBe("Test campaigns");
        expect(panel?.querySelector("strong")?.textContent).toBe("Test campaign");
        expect(panel?.querySelector(".kcq-title-screen__campaign > span")?.textContent).toBe("Test description");
        expect(panel?.querySelector(".kcq-title-screen__language-label")?.textContent).toBe("Test language label");
        expect(composeCampaign).not.toHaveBeenCalled();
        click(".kcq-title-screen__campaign");
        expect(document.querySelector(".kcq-encounter-picker h1")?.textContent).toBe("Test Quest");
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
        expect(composeCampaign).toHaveBeenCalledExactlyOnceWith("skunk");
        expect(document.querySelector(".kcq-title-screen")).toBeNull();
        const library = compositions[0]!.getLibrary();
        const presentation = new Presentation(getStringTable("en", stockCharacters, "skunk"));
        expect([...document.querySelectorAll(".kcq-encounter-picker__name")].map(row => row.textContent))
            .toEqual(Object.values(library.encounters).map(encounter => presentation.encounter(encounter.id)));
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
        click(".kcq-encounter-picker__row");
        click(".kcq-encounter-details .kcq-battle-overview__primary-action");
        click(".kcq-difficulty-select .kcq-battle-overview__primary-action");
        expect(prepareBattle).toHaveBeenCalledExactlyOnceWith("skunk", "plains_1", "standard");
        click(".kcq-battle-overview .kcq-combat-header__settings");
        const button = (label: string) => {
            const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
            if (!found) throw new Error("Missing " + label);
            found.click();
        };
        button("Retry Battle");
        expect(prepareBattle).toHaveBeenNthCalledWith(2, "skunk", "plains_1", "standard");
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
