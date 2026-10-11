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
const back = () => element<HTMLButtonElement>(".kcq-library__actions button").click();
const press = (key: string, target: EventTarget = document) => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }); target.dispatchEvent(event); return event;
};

describe("Library navigation", () => {
    it("browses a character to move to status and returns through exact history", async () => {
        const close = libraryMount(); await tick();
        element('[data-library-focus="characters"]').click();
        const search = element<HTMLInputElement>('input[type="search"]'); search.value = "Ko-chan"; search.dispatchEvent(new Event("input", { bubbles: true }));
        expect(document.querySelectorAll(".kcq-library__entry")).toHaveLength(1);
        const list = element(".kcq-library .kcq-screen-layout__body"); list.scrollTop = 37;
        const ko = element('[data-library-focus="ko"]'); ko.focus(); ko.click(); await tick();
        element('[data-library-focus="moves:starlightBindings"]').click(); await tick();
        element('[data-library-focus="statuses:bound"]').click(); await tick();
        expect(element(".kcq-library__detail").dataset.libraryId).toBe("bound");
        expect(press("Backspace").defaultPrevented).toBe(true); await tick();
        expect(element(".kcq-library__detail").dataset.libraryId).toBe("starlightBindings");
        back(); await tick(); expect(element(".kcq-library__detail").dataset.libraryId).toBe("ko");
        back(); await tick(); expect(element<HTMLInputElement>('input[type="search"]').value).toBe("Ko-chan");
        expect(element(".kcq-library .kcq-screen-layout__body").scrollTop).toBe(37);
        expect(document.activeElement).toBe(element('[data-library-focus="ko"]'));
        back(); back(); expect(close).toHaveBeenCalledOnce();
    });
    it("keeps text editing Backspace native, restores focus, and closes on Escape", async () => {
        const close = libraryMount({ kind: "category", category: "moves" }); await tick();
        const search = element<HTMLInputElement>("input"); search.focus(); expect(press("Backspace", search).defaultPrevented).toBe(false);
        expect(document.querySelector(".kcq-library__entries")).not.toBeNull();
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
        expect(element(".kcq-library__detail").textContent).toContain("Base Damage");
        expect(element(".kcq-library__detail").textContent).toContain("Actual combat values may differ");
        expect(element(".kcq-preview-effect__payload").textContent).toBe("15");
        expect(element(".kcq-library__detail").textContent).toContain("Consumes empowerment");
        expect(document.querySelector(".kcq-damage-profile")).toBeNull();
    });
    it("shows resource conditions, shared cooldowns, immunities, and encounter aliases", () => {
        libraryMount({ kind: "entry", category: "moves", id: "release" });
        expect(element(".kcq-library__notes").textContent).toContain("at least 25 Subspace");
        unmount!(); libraryMount({ kind: "entry", category: "moves", id: "obey" });
        expect(document.querySelectorAll(".kcq-library__cooldown")).toHaveLength(3);
        expect(element('.kcq-library__notes [data-library-focus="statuses:servitude"]').textContent).toBe("Blocks Escape");
        unmount!(); libraryMount({ kind: "entry", category: "passives", id: "subspaceMovement" });
        expect(element(".kcq-library__detail").textContent).toContain("Ignores Traps");
        expect(element('[data-library-focus="statuses:hobbled"]').textContent).toBe("Hobbled");
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
        element(".kcq-library__actions button:last-child").click();
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
        element(".kcq-library__actions button:last-child").click();
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
        element(".kcq-library__actions button:last-child").click();
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
        expect(element(".kcq-library__actions button").textContent).toContain("Retour");
    });
});


describe("Library category layouts", () => {
    it("uses roster navigation and move cards, and omits absent character sections", async () => {
        libraryMount({ kind: "entry", category: "characters", id: "ko" });
        expect(document.querySelectorAll(".kcq-library__move-grid")).toHaveLength(2);
        const move = element<HTMLButtonElement>('[data-library-focus="moves:fairyTelekinesis"]');
        expect(move.classList.contains("kcq-library__move-card")).toBe(true);
        expect(move.textContent).toContain("2 Hits");
        element('[data-library-focus="characters:matsuko"]').click(); await tick();
        expect(document.querySelector(".kcq-library__passive-card")).toBeNull();
        expect(document.querySelector(".kcq-library__resource")).toBeNull();
        expect(element(".kcq-library__detail").textContent).not.toContain("No innate");
        back(); await tick(); expect(element(".kcq-library__detail").dataset.libraryId).toBe("ko");
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
        expect(document.querySelectorAll(".kcq-buff-effect")).toHaveLength(2);
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
        expect(element(".kcq-library__detail").textContent).toContain("conditional on triggering");
        expect(element(".kcq-library__detail").textContent).toContain("Trigger Probability");
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
