import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stockStrings } from "../helpers/stockStrings";
import { createStockEngine } from "../../src/stock";
import type { DifficultyId, EncounterId } from "../../src/engine/public/types";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import type { LanguageOption } from "../../src/ui/web/app/language";
import { createBattleTelemetryObserver } from "../../src/ui/web/telemetry";

const presentation = new Presentation(stockStrings);
let unmount: (() => void) | undefined;

afterEach(() => {
    unmount?.();
    unmount = undefined;
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

function button(label: string, scope: ParentNode = document): HTMLButtonElement {
    const found = [...scope.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.trim() === label);
    if (!found) throw new Error("Missing button: " + label);
    return found;
}

function mountBattle(languages?: readonly LanguageOption[]) {
    const capture = vi.fn();
    const sessions: { engine: ReturnType<typeof createStockEngine>; observer: ReturnType<typeof createBattleTelemetryObserver>; dispose: ReturnType<typeof vi.fn> }[] = [];
    function prepare(encounter: EncounterId, difficulty: DifficultyId) {
        const engine = createStockEngine(12345 + sessions.length);
        createBattle(engine, encounter, difficulty);
        const observer = createBattleTelemetryObserver({
            telemetry: { enabled: true, capture }, replayId: "test-" + sessions.length, release: "test",
            encounter, seed: engine.getSeed(), initialState: engine.getGameState(),
            getCurrentState: () => engine.getGameState(),
        });
        const session = { engine, observer, dispose: vi.fn() };
        sessions.push(session);
        return session;
    }
    const prepareBattle = vi.fn(prepare);
    const root = document.createElement("div");
    document.body.append(root);
    unmount = render(() => createComponent(GraphicalApp, {
        engine: createStockEngine(), presentation, prepareBattle, languages,
    }), root);
    const encounter = [...document.querySelectorAll<HTMLButtonElement>(".kcq-encounter-picker__row")]
        .find(row => row.querySelector("strong")?.textContent === presentation.encounter("plains_1"));
    if (!encounter) throw new Error("Missing plains_1 encounter");
    encounter.click();
    button("Choose Difficulty").click();
    button("Mythic").click();
    button("Start Encounter").click();
    return { sessions, prepareBattle, capture, root, engine: sessions[0]!.engine };
}

function openSettings(): HTMLElement {
    const gear = document.querySelector<HTMLButtonElement>(".kcq-battle-overview .kcq-combat-header__settings")!;
    gear.focus();
    gear.click();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) throw new Error("Settings did not open");
    return dialog;
}

function key(key: string, shiftKey = false) {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
}

describe("battle settings interactions", () => {
    it("opens from the gear with primary Resume, language, divider and navigation in order", () => {
        mountBattle();
        const background = document.querySelector(".kcq-battle-stage__background")!;
        const overview = document.querySelector(".kcq-battle-overview");
        const dialog = openSettings();
        expect(dialog.getAttribute("aria-modal")).toBe("true");
        expect(dialog.parentElement?.parentElement?.classList.contains("kcq-battle-result__overlay")).toBe(true);
        expect(document.querySelector(".kcq-battle-overview")).toBe(overview);
        expect(background.contains(dialog)).toBe(false);
        expect(background.hasAttribute("inert")).toBe(true);
        expect(background.getAttribute("aria-hidden")).toBe("true");
        expect(document.activeElement).toBe(button("Resume", dialog));
        const controls = [...dialog.querySelectorAll("button, label, hr")];
        expect(controls.map(control => control.tagName)).toEqual(["BUTTON", "LABEL", "HR", "BUTTON", "BUTTON"]);
        expect(button("Resume", dialog).classList.contains("kcq-battle-result__retry")).toBe(true);
        expect(dialog.querySelector("label")?.textContent).toContain("Language");
        expect(dialog.querySelector("select")?.value).toBe("en");
    });

    it.each(["Resume", "backdrop", "viewport", "Escape"])("resumes via %s without combat or lifecycle changes", async method => {
        const { engine, sessions, prepareBattle, capture } = mountBattle();
        const before = engine.getGameState();
        const actions = engine.getActionView();
        const execute = vi.spyOn(engine, "executeAction");
        const calls = capture.mock.calls.length;
        openSettings();
        if (method === "Resume") button("Resume").click();
        else if (method === "Escape") key("Escape");
        else document.querySelector<HTMLElement>(method === "backdrop"
            ? ".kcq-battle-settings__overlay" : ".kcq-battle-result__viewport")!.click();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(document.querySelector(".kcq-battle-stage__background")?.hasAttribute("inert")).toBe(false);
        await Promise.resolve();
        expect(document.activeElement?.classList.contains("kcq-combat-header__settings")).toBe(true);
        expect(engine.getGameState()).toEqual(before);
        expect(engine.getActionView()).toEqual(actions);
        expect(execute).not.toHaveBeenCalled();
        expect(prepareBattle).toHaveBeenCalledTimes(1);
        expect(sessions[0]!.dispose).not.toHaveBeenCalled();
        expect(sessions[0]!.observer.lifecycleState).toBe("active");
        expect(capture).toHaveBeenCalledTimes(calls);
    });

    it("keeps panel clicks open, traps keyboard focus, and blocks background actions", () => {
        const { engine } = mountBattle();
        const before = engine.getGameState();
        const execute = vi.spyOn(engine, "executeAction");
        const dialog = openSettings();
        dialog.querySelector<HTMLElement>("label")!.click();
        expect(document.querySelector('[role="dialog"]')).toBe(dialog);
        button("Resume").focus();
        key("Tab", true);
        expect(document.activeElement).toBe(button("Back to Level Select"));
        key("Tab");
        expect(document.activeElement).toBe(button("Resume"));
        // DOM emulators allow programmatic clicks on inert content; also check the action guard.
        button("End Turn").click();
        button("Game Log").click();
        const character = document.querySelector<HTMLElement>(".kcq-party-card")!;
        expect(character).not.toBeNull();
        character.click();
        character.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
        expect(document.querySelector('[role="dialog"]')).toBe(dialog);
        expect(execute).not.toHaveBeenCalled();
        expect(engine.getGameState()).toEqual(before);
        button("Resume").click();
        button("End Turn").click();
        expect(execute).toHaveBeenCalledOnce();
    });

    it("changes presentation immediately without recreating or mutating the battle", () => {
        const alternate = new Presentation({ ...stockStrings,
            "ui.battleSettings.resume": "Continue test", "ui.battleOverview.endTurn": "End test turn" });
        const { engine, prepareBattle, sessions } = mountBattle([
            { id: "en", label: "English", presentation },
            { id: "test", label: "Test language", presentation: alternate },
        ]);
        const before = engine.getGameState();
        const execute = vi.spyOn(engine, "executeAction");
        const background = document.querySelector(".kcq-battle-stage__background");
        openSettings();
        const select = document.querySelector<HTMLSelectElement>(".kcq-battle-settings select")!;
        select.value = "test";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        expect(button("Continue test")).toBeDefined();
        expect(button("End test turn")).toBeDefined();
        expect(select.value).toBe("test");
        button("Continue test").click();
        expect(document.querySelector(".kcq-battle-stage__background")).toBe(background);
        openSettings();
        expect(document.querySelector<HTMLSelectElement>(".kcq-battle-settings select")?.value).toBe("test");
        expect(prepareBattle).toHaveBeenCalledOnce();
        expect(execute).not.toHaveBeenCalled();
        expect(engine.getGameState()).toEqual(before);
        expect(sessions[0]!.observer.lifecycleState).toBe("active");
    });

    it("retries through shared preparation with the same encounter and difficulty and a fresh session", () => {
        const { engine, sessions, prepareBattle, capture } = mountBattle();
        button("End Turn").click();
        openSettings();
        button("Retry Battle").click();
        expect(prepareBattle).toHaveBeenNthCalledWith(2, "plains_1", "mythic");
        expect(sessions[0]!.dispose).toHaveBeenCalledOnce();
        expect(sessions[0]!.observer.lifecycleState).toBe("quit");
        expect(capture.mock.calls.filter(call => call[0] === "battle_quit")).toHaveLength(1);
        const fresh = sessions[1]!.engine;
        expect(fresh).not.toBe(engine);
        expect(fresh.getSeed()).not.toBe(engine.getSeed());
        expect(fresh.getGameState().difficulty.id).toBe("mythic");
        expect(fresh.getGameState().turn).toMatchObject({ round: 1, outcome: "ongoing" });
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
    });

    it.each(["victory", "defeat"] as const)("preserves result-modal retry and leave handling after %s", outcome => {
        const { engine, sessions, prepareBattle, capture } = mountBattle();
        const getState = engine.getGameState.bind(engine);
        vi.spyOn(engine, "getGameState").mockImplementation(() => {
            const state = getState();
            state.turn.outcome = outcome;
            return state;
        });
        button("End Turn").click();
        expect(document.querySelector(".kcq-battle-result--" + outcome)).not.toBeNull();
        expect(sessions[0]!.observer.lifecycleState).toBe("finished");
        button("Retry").click();
        expect(prepareBattle).toHaveBeenNthCalledWith(2, "plains_1", "mythic");
        expect(sessions[0]!.dispose).toHaveBeenCalledOnce();
        const fresh = sessions[1]!.engine;
        const freshState = fresh.getGameState.bind(fresh);
        vi.spyOn(fresh, "getGameState").mockImplementation(() => {
            const state = freshState();
            state.turn.outcome = outcome;
            return state;
        });
        button("End Turn").click();
        button("Back to Level Select").click();
        expect(document.querySelector(".kcq-encounter-picker")).not.toBeNull();
        expect(sessions[1]!.dispose).toHaveBeenCalledOnce();
        expect(capture.mock.calls.filter(call => call[0] === "battle_quit")).toHaveLength(0);
    });

    it("leaves through shared lifecycle handling and returns to encounter selection", () => {
        const { sessions, prepareBattle, capture } = mountBattle();
        openSettings();
        button("Back to Level Select").click();
        expect(document.querySelector(".kcq-encounter-picker")).not.toBeNull();
        expect(document.querySelector(".kcq-battle-stage")).toBeNull();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(sessions[0]!.dispose).toHaveBeenCalledOnce();
        expect(sessions[0]!.observer.lifecycleState).toBe("quit");
        expect(capture.mock.calls.filter(call => call[0] === "battle_quit")).toHaveLength(1);
        expect(prepareBattle).toHaveBeenCalledOnce();
    });
});
