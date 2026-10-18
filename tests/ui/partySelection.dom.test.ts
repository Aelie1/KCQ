import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStringTable } from "../../localization";
import { createEngine, type KCQCampaign, type KCQCharacter } from "../../src/content";
import type { DifficultyId, EncounterId } from "../../src/engine/public/types";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import { availableCharacters } from "../../src/ui/web/app/partySelection";
import { readSave } from "../../src/ui/web/app/savePersistence";

const strings = getStringTable("en", availableCharacters, "skunk");
const presentation = new Presentation(strings);
let unmount: (() => void) | undefined;
beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("__KCQ_GIT_REVISION__", "party-test");
});
afterEach(() => {
    unmount?.(); unmount = undefined;
    document.body.replaceChildren();
    window.localStorage.clear();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function button(selector: string): HTMLButtonElement {
    const found = document.querySelector<HTMLButtonElement>(selector);
    if (!found) throw new Error("Missing " + selector);
    return found;
}
const click = (selector: string) => button(selector).click();
function press(key: string): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    return event;
}
function labeledButton(label: string) {
    const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === label);
    if (!found) throw new Error("Missing " + label);
    found.click();
}
function mount() {
    const composeCampaign = vi.fn((campaign: KCQCampaign, party: readonly KCQCharacter[]) => ({
        engine: createEngine(party, campaign, 12345), presentation,
    }));
    const prepareBattle = vi.fn((campaign: KCQCampaign, encounter: EncounterId, difficulty: DifficultyId, party: readonly KCQCharacter[]) => {
        const engine = createEngine(party, campaign, 12345);
        createBattle(engine, encounter, difficulty);
        return { engine, dispose: vi.fn() };
    });
    const alternate = new Presentation({
        ...strings,
        "ui.party.title": "Localized party", "ui.party.instructions": "Choose {count}",
        "ui.party.count": "Chosen {selected} of {count}", "ui.party.continue": "Localized next",
        "entity.ko.name": "Localized Ko", "entity.ko.party.role": "Localized role",
        "entity.ko.party.point1": "Localized first point", "entity.ko.party.point2": "Localized second point",
        "entity.ko.party.point3": "Localized third point",
    });
    const host = document.createElement("div"); document.body.append(host);
    unmount = render(() => createComponent(GraphicalApp, {
        campaigns: ["skunk"], release: "test", presentation, composeCampaign, prepareBattle,
        languages: [{ id: "en", label: "English", presentation }, { id: "test", label: "Test", presentation: alternate }],
    }), host);
    return { composeCampaign, prepareBattle };
}

describe("party selection navigation", () => {
    it("shows the localized roster before creating an engine and guards mouse and keyboard confirmation", () => {
        const { composeCampaign, prepareBattle } = mount();
        click(".kcq-title-screen__party button");
        expect(composeCampaign).not.toHaveBeenCalled();
        expect(prepareBattle).not.toHaveBeenCalled();
        const toggles = [...document.querySelectorAll<HTMLButtonElement>(".kcq-party-selection__toggle")];
        expect(toggles.map(toggle => toggle.dataset.characterId)).toEqual(availableCharacters);
        expect(toggles.map(toggle => toggle.getAttribute("aria-pressed"))).toEqual(availableCharacters.map((_, index) => index < 3 ? "true" : "false"));
        expect(document.querySelectorAll(".kcq-party-selection__card.is-selected")).toHaveLength(3);
        expect(document.querySelectorAll('.kcq-party-selection [role="listitem"]')).toHaveLength(availableCharacters.length * 3);
        for (const toggle of toggles) {
            expect(toggle.type).toBe("button");
            expect(toggle.tabIndex).toBe(0);
            toggle.focus();
            if (toggle.disabled) expect(document.activeElement).not.toBe(toggle);
            else expect(document.activeElement).toBe(toggle);
        }
        const koCard = button('[data-character-id="ko"]');
        expect(koCard.matches(".kcq-party-selection__card")).toBe(true);
        koCard.querySelector<HTMLElement>('[role="listitem"]')!.click();
        expect(button('[data-character-id="ko"]').getAttribute("aria-pressed")).toBe("false");
        expect(document.querySelectorAll(".kcq-party-selection__card.is-selected")).toHaveLength(2);
        expect(document.querySelector('[role="status"]')?.textContent).toBe("2 / 3 selected");
        expect(button(".kcq-party-selection__continue").disabled).toBe(true);
        document.activeElement instanceof HTMLElement && document.activeElement.blur();
        click(".kcq-party-selection__continue");
        expect(press("Enter").defaultPrevented).toBe(false);
        expect(composeCampaign).not.toHaveBeenCalled();
        press("1");
        expect(button(".kcq-party-selection__continue").disabled).toBe(false);
        press("Enter");
        expect(document.querySelector(".kcq-title-screen")).not.toBeNull();
        expect(document.querySelector(".kcq-title-screen__party p")?.textContent).toBe("Matsuko, Hinari, Ko-chan");
        expect(JSON.parse(window.localStorage.getItem("kcq.party")!)).toEqual(["matsuko", "hinari", "ko"]);
        click(".kcq-title-screen__campaign");
        expect(composeCampaign).toHaveBeenCalledExactlyOnceWith("skunk", ["matsuko", "hinari", "ko"]);
        expect(prepareBattle).not.toHaveBeenCalled();
    });

    it("uses the selected language for every character description without engine initialization", () => {
        const { composeCampaign } = mount();
        const select = document.querySelector<HTMLSelectElement>(".kcq-title-screen select")!;
        select.value = "test"; select.dispatchEvent(new Event("change", { bubbles: true }));
        click(".kcq-title-screen__party button");
        expect(document.querySelector(".kcq-party-selection h1")?.textContent).toBe("Localized party");
        expect(button('[data-character-id="ko"]').textContent).toContain("Localized Ko");
        expect(document.querySelector(".kcq-party-selection__role")?.textContent).toBe("Localized role");
        expect([...document.querySelectorAll('.kcq-party-selection__card:first-child [role="listitem"]')].map(li => li.textContent))
            .toEqual(["Localized first point", "Localized second point", "Localized third point"]);
        expect(composeCampaign).not.toHaveBeenCalled();
        press("Escape");
        expect(document.querySelector<HTMLSelectElement>(".kcq-title-screen select")?.value).toBe("test");
    });

    it("recomposes after changing party, preserves it through battle and retry, and restores saves directly", () => {
        const { composeCampaign, prepareBattle } = mount();
        click(".kcq-title-screen__campaign");
        click(".kcq-encounter-picker__change-party");
        expect(document.querySelector(".kcq-party-selection")).not.toBeNull();
        expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(3);
        click('[data-character-id="ko"]'); click('[data-character-id="ko"]');
        const party = ["matsuko", "hinari", "ko"];
        expect(composeCampaign).toHaveBeenCalledOnce();
        click(".kcq-party-selection__continue");
        expect(composeCampaign).toHaveBeenNthCalledWith(2, "skunk", party);
        expect(composeCampaign.mock.results[1]!.value.engine.listCharacters()).toEqual(party);
        click('.kcq-encounter-picker__row[data-kcq-shortcut="1"]');
        click(".kcq-encounter-details .kcq-targeting__back");
        click('.kcq-encounter-picker__row[data-kcq-shortcut="2"]');
        press("Enter"); press("Escape"); press("Enter"); press("Enter");
        expect(prepareBattle).toHaveBeenCalledExactlyOnceWith("skunk", "plains_1", "standard", party);
        expect(prepareBattle.mock.results[0]!.value.engine.getGameState().characters.map((character: { id: string }) => character.id)).toEqual(party);
        click(".kcq-battle-overview .kcq-combat-header__settings"); labeledButton("Retry Battle");
        expect(prepareBattle).toHaveBeenNthCalledWith(2, "skunk", "plains_1", "standard", party);
        expect(composeCampaign).toHaveBeenCalledTimes(2);
        click(".kcq-battle-overview .kcq-combat-header__settings"); labeledButton("Back to Title Screen");
        const saved = readSave();
        expect(saved.status).toBe("loaded");
        click(".kcq-title-screen__continue");
        expect(document.querySelector(".kcq-party-selection")).toBeNull();
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
        expect(composeCampaign).toHaveBeenNthCalledWith(3, "skunk", party);
        expect(composeCampaign).toHaveBeenCalledTimes(3);
        if (saved.status !== "loaded") throw new Error("Expected save");
        expect(composeCampaign.mock.results[2]!.value.engine.getSaveState()).toEqual(saved.save.saveState);
        expect(prepareBattle).toHaveBeenCalledTimes(2);
        click(".kcq-battle-overview .kcq-combat-header__settings"); labeledButton("Retry Battle");
        expect(prepareBattle).toHaveBeenNthCalledWith(3, "skunk", "plains_1", "standard", party);
        click(".kcq-battle-overview .kcq-combat-header__settings"); labeledButton("Back to Level Select");
        click(".kcq-encounter-picker__change-party");
        click('[data-character-id="matsuko"]'); click('[data-character-id="matsuko"]');
        click(".kcq-party-selection__continue");
        expect(composeCampaign).toHaveBeenLastCalledWith("skunk", ["hinari", "ko", "matsuko"]);
    });

    it.each(["title", "picker"])("cancels an incomplete draft from %s and keeps the confirmed party after remount", origin => {
        window.localStorage.setItem("kcq.party", '["naruyo","sakari","ko"]');
        window.localStorage.setItem("kcq.unlocks", '{"skunk":["plains_1"]}');
        mount();
        expect(document.querySelector(".kcq-title-screen__party p")?.textContent)
            .toBe(["naruyo", "sakari", "ko"].map(id => presentation.entity(id)).join(", "));
        if (origin === "picker") click(".kcq-title-screen__campaign");
        click(origin === "title" ? ".kcq-title-screen__party button" : ".kcq-encounter-picker__change-party");
        click('[data-character-id="ko"]');
        press("Escape");
        expect(document.querySelector(origin === "title" ? ".kcq-title-screen" : ".kcq-encounter-picker")).not.toBeNull();
        expect(window.localStorage.getItem("kcq.party")).toBe('["naruyo","sakari","ko"]');
        expect(window.localStorage.getItem("kcq.unlocks")).toBe('{"skunk":["plains_1"]}');
        unmount!(); document.body.replaceChildren(); mount();
        expect(document.querySelector(".kcq-title-screen__party p")?.textContent)
            .toBe(["naruyo", "sakari", "ko"].map(id => presentation.entity(id)).join(", "));
    });

    it("keeps a saved party for resume and retry, then composes the preferred party for a new battle", () => {
        const { composeCampaign, prepareBattle } = mount();
        click(".kcq-title-screen__campaign");
        press("1"); press("Escape"); press("2"); press("Enter"); press("Enter");
        click(".kcq-battle-overview .kcq-combat-header__settings"); labeledButton("Back to Title Screen");
        const saved = readSave();
        click(".kcq-title-screen__party button");
        click('[data-character-id="ko"]'); click('[data-character-id="sakari"]');
        click(".kcq-party-selection__continue");
        const preferred = ["matsuko", "hinari", "sakari"];
        expect(readSave()).toEqual(saved);
        click(".kcq-title-screen__continue");
        expect(composeCampaign).toHaveBeenLastCalledWith("skunk", ["ko", "matsuko", "hinari"]);
        click(".kcq-battle-overview .kcq-combat-header__settings"); labeledButton("Retry Battle");
        expect(prepareBattle).toHaveBeenLastCalledWith("skunk", "plains_1", "standard", ["ko", "matsuko", "hinari"]);
        click(".kcq-battle-overview .kcq-combat-header__settings"); labeledButton("Back to Level Select");
        expect(composeCampaign).toHaveBeenLastCalledWith("skunk", preferred);
        expect(composeCampaign.mock.results.at(-1)!.value.engine.listCharacters()).toEqual(preferred);
        press("2"); press("Enter"); press("Enter");
        expect(prepareBattle).toHaveBeenLastCalledWith("skunk", "plains_1", "standard", preferred);
    });
});
