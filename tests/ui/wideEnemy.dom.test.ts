import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import { BattleApp, WIDE_BATTLE_OVERVIEW_BREAKPOINT } from "../../src/ui/web/app/BattleApp";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { enemyDetailsFixture as fixture } from "../../src/ui/web/app/fixtures/enemyDetails";

const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let unmount: (() => void) | undefined;
beforeEach(() => {
    viewport.setViewport({ width: 1920, height: 1080 });
    window.localStorage.clear();
});
afterEach(() => {
    unmount?.(); unmount = undefined;
    document.body.replaceChildren();
    viewport.setViewport(initialViewport);
    window.localStorage.clear();
    vi.restoreAllMocks();
});
function mountBattle() {
    const engine = createStockEngine(12345);
    vi.spyOn(engine, "getGameState").mockReturnValue({ ...fixture.state, enemies: [fixture.state.enemies[0]!, ...battleOverviewFixture.state.enemies.slice(1)], turn: { ...fixture.state.turn, phase: "player" } });
    vi.spyOn(engine, "getActionView").mockReturnValue(fixture.actions);
    const execute = vi.spyOn(engine, "executeAction").mockReturnValue({ success: false, reason: "wrongPhase" });
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
    const host = document.createElement("div");
    document.body.append(style, host);
    unmount = render(() => createComponent(BattleApp, {
        engine, presentation: fixture.presentation,
        playbackSpeed: { value: "instant", onChange: () => {} },
    }), host);
    return { execute };
}
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const found = document.querySelector<T>(selector);
    if (!found) throw new Error("Missing element: " + selector);
    return found;
}
function press(key: string, target: EventTarget = document): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    return event;
}

describe("wide enemy details", () => {
    it("replaces only the enemy column and restores the list with the identity back button", () => {
        const { execute } = mountBattle();
        const overview = element(".kcq-battle-overview-wide");
        const party = element(".kcq-battle-section--party");
        const log = element('[role="log"]');
        const header = element(".kcq-combat-header");
        const partyBody = party.closest(".kcq-screen-layout__body")!;
        partyBody.scrollTop = 25;
        log.scrollTop = 43;
        element(".kcq-enemy-card").click();

        const details = element(".kcq-enemy-details");
        expect(overview.children[2]).toBe(details);
        expect(document.querySelectorAll(".kcq-enemy-details")).toHaveLength(1);
        expect(document.querySelector(".kcq-enemy-card")).toBeNull();
        expect(document.querySelector(".kcq-focused-character__avatar")).toBeNull();
        expect(document.querySelectorAll(".kcq-combat-header")).toHaveLength(1);
        expect(element(".kcq-combat-header")).toBe(header);
        expect(element(".kcq-battle-section--party")).toBe(party);
        expect(element('[role="log"]')).toBe(log);
        expect(partyBody.scrollTop).toBe(25);
        expect(log.scrollTop).toBe(43);
        expect(getComputedStyle(details).width).toBe("100%");
        expect(getComputedStyle(details).height).toBe("100%");
        expect(getComputedStyle(details).gridTemplateRows).toBe("auto minmax(0, 1fr)");
        const heading = element(".kcq-enemy-details > .kcq-screen-layout__header .kcq-battle-section__heading");
        expect(heading.textContent).toBe("Enemy / Skunkette 1");
        expect(heading.querySelector("button, a")).toBeNull();
        expect(getComputedStyle(heading).height).toBe(getComputedStyle(element(".kcq-battle-section--party .kcq-battle-section__heading")).height);
        expect(getComputedStyle(heading.querySelector("h2")!).textTransform).toBe("uppercase");
        const logHeading = element(".kcq-battle-section--game-log .kcq-battle-section__heading");
        expect(logHeading.textContent).toBe("Game Log");
        expect(logHeading.querySelector("button, a, [data-kcq-shortcut]")).toBeNull();
        logHeading.click();
        expect(document.querySelector(".kcq-game-log")).toBeNull();
        expect(element(".kcq-enemy-details__identity").textContent).toContain("Skunkette 1");
        expect(element(".kcq-enemy-details__identity").textContent).toContain("152 / 200");
        expect(element("#enemy-status-heading").textContent).toBe("Status & Modifiers");
        expect(element(".kcq-character-capabilities__list").textContent).toContain("-2");
        expect(element(".kcq-character-effects").textContent).toContain("Pounce");
        expect([...document.querySelectorAll(".kcq-enemy-details__intention")].map(node => node.getAttribute("aria-label")))
            .toEqual(["Latex Spray", "Pounce"]);
        const back = element<HTMLButtonElement>(".kcq-enemy-details__identity button");
        expect(back.getAttribute("aria-label")).toBe("Go Back");
        expect(back.textContent).toContain("\u2190");
        expect(back.querySelector(".kcq-shortcut")?.textContent).toBe("Esc");
        expect(getComputedStyle(back).width).toBe("30px");
        back.click();

        expect(document.querySelector(".kcq-enemy-details")).toBeNull();
        expect(document.querySelectorAll(".kcq-enemy-card")).toHaveLength(battleOverviewFixture.state.enemies.length);
        expect(element(".kcq-battle-overview-wide")).toBe(overview);
        expect(element(".kcq-battle-section--party")).toBe(party);
        expect(element('[role="log"]')).toBe(log);
        expect(log.scrollTop).toBe(43);
        expect(execute).not.toHaveBeenCalled();
    });

    it.each([390, 1199, 1200, WIDE_BATTLE_OVERVIEW_BREAKPOINT - 1, WIDE_BATTLE_OVERVIEW_BREAKPOINT, 1920])(
        "embeds details only in the wide three-column layout at %ipx", width => {
            viewport.setViewport({ width });
            mountBattle();
            element('.kcq-enemy-card[data-kcq-shortcut="5"]').click();
            const wide = width >= WIDE_BATTLE_OVERVIEW_BREAKPOINT;
            const details = element(".kcq-enemy-details");
            expect(details.getAttribute("aria-label")).toBe("Skunkette 2");
            expect(!!details.closest(".kcq-battle-overview-wide")).toBe(wide);
            expect(!!document.querySelector(".kcq-battle-section--party")).toBe(wide);
            expect(!!document.querySelector('[role="log"]')).toBe(wide);
            expect(!!details.querySelector(".kcq-enemy-details__back")).toBe(wide);
            expect(!!details.querySelector(".kcq-focused-character__avatar")).toBe(!wide);
            expect(!!details.querySelector(".kcq-combat-header__back")).toBe(!wide);
            expect(!!details.querySelector(".kcq-battle-section__heading")).toBe(wide);
            if (wide) expect(details.querySelector(".kcq-battle-section__heading h2")?.textContent).toBe("Enemy / Skunkette 2");
            expect(document.querySelectorAll(".kcq-combat-header")).toHaveLength(1);
            element(wide ? ".kcq-enemy-details__back" : ".kcq-combat-header__back").click();
            expect(document.querySelector(".kcq-enemy-details")).toBeNull();
            expect(document.querySelectorAll(".kcq-enemy-card")).toHaveLength(battleOverviewFixture.state.enemies.length);
        },
    );

    it("keeps the selected enemy across responsive changes without duplicate content or shortcuts", () => {
        mountBattle();
        press("5");
        for (const width of [1799, 1200, 390, 1800, 1920]) {
            viewport.setViewport({ width });
            expect(document.querySelectorAll(".kcq-enemy-details")).toHaveLength(1);
            expect(element(".kcq-enemy-details").getAttribute("aria-label")).toBe("Skunkette 2");
            expect(document.querySelectorAll(".kcq-combat-header")).toHaveLength(1);
            expect(document.querySelectorAll('[data-kcq-shortcut="escape"]')).toHaveLength(1);
            expect(document.querySelectorAll("#enemy-intentions-heading")).toHaveLength(1);
        }
        expect(press("Escape").defaultPrevented).toBe(true);
        expect(document.querySelector(".kcq-enemy-details")).toBeNull();
        expect(document.querySelector(".kcq-battle-overview-wide")).not.toBeNull();
    });

    it("preserves keyboard navigation and the details scroll position through full history", () => {
        const { execute } = mountBattle();
        expect(press("5").defaultPrevented).toBe(true);
        const details = element(".kcq-enemy-details");
        const body = element(".kcq-enemy-details .kcq-screen-layout__body");
        body.scrollTop = 42;
        press("-");
        expect(document.querySelector(".kcq-game-log")).not.toBeNull();
        expect(press("1").defaultPrevented).toBe(false);
        press("Escape");
        expect(element(".kcq-enemy-details")).toBe(details);
        expect(body.scrollTop).toBe(42);
        press("Escape");
        const card = element('.kcq-enemy-card[data-kcq-shortcut="4"]');
        card.focus();
        press("Enter", card);
        expect(element(".kcq-enemy-details").getAttribute("aria-label")).toBe("Skunkette 1");
        press("1");
        expect(document.querySelector(".kcq-enemy-details")).toBeNull();
        expect(document.querySelector(".kcq-character-details-wide")).not.toBeNull();
        press("Escape");
        press("4");
        press(" ");
        expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "endTurn" });
    });
});
