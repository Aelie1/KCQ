import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import type { ContentLibrary } from "../../src/engine/public/library";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import { LibraryPanel } from "../../src/ui/web/app/panels/LibraryPanel";
import type { LibraryPage } from "../../src/ui/web/app/viewModels/library";
import { createEmptyContentLibrary } from "../helpers/library";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
let unmount: (() => void) | undefined;
afterEach(() => { unmount?.(); document.body.replaceChildren(); vi.restoreAllMocks(); localStorage.clear(); });
function mount(view: Parameters<typeof render>[0]) {
    const host = document.createElement("div"); document.body.append(host); unmount = render(view, host);
}
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const result = document.querySelector<T>(selector); if (!result) throw new Error("Missing " + selector); return result;
}
function libraryMount(initialPage?: LibraryPage, library: ContentLibrary = createStockEngine(12345).getLibrary()) {
    const close = vi.fn(); mount(() => createComponent(LibraryPanel, { library, presentation, onClose: close, initialPage })); return close;
}
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
const back = () => element<HTMLButtonElement>(".kcq-library__header-back").click();
const press = (key: string, target: EventTarget = document) => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }); target.dispatchEvent(event); return event;
};

describe("Library navigation", () => {
    it("browses linked details and returns through exact history", async () => {
        const close = libraryMount(); await tick();
        element('[data-library-focus="characters"]').click();
        const list = element(".kcq-library .kcq-screen-layout__body"); list.scrollTop = 37;
        const ko = element('[data-library-focus="ko"]'); ko.focus(); ko.click(); await tick();
        element('[data-library-focus="moves:starlightBindings"]').click(); await tick();
        expect(element(".kcq-library__detail").dataset.libraryId).toBe("starlightBindings");
        expect(document.querySelector('[data-library-focus="statuses:bound"]')).toBeNull();
        expect(press("Backspace").defaultPrevented).toBe(true); await tick();
        expect(element(".kcq-library__detail").dataset.libraryId).toBe("ko");
        back(); await tick();
        expect(list.scrollTop).toBe(37);
        expect(document.activeElement).toBe(element('[data-library-focus="ko"]'));
        back(); back(); expect(close).toHaveBeenCalledOnce();
    });
    it("keeps text editing Backspace native, restores focus, and closes on Escape", async () => {
        const close = libraryMount({ kind: "category", category: "moves" }); await tick();
        const search = document.createElement("input"); document.body.append(search); search.focus(); expect(press("Backspace", search).defaultPrevented).toBe(false);
        expect(document.querySelector(".kcq-library__move-list")).not.toBeNull();
        expect(press("Escape", search).defaultPrevented).toBe(true); expect(close).toHaveBeenCalledOnce();
    });
    it("handles empty categories and missing references", () => {
        const library = createEmptyContentLibrary();
        library.characters.hero = { id: "hero", moves: ["missing"], passives: [], empoweredMoves: [] };
        libraryMount({ kind: "entry", category: "characters", id: "hero" }, library);
        expect(element<HTMLButtonElement>('[data-library-focus="moves:missing"]').disabled).toBe(true);
        unmount!(); libraryMount({ kind: "category", category: "traps" }, library);
        expect(element(".kcq-library__empty").textContent).toContain("No entries");
        unmount!(); libraryMount({ kind: "entry", category: "moves", id: "missing" }, library);
        expect(element(".kcq-library__empty").textContent).toContain("unavailable");
    });
});
describe("Library mechanical detail", () => {
    it("renders binding thresholds with matching status intensity and restrictions", () => {
        libraryMount({ kind: "entry", category: "bindings", id: "latexArms" });
        expect(document.querySelectorAll("[data-binding-level]")).toHaveLength(5);
        expect(element('[data-binding-level="light"]').textContent).toContain("Light");
        expect(element('[data-binding-level="light"]').querySelector(".kcq-library__binding-status")).toBeNull();
        expect(element('[data-binding-level="moderate"]').textContent).toContain("Bound 1");
        expect(element('[data-binding-level="severe"]').textContent).toContain("Bound 3");
        expect(element('[data-binding-level="severe"]').textContent).toContain("Blocks Arms moves");
        expect(element('[data-binding-level="severe"]').textContent).toContain("Cannot Assist");
        expect(element('[data-binding-level="overwhelming"]').textContent).toContain("Overwhelming");
        expect(element('[data-binding-level="overwhelming"]').textContent).toContain("-1");
    });
    it("renders full status levels and distinguishes baseline damage from combat", () => {
        libraryMount({ kind: "entry", category: "statuses", id: "bound" });
        expect(document.querySelectorAll("[data-status-intensity]")).toHaveLength(4);
        expect(element('[data-status-intensity="4"]').textContent).toContain("-8");
        expect(element('[data-status-intensity="4"]').textContent).toContain("Escape");
        unmount!(); libraryMount({ kind: "entry", category: "moves", id: "fairyTelekinesis" });
        expect([...document.querySelectorAll(".kcq-damage-profile__band strong")].map(node => node.textContent)).toEqual(["0–0", "3–8", "12–15", "23–30"]);
        expect(element(".kcq-library__detail").textContent).toContain("Damage per hit");
        expect(element(".kcq-library__detail").textContent).not.toContain("Base Damage");
        expect(element(".kcq-buff-effect").textContent).toContain("Remove Buff");
        expect(element(".kcq-buff-effect").textContent).toContain("Fairy Empowerment");
        expect(element(".kcq-library__detail").textContent).not.toContain("Consumes empowerment");
    });
    it("shows resource conditions, shared cooldowns, immunities, and encounter aliases", () => {
        libraryMount({ kind: "entry", category: "moves", id: "release" });
        expect(element(".kcq-library__notes").textContent).toContain("at least 25 Subspace");
        unmount!(); libraryMount({ kind: "entry", category: "moves", id: "obey" });
        expect(element(".kcq-library__shared-cooldown").textContent).toBe("Compulsion shared cooldown: 2 rounds");
        expect(element(".kcq-library__effect-cards").textContent).toContain("Servitude");
        expect(element(".kcq-library__effect-cards").textContent).toContain("Blocks Escape");
        unmount!(); libraryMount({ kind: "entry", category: "passives", id: "subspaceMovement" });
        expect(element(".kcq-library__detail").textContent).toContain("Ignores Traps");
        expect(element('[data-library-focus="statuses:hobbled"]').textContent).toBe("Immune to Hobbled");
        unmount!(); libraryMount({ kind: "entry", category: "encounters", id: "tower_1" });
        expect(element('.kcq-library__encounter-enemy [data-library-focus="enemies:queen"]').textContent).toBe("Skunk Empress");
        expect(element(".kcq-library__setup").textContent).toContain("Ambushed");
    });
});
describe("Library game integration", () => {
    it("opens from campaign selection without creating or mutating a battle", async () => {
        const engine = createStockEngine(12345); const prepareBattle = vi.fn(() => ({ engine, dispose: vi.fn() }));
        const execute = vi.spyOn(engine, "executeAction"); const load = vi.spyOn(engine, "loadEncounter");
        const before = JSON.stringify(engine.getGameState());
        mount(() => createComponent(GraphicalApp, { campaigns: ["skunk"], release: "test", presentation, composeCampaign: () => ({ engine, presentation }), prepareBattle }));
        element(".kcq-title-screen__campaign").click(); const picker = element(".kcq-encounter-picker");
        element(".kcq-library-access").click(); await tick();
        expect(document.querySelector(".kcq-library")).not.toBeNull();
        expect(element(".kcq-graphical-app__background").hidden).toBe(true);
        press("Escape");
        expect(element(".kcq-encounter-picker")).toBe(picker);
        expect(prepareBattle).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled();
        expect(JSON.stringify(engine.getGameState())).toBe(before);
    });
    it("preserves combat screen and suppresses action shortcuts while browsing", async () => {
        const engine = createStockEngine(12345); createBattle(engine, "plains_1", "standard");
        const execute = vi.spyOn(engine, "executeAction"); const before = JSON.stringify(engine.getGameState());
        mount(() => createComponent(BattleApp, { engine, presentation, release: "test" }));
        const overview = element(".kcq-battle-overview"); element(".kcq-combat-header__settings").click();
        element(".kcq-library-access").click(); await tick();
        press("="); press("1"); press("0"); press("-");
        expect(execute).not.toHaveBeenCalled(); expect(document.querySelector(".kcq-library")).not.toBeNull();
        press("Escape");
        expect(document.querySelector(".kcq-battle-settings")).not.toBeNull();
        element(".kcq-battle-settings .kcq-battle-result__retry").click();
        expect(element(".kcq-battle-overview")).toBe(overview);
        expect(JSON.stringify(engine.getGameState())).toBe(before);
    });
});

describe("Library campaign selection and localization", () => {
    it.each(["details", "difficulty"] as const)("returns to the same %s selection and preserves difficulty", async screen => {
        const engine = createStockEngine(12345);
        const prepareBattle = vi.fn(() => ({ engine, dispose: vi.fn() }));
        mount(() => createComponent(GraphicalApp, { campaigns: ["skunk"], release: "test", presentation, composeCampaign: () => ({ engine, presentation }), prepareBattle }));
        element(".kcq-title-screen__campaign").click(); element(".kcq-encounter-picker__row").click();
        if (screen === "difficulty") {
            element(".kcq-encounter-details__footer button:last-child").click();
            const mythic = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Mythic")!;
            mythic.click();
        }
        const origin = element(screen === "details" ? ".kcq-encounter-details" : ".kcq-difficulty-select");
        element(".kcq-combat-header__settings").click(); element(".kcq-library-access").click(); await tick();
        expect(document.querySelector(".kcq-library")).not.toBeNull();
        press("Escape");
        element(".kcq-battle-settings .kcq-battle-result__retry").click();
        expect(element(screen === "details" ? ".kcq-encounter-details" : ".kcq-difficulty-select")).toBe(origin);
        if (screen === "difficulty") expect(element('[aria-pressed="true"]').textContent).toBe("Mythic");
        expect(prepareBattle).not.toHaveBeenCalled();
    });
    it("updates localized labels and entry names without resetting Library history", async () => {
        const [language, setLanguage] = createSignal(presentation);
        mount(() => createComponent(LibraryPanel, { library: createStockEngine().getLibrary(), get presentation() { return language(); }, onClose: () => {} }));
        element('[data-library-focus="characters"]').click(); element('[data-library-focus="ko"]').click(); await tick();
        setLanguage(new Presentation({ ...stockStrings, "ui.library.characters": "Personnages", "entity.ko.name": "Ko localisée", "ui.library.back": "Retour" }));
        expect(element(".kcq-library__header h1").textContent).toBe("Ko localisée");
        expect(element(".kcq-library__breadcrumbs").textContent).toContain("Personnages");
        back(); await tick(); expect(element(".kcq-library__header h1").textContent).toBe("Personnages");
        expect(element(".kcq-library__header-back").getAttribute("aria-label")).toBe("Retour");
    });
});


describe("Library category layouts", () => {
    it("uses move cards without character picker tabs and omits absent sections", async () => {
        libraryMount({ kind: "category", category: "characters" });
        element('[data-library-focus="ko"]').click(); await tick();
        expect(document.querySelector(".kcq-library__roster")).toBeNull();
        expect(document.querySelectorAll(".kcq-library__move-grid")).toHaveLength(2);
        expect(element('[data-library-focus="moves:fairyTelekinesis"]').textContent).toContain("2 Hits");
        back(); await tick(); element('[data-library-focus="matsuko"]').click(); await tick();
        expect(document.querySelector(".kcq-library__passive-card")).toBeNull();
        expect(document.querySelector(".kcq-library__resource")).toBeNull();
        expect(element(".kcq-library__detail").textContent).not.toContain("No innate");
    });
    it("places owner links near the move summary and returns through history", async () => {
        libraryMount({ kind: "entry", category: "moves", id: "punch" });
        element('.kcq-library__owner [data-library-focus="characters:matsuko"]').click(); await tick();
        expect(element(".kcq-library__detail").dataset.libraryId).toBe("matsuko");
        back(); await tick(); expect(element(".kcq-library__detail").dataset.libraryId).toBe("punch");
    });
    it.each([ ["skunkette", 3], ["skunk", 4], ["fairy", 3], ["queen", 3], ["rainmaker", 1] ] as const)("renders authored %s strategy in decision order", (id, steps) => {
        libraryMount({ kind: "entry", category: "enemies", id });
        expect(document.querySelectorAll(".kcq-library__strategy > li")).toHaveLength(steps);
        expect(element(".kcq-library__detail").firstElementChild?.classList.contains("kcq-library__facts")).toBe(true);
        expect(document.querySelectorAll(".kcq-library__strategy [data-library-focus^='moves:']").length).toBeGreaterThan(0);
        expect(element(".kcq-library__detail").textContent).not.toContain("Related Entries");
    });
    it("renders static transformation effects without combat state and separates differing durations", () => {
        libraryMount({ kind: "entry", category: "moves", id: "fairyTransformation" });
        expect(element(".kcq-library__facts").textContent).toContain("3 Rounds");
        expect(element(".kcq-buff-effect").textContent).toContain("+3");
        unmount!(); libraryMount({ kind: "entry", category: "moves", id: "fairyEmpowerment" });
        expect(document.querySelectorAll(".kcq-buff-effect")).toHaveLength(4);
        expect(element(".kcq-library__detail").textContent).toContain("2 Rounds");
        expect(element(".kcq-library__detail").textContent).toContain("3 Rounds");
        expect(document.querySelector(".kcq-damage-profile")).toBeNull();
    });
    it.each(["latexHead", "latexArms", "latexTorso", "latexLegs", "latexCollar"])("preserves all five %s tiers and navigable status intensities", id => {
        const library = createStockEngine(12345).getLibrary();
        libraryMount({ kind: "entry", category: "bindings", id }, library);
        expect(document.querySelectorAll("[data-binding-level]")).toHaveLength(5);
        for (const [level, statuses] of Object.entries(library.bindings[id]!.status ?? {})) {
            const tier = element('[data-binding-level="' + level + '"]');
            for (const status of statuses) {
                expect(tier.querySelector('[data-library-focus="statuses:' + status.id + '"]')?.textContent).toContain(String(status.level));
            }
        }
        expect(element(".kcq-library__detail").textContent).not.toContain("No status");
    });
    it("uses global effects and an enemy rules table for difficulty, omitting empty effects", () => {
        libraryMount({ kind: "entry", category: "difficulties", id: "extreme" });
        expect(element(".kcq-library__global-effects").textContent).toContain("+2");
        expect(document.querySelectorAll(".kcq-library__rules-table tbody tr")).toHaveLength(5);
        expect(document.querySelectorAll(".kcq-library__rules-table [data-library-focus^='enemies:']")).toHaveLength(5);
        unmount!(); libraryMount({ kind: "entry", category: "difficulties", id: "standard" });
        expect(document.querySelector(".kcq-library__global-effects")).toBeNull();
        expect(document.querySelector(".kcq-library__rules-table")).toBeNull();
    });
    it.each([
        ["characters", "hinari"], ["moves", "immolation"], ["moves", "obey"], ["moves", "release"],
        ["passives", "thousandRestraintsBody"], ["passives", "subspaceMovement"],
        ["statuses", "bound"], ["statuses", "vibrating"], ["encounters", "forest_3"], ["encounters", "tower_1"],
    ] as const)("renders %s/%s without generic related sections or missing strings", (category, id) => {
        libraryMount({ kind: "entry", category, id });
        expect(element(".kcq-library__detail").textContent).not.toContain("Related Entries");
        expect(element(".kcq-library__detail").textContent).not.toMatch(/\[(ui|entity|status|buff|binding)\./);
        expect([...document.querySelectorAll(".kcq-library__muted")].some(node => node.textContent === "None")).toBe(false);
    });
});


describe("Library trap outcomes", () => {
    it("groups serialized campaign binding amounts by probability and navigates directly to bindings", async () => {
        const library = createStockEngine(12345).getLibrary();
        expect(library.traps.trapPuddle.effects).toEqual({
            1: { latexLegs: 10 }, 0.75: { latexLegs: 20 },
            0.35: { latexLegs: 20, latexArms: 20 },
            0.1: { latexLegs: 20, latexArms: 20, latexTorso: 20, latexHead: 20 },
        });
        const before = JSON.stringify(library);
        libraryMount({ kind: "entry", category: "traps", id: "trapPuddle" }, library);
        const outcomes = [...document.querySelectorAll(".kcq-library__trap-outcome")];
        expect(outcomes.map(outcome => outcome.querySelector("h3")?.textContent)).toEqual(["25%", "40%", "25%", "10%"]);
        expect(outcomes.map(outcome => outcome.querySelectorAll(".kcq-library__trap-binding").length)).toEqual([1, 1, 2, 4]);
        expect(outcomes[0]?.textContent).toContain("Up to 10");
        expect(outcomes[3]?.textContent).toContain("Up to 20");
        expect(element(".kcq-library__detail").textContent).toContain("when triggered");
        expect(element(".kcq-library__binding-limit").tagName).toBe("STRONG");
        expect(element(".kcq-library__detail").textContent).not.toContain("Trigger Probability");
        expect(element(".kcq-library__detail").textContent).not.toContain("None 0");
        element('.kcq-library__trap-outcome [data-library-focus="bindings:latexLegs"]').click(); await tick();
        expect(element(".kcq-library__detail").dataset.libraryId).toBe("latexLegs");
        back(); await tick(); expect(element(".kcq-library__detail").dataset.libraryId).toBe("trapPuddle");
        expect(JSON.stringify(library)).toBe(before);
    });
});


describe("Library encounter context", () => {
    it("shows injected best-clear progress and links to difficulty without changing the progress", async () => {
        const library = createStockEngine(12345).getLibrary();
        const progress = { forest_3: "extreme" as const };
        mount(() => createComponent(LibraryPanel, { library, presentation, bestClears: progress, onClose: () => {}, initialPage: { kind: "entry", category: "encounters", id: "forest_3" } }));
        expect(element(".kcq-library__facts").textContent).toContain("Best Clear");
        element('.kcq-library__facts [data-library-focus="difficulties:extreme"]').click(); await tick();
        expect(element(".kcq-library__detail").dataset.libraryId).toBe("extreme");
        back(); await tick(); expect(element(".kcq-library__detail").dataset.libraryId).toBe("forest_3");
        expect(progress).toEqual({ forest_3: "extreme" });
    });
    it("groups starting effects by their real recipient and keeps binding references navigable", async () => {
        libraryMount({ kind: "entry", category: "encounters", id: "tower_1" });
        expect(document.querySelectorAll(".kcq-encounter-details__effect-group")).toHaveLength(3);
        expect(element(".kcq-library__setup").textContent).toContain("Skunk Empress");
        element('.kcq-library__setup [data-library-focus="bindings:latexCollar"]').click(); await tick();
        expect(element(".kcq-library__detail").dataset.libraryId).toBe("latexCollar");
    });
});

describe("Library visual review corrections", () => {
    it("orders character sections and makes the contextual passive summary one card link", async () => {
        libraryMount({ kind: "entry", category: "characters", id: "ko" });
        expect([...document.querySelectorAll(".kcq-library__detail .kcq-card-title")].map(node => node.textContent))
            .toEqual(["Description", "Special Rules", "Passives", "Base Moves", "Empowered Moves"]);
        const card = element<HTMLButtonElement>(".kcq-library__passive-card");
        expect(card.tagName).toBe("BUTTON");
        expect(card.textContent).toContain("Blocks Escape");
        expect(card.textContent).toContain("Ignores Block Mouth");
        expect(card.textContent).not.toContain("Block Arms");
        expect(card.textContent).not.toContain("Block Legs");
        expect(card.querySelector("button")).toBeNull();
        card.click(); await tick();
        expect(element(".kcq-library__detail").dataset.libraryId).toBe("thousandRestraintsBody");
        const rows = [...document.querySelectorAll(".kcq-library__mechanics-table tbody tr")];
        expect(rows.map(row => row.querySelector("th")?.textContent)).toEqual(["Blocks Escape", "Ignores Block Mouth"]);
        expect(rows.every(row => row.querySelector("td")!.textContent!.length > 10)).toBe(true);
        expect(document.querySelector(".kcq-library__notes")).toBeNull();
        back(); await tick();
        expect(element(".kcq-library__detail").dataset.libraryId).toBe("ko");
    });
    it("keeps only Matsuko's compulsion rule and replaces Hinari's resource panel", () => {
        libraryMount({ kind: "entry", category: "characters", id: "matsuko" });
        expect(document.querySelectorAll(".kcq-library__notes li")).toHaveLength(1);
        expect(element(".kcq-library__notes").textContent).toBe("Compulsion moves share cooldowns and do not consume Matsuko's action.");
        expect(element(".kcq-library__notes").textContent).not.toContain("success");
        unmount!(); libraryMount({ kind: "entry", category: "characters", id: "hinari" });
        expect(element(".kcq-library__resource-title").textContent).toBe("Special Resource: Subspace");
        expect(element(".kcq-library__notes").textContent).toContain("Starts empty and has a max of 100");
        expect(element(".kcq-library__notes").textContent).toContain("Rockfall deals more hits the lower Subspace is");
        expect(document.querySelectorAll(".kcq-library__notes li")).toHaveLength(3);
        expect(document.querySelector(".kcq-library__resource")).toBeNull();
        expect(document.querySelectorAll(".kcq-library__move-card")).toHaveLength(5);
    });
    it("puts owner and cooldown in the header and summary while preserving shared cooldowns", () => {
        libraryMount({ kind: "entry", category: "moves", id: "obey" });
        expect(element(".kcq-library__header .kcq-library__owner").textContent).toContain("Matsuko");
        expect(document.querySelector(".kcq-library__detail > .kcq-library__owner")).toBeNull();
        expect(element(".kcq-library__facts").textContent).toContain("Cooldown3 Rounds");
        expect(element(".kcq-library__shared-cooldown").textContent).toBe("Compulsion shared cooldown: 2 rounds");
        expect(document.querySelector(".kcq-library__cooldowns")).toBeNull();
        expect(element(".kcq-library__detail").textContent).toContain("Does not consume the action.");
        expect(element(".kcq-library__detail").textContent).not.toContain("successful hit");
    });
    it.each(["latexMist", "latexPuddle", "latexRegeneration", "latexExplosion"])("preserves the public base amount and conditional mechanics for %s", id => {
        const library = createStockEngine().getLibrary();
        libraryMount({ kind: "entry", category: "moves", id }, library);
        const amount = element(".kcq-library__effect-cards");
        expect(amount.textContent).toContain("Base Effect Amount");
        expect(amount.textContent).toContain(String(library.moves[id]!.baseDamage));
        expect(document.querySelector(".kcq-library__effect-note")).not.toBeNull();
    });
    it("uses concise status labels and always-visible severity effect tables from public data", () => {
        const library = createStockEngine().getLibrary();
        library.statuses.bound.modifiers[1]!.modifiers = { hitarms: -3 };
        libraryMount({ kind: "entry", category: "bindings", id: "latexArms" }, library);
        const tier = element('[data-binding-level="moderate"]');
        expect(tier.querySelectorAll("th").length).toBeGreaterThan(1);
        expect(tier.textContent).toContain("StatusEffects");
        expect(tier.querySelector(".kcq-modifier-meter__label")?.textContent).toBe("Arms");
        expect(tier.querySelector(".kcq-modifier-meter__value")?.textContent).toBe("-3");
        expect(tier.querySelector("details")).toBeNull();
        expect(element(".kcq-library__detail").textContent).not.toContain("Maximum binding");
        expect(element(".kcq-library__detail").textContent).not.toContain("reduced to 10%");
        unmount!(); libraryMount({ kind: "entry", category: "statuses", id: "bound" });
        expect(element('[data-status-intensity="1"] .kcq-modifier-meter__label').textContent).toBe("Arms");
        expect(element(".kcq-library__detail").textContent).not.toContain("do not stack");
    });
    it("navigates through the informational Skunk entry without adding engine definitions", async () => {
        const library = createStockEngine().getLibrary(); const before = JSON.stringify(library);
        libraryMount({ kind: "category", category: "bindings" }, library);
        element('[data-library-focus="skunkBindings"]').click(); await tick();
        expect(element(".kcq-library__header h1").textContent).toBe("Skunk Bindings");
        expect(document.querySelector("[data-binding-level]")).toBeNull();
        expect(element(".kcq-library__detail").textContent).toContain("Spreading");
        expect(element(".kcq-library__detail").textContent).toContain("reduce their bindings by half");
        element('.kcq-library__detail [data-library-focus="bindings:latexHead"]').click(); await tick();
        expect(document.querySelectorAll("[data-binding-level]")).toHaveLength(5);
        expect(element(".kcq-library__detail").textContent).not.toContain("spawns a linked");
        expect(document.querySelector('[data-library-focus="bindings:skunkBindings"]')).toBeNull();
        back(); await tick(); expect(element(".kcq-library__detail").dataset.libraryId).toBe("skunkBindings");
        expect(JSON.stringify(library)).toBe(before);
        expect(library.bindings.skunkBindings).toBeUndefined();
    });
    it("renders campaign-scoped owner groups with localized name-only move entries", async () => {
        const library = createStockEngine().getLibrary();
        const scoped = { ...library, moves: { telekinesis: library.moves.telekinesis!, punch: library.moves.punch! } };
        mount(() => createComponent(LibraryPanel, { library: scoped,
            presentation: new Presentation({ ...stockStrings, "move.telekinesis.name": "Télékinésie", "entity.ko.name": "Ko localisée" }),
            onClose: () => {}, initialPage: { kind: "category", category: "moves" } }));
        expect(document.querySelector("input")).toBeNull();
        expect([...document.querySelectorAll(".kcq-library__move-group h2")].map(node => node.textContent)).toEqual(["Ko localisée", "Matsuko"]);
        expect([...document.querySelectorAll(".kcq-library__entry")].map(node => node.textContent)).toEqual(["Télékinésie", "Punch"]);
        expect(document.querySelector(".kcq-command-tag")).toBeNull();
        const row = element('[data-library-focus="telekinesis"]'); row.focus();
        element(".kcq-screen-layout__body").scrollTop = 55;
        row.click(); await tick(); back(); await tick();
        expect(document.activeElement).toBe(element('[data-library-focus="telekinesis"]'));
        expect(element(".kcq-screen-layout__body").scrollTop).toBe(55);
    });
    it("keeps encounter trap cards and removes standalone trap links", () => {
        libraryMount({ kind: "entry", category: "encounters", id: "forest_3" });
        expect(element(".kcq-library__setup").textContent).toContain("0 → 100");
        expect(element('.kcq-library__setup [data-library-focus="traps:trapPuddle"]').querySelector(".kcq-preview-effect")).not.toBeNull();
        expect(document.querySelector(".kcq-library__setup > .kcq-library__links")).toBeNull();
    });
});


describe("Library Round 4 corrections", () => {
    it.each(["moves", "passives"] as const)("keeps %s owners in the header with history", async category => {
        libraryMount({ kind: "entry", category, id: category === "moves" ? "attackMe" : "subspaceMovement" });
        expect(document.querySelector(".kcq-library__detail > .kcq-library__owner")).toBeNull();
        expect(document.querySelector(".kcq-screen-layout__footer")).toBeNull();
        const id = category === "moves" ? "matsuko" : "hinari";
        element('.kcq-library__header [data-library-focus="characters:' + id + '"]').click(); await tick();
        expect(element(".kcq-library__detail").dataset.libraryId).toBe(id);
        back(); await tick(); expect(element(".kcq-library__detail").dataset.libraryCategory).toBe(category);
    });
    it("uses one horizontal tag container with green passive benefits", () => {
        libraryMount({ kind: "entry", category: "characters", id: "hinari" });
        const tags = element(".kcq-library__passive-card .kcq-library__restrictions");
        expect([...tags.children].map(tag => tag.textContent)).toEqual(["Ignores Traps", "Immune to Hobbled"]);
        expect(tags.querySelectorAll(".kcq-status-chip--success")).toHaveLength(2);
    });
    it("puts HITS in the summary, keeps four baseline per-hit outcomes, and orders AOE first", () => {
        libraryMount({ kind: "entry", category: "moves", id: "fairyTelekinesis" });
        expect(element(".kcq-library__facts").textContent).toContain("Hits2 base hits");
        expect(element(".kcq-library__effect-cards").textContent).not.toContain("base hits");
        expect(document.querySelectorAll(".kcq-damage-profile__band")).toHaveLength(4);
        expect(element(".kcq-library__facts .kcq-library__stat dd").firstElementChild?.textContent).toBe("AOE");
        unmount!(); libraryMount({ kind: "entry", category: "moves", id: "telekinesis" });
        expect(element(".kcq-library__facts").textContent).not.toContain("Hits");
        expect(document.querySelector("[data-library-recipient]")).toBeNull();
    });
    it.each(["phoenixKick", "fairyPhoenixKick", "whiteFlame", "fairyWhiteFlame"])("renders intrinsic %s modifiers independently of damage", id => {
        const library = createStockEngine().getLibrary();
        libraryMount({ kind: "entry", category: "moves", id }, library);
        expect(document.querySelector(".kcq-damage-profile")).not.toBeNull();
        const modifiers = element(".kcq-library__reference-effect .kcq-library__modifiers");
        expect(modifiers.querySelectorAll(".kcq-pip-meter")).toHaveLength(Object.keys(library.moves[id]!.modifiers!).length);
        expect(modifiers.textContent).toContain(id.toLowerCase().includes("phoenix") ? "+3" : "+2");
        expect(element(".kcq-library__reference-effect .kcq-preview-effect__tag").textContent).toBe("Modifiers");
    });
    it("shows both transformation buffs and party empowerment without repeated recipients", () => {
        libraryMount({ kind: "entry", category: "moves", id: "fairyTransformation" });
        expect([...document.querySelectorAll(".kcq-buff-effect .kcq-preview-effect__payload")].map(node => node.textContent)).toEqual(["Fairy Transformation", "Fairy Empowerment"]);
        expect(element(".kcq-library__effect-cards").textContent).toContain("Until consumed");
        unmount!(); libraryMount({ kind: "entry", category: "moves", id: "fairyEmpowerment" });
        expect([...document.querySelectorAll("[data-library-recipient]")].map(node => node.getAttribute("data-library-recipient"))).toEqual(["ko", "allies"]);
        expect(element('[data-library-recipient="ko"]').textContent).toContain("Remove BuffFairy Empowerment");
        expect(element('[data-library-recipient="allies"]').textContent).toContain("Add BuffFairy Empowerment");
        expect(element('[data-library-recipient="allies"]').textContent).toContain("2 Rounds");
        expect(document.querySelector(".kcq-buff-effect .kcq-status-chip")).toBeNull();
    });
    it("groups denial's alternative targets and preserves the binding requirement and sealing", () => {
        libraryMount({ kind: "entry", category: "moves", id: "powerOfDenial" });
        expect([...document.querySelectorAll("[data-library-recipient] h3")].map(node => node.textContent)).toEqual(["Enemies", "Allies", "Ko-chan"]);
        expect(element('[data-library-recipient="enemies"]').textContent).toContain("DefeatTarget Non-Boss Enemy");
        expect(element('[data-library-recipient="allies"]').textContent).toContain("Strongest Binding −100");
        expect(element('[data-library-recipient="allies"]').textContent).toContain("Requires an existing binding");
        expect(element('[data-library-recipient="ko"]').textContent).toContain("Exhausted");
        expect(element('[data-library-recipient="ko"]').textContent).toContain("rest of the encounter");
    });
    it.each(["obey", "stop", "attackMe"])("preserves %s own cooldown and no-action cost with compact shared cooldown", id => {
        const library = createStockEngine().getLibrary();
        libraryMount({ kind: "entry", category: "moves", id }, library);
        expect(element(".kcq-library__facts").textContent).toContain("Cooldown" + library.moves[id]!.cooldown![id] + " Rounds");
        expect(element(".kcq-library__shared-cooldown").textContent).toBe("Compulsion shared cooldown: 2 rounds");
        expect(document.querySelector(".kcq-library__cooldowns")).toBeNull();
        expect(element(".kcq-library__detail").textContent).toContain("Does not consume the action.");
        if (id === "obey") {
            expect(element('[data-library-recipient="allies"]').textContent).toContain("RefreshTarget Ally's Action");
            expect(element('[data-library-recipient="allies"]').textContent).toContain("Add DebuffServitude");
            expect(element(".kcq-library__facts").textContent).toContain("Duration2 Rounds");
            expect(element(".kcq-library__notes").textContent).toContain("not affected by Servitude");
        } else if (id === "stop") {
            expect(element('[data-library-recipient="boss"]').textContent).toContain("WeakenIntentions −25%");
            expect(element('[data-library-recipient="enemy"]').textContent).toContain("CancelIntentions");
        }
    });
    it("represents reflect as a one-charge buff and puts Burnout move rules in its reference", () => {
        libraryMount({ kind: "entry", category: "moves", id: "reflect" });
        expect(element(".kcq-buff-effect").textContent).toContain("Add BuffReflect");
        expect(element(".kcq-buff-effect").textContent).toContain("1 charge · this round");
        expect(element(".kcq-library__effect-note").textContent).toContain("original incoming binding amount");
        expect(document.querySelector(".kcq-library__notes")).toBeNull();
        unmount!(); libraryMount({ kind: "entry", category: "moves", id: "immolation" });
        expect(element(".kcq-buff-effect").textContent).toContain("Add BuffBurnout");
        expect(element(".kcq-library__buff-rules").textContent).toContain("Makes Punch and Kick available");
        expect(document.querySelectorAll(".kcq-library__buff-rules [data-library-focus^='moves:']")).toHaveLength(7);
    });
    it("keeps threshold labels, meters, restrictions, and ordinary status links", () => {
        libraryMount({ kind: "entry", category: "bindings", id: "latexArms" });
        expect([...document.querySelectorAll(".kcq-library__binding-tier h3")].map(node => node.textContent)).toEqual(["Light 10", "Moderate 20", "Heavy 30", "Severe 50", "Overwhelming 80"]);
        expect(document.querySelector(".kcq-library__binding-status .kcq-pip-meter")).not.toBeNull();
        expect(document.querySelector(".kcq-library__binding-status .kcq-library__status-link .kcq-status-chip")).toBeNull();
        expect(element(".kcq-library__detail").textContent).toContain("Cannot Assist");
        expect(document.querySelector('[data-library-focus="bindings:skunkBindings"]')).toBeNull();
    });
    it("uses a spread table and exact conversion wording, with collar rules on its own page", () => {
        libraryMount({ kind: "entry", category: "bindings", id: "skunkBindings" });
        expect([...document.querySelectorAll(".kcq-library__spread-table tbody tr")].map(node => node.textContent)).toEqual(["Heavy25% → 50%", "Severe50% → 100%", "Overwhelming100% → 200%"]);
        expect([...document.querySelectorAll(".kcq-library__strategy li")].map(node => node.textContent)).toEqual([
            "When all four body zones reach Overwhelming, the character becomes Incapacitated and converts into a hostile Skunkette.",
            "Skunk Queen will reclaim her collar from converted characters.",
            "Defeat the converted Skunkette to rescue the character, allowing them to reduce their bindings by half and rejoin the battle.",
        ]);
        expect(element(".kcq-library__detail").textContent).not.toContain("one-fifth");
        unmount!(); libraryMount({ kind: "entry", category: "bindings", id: "latexCollar" });
        expect(element(".kcq-library__notes").textContent).toContain("one-fifth");
        expect(document.querySelectorAll(".kcq-library__notes [data-library-focus^='bindings:']")).toHaveLength(4);
    });
    it.each(["store", "brace", "release", "pounce", "latexMist", "latexPuddle", "latexRegeneration", "latexExplosion", "healingMagic", "empoweringMagic", "barrierMagic", "latexRain", "callReinforcements", "latexRainmaker", "skunkPerfume", "throwOff"])("keeps %s secondary and conditional effects structured and localized", id => {
        libraryMount({ kind: "entry", category: "moves", id });
        expect(document.querySelector(".kcq-library__effect-row")).not.toBeNull();
        expect(document.querySelector(".kcq-library__effect-note")).not.toBeNull();
        expect(element(".kcq-library__detail").textContent).not.toMatch(/\[(ui|buff|move|entity)\./);
    });
});
