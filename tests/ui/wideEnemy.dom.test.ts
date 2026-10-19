import type { Window as HappyWindow } from "happy-dom";
import { readFileSync } from "node:fs";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { enemyDetailsFixture as fixture } from "../../src/ui/web/app/fixtures/enemyDetails";
import { AUTO_MEDIUM_BREAKPOINT, AUTO_WIDE_BREAKPOINT } from "../../src/ui/web/app/responsiveScale";

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
        playbackSpeed: { value: "instant", onChange: () => { } },
    }), host);
    // Seed Happy DOM's media-query change tracking at the mounted width.
    window.dispatchEvent(new Event("resize"));
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

const gameLog = () => document.querySelector<HTMLElement>('[role="log"]') ?? element(".kcq-battle-section--game-log");

describe.each([1024, AUTO_WIDE_BREAKPOINT - 1, 1920])("non-narrow enemy details at %ipx", width => {
    beforeEach(() => viewport.setViewport({ width }));
    it("replaces only the enemy column and restores the list with the identity back button", () => {
        const { execute } = mountBattle();
        const overview = element(".kcq-battle-overview-wide, .kcq-battle-overview-medium");
        const party = element(".kcq-battle-section--party");
        const log = gameLog();
        const header = element(".kcq-combat-header");
        const partyBody = party.closest(".kcq-screen-layout__body")!;
        partyBody.scrollTop = 25;
        log.scrollTop = 43;
        element(".kcq-enemy-card").click();

        const details = element(".kcq-enemy-details");
        if (width >= AUTO_WIDE_BREAKPOINT) expect(overview.children[2]).toBe(details);
        else {
            expect(overview.children[1]!.contains(details)).toBe(true);
            expect(overview.children).toHaveLength(2);
            expect(header.querySelector(".kcq-combat-header__back")).toBeNull();
            expect(element(".kcq-combat-header__title").textContent).toBe(fixture.presentation.encounter(fixture.state.encounter!.id));
        }
        expect(document.querySelectorAll(".kcq-enemy-details")).toHaveLength(1);
        expect(document.querySelector(".kcq-enemy-card")).toBeNull();
        expect(document.querySelector(".kcq-focused-character__avatar")).toBeNull();
        expect(document.querySelectorAll(".kcq-combat-header")).toHaveLength(1);
        expect(element(".kcq-combat-header")).toBe(header);
        expect(element(".kcq-battle-section--party")).toBe(party);
        expect(gameLog()).toBe(log);
        expect(partyBody.scrollTop).toBe(25);
        expect(log.scrollTop).toBe(43);
        expect(getComputedStyle(details).width).toBe("100%");
        expect(getComputedStyle(details).height).toBe(width >= AUTO_WIDE_BREAKPOINT ? "100%" : "auto");
        expect(getComputedStyle(details).gridTemplateRows).toBe("auto minmax(0, 1fr)");
        const heading = element(".kcq-enemy-details > .kcq-screen-layout__header .kcq-battle-section__heading");
        expect(heading.textContent).toBe("Enemy / Skunkette 1");
        expect(heading.querySelector("button, a")).toBeNull();
        expect(getComputedStyle(heading).height).toBe(getComputedStyle(element(".kcq-battle-section--party .kcq-battle-section__heading")).height);
        expect(getComputedStyle(heading.querySelector("h2")!).textTransform).toBe("uppercase");
        const logHeading = element(".kcq-battle-section--game-log .kcq-battle-section__heading");
        expect(logHeading.textContent).toBe(width >= AUTO_WIDE_BREAKPOINT ? "Game Log" : "- Game Log");
        expect(!!logHeading.querySelector(".kcq-game-log-heading-action")).toBe(width < AUTO_WIDE_BREAKPOINT);
        logHeading.click();
        expect(document.querySelector(".kcq-game-log")).toBeNull();
        expect(element(".kcq-enemy-details__identity").textContent).toContain("Skunkette 1");
        expect(element(".kcq-enemy-details__identity").textContent).toContain("152 / 200");
        expect(element("#enemy-status-heading").textContent).toBe("Modifiers");
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
        expect(element(".kcq-battle-overview-wide, .kcq-battle-overview-medium")).toBe(overview);
        expect(element(".kcq-battle-section--party")).toBe(party);
        expect(gameLog()).toBe(log);
        expect(log.scrollTop).toBe(43);
        expect(execute).not.toHaveBeenCalled();
    });

    it.each([
        390, AUTO_MEDIUM_BREAKPOINT - 1, AUTO_MEDIUM_BREAKPOINT, AUTO_MEDIUM_BREAKPOINT + 1,
        AUTO_WIDE_BREAKPOINT - 1, AUTO_WIDE_BREAKPOINT, AUTO_WIDE_BREAKPOINT + 1, 1920,
    ])(
        "embeds details in medium and wide layouts at %ipx", width => {
            viewport.setViewport({ width });
            mountBattle();
            element('.kcq-enemy-card[data-kcq-shortcut="5"]').click();
            const wide = width >= AUTO_WIDE_BREAKPOINT;
            const nonNarrow = width >= AUTO_MEDIUM_BREAKPOINT;
            const details = element(".kcq-enemy-details");
            expect(details.getAttribute("aria-label")).toBe("Skunkette 2");
            expect(!!details.closest(".kcq-battle-overview-wide")).toBe(wide);
            expect(!!document.querySelector(".kcq-battle-section--party")).toBe(nonNarrow);
            expect(!!document.querySelector('[role="log"]')).toBe(wide);
            expect(!!details.querySelector(".kcq-enemy-details__back")).toBe(nonNarrow);
            expect(!!details.querySelector(".kcq-focused-character__avatar")).toBe(!nonNarrow);
            expect(!!details.querySelector(".kcq-combat-header__back")).toBe(!nonNarrow);
            expect(!!details.querySelector(".kcq-battle-section__heading")).toBe(nonNarrow);
            if (nonNarrow) expect(details.querySelector(".kcq-battle-section__heading h2")?.textContent).toBe("Enemy / Skunkette 2");
            expect(document.querySelectorAll(".kcq-combat-header")).toHaveLength(1);
            element(nonNarrow ? ".kcq-enemy-details__back" : ".kcq-combat-header__back").click();
            expect(document.querySelector(".kcq-enemy-details")).toBeNull();
            expect(document.querySelectorAll(".kcq-enemy-card")).toHaveLength(battleOverviewFixture.state.enemies.length);
        },
    );

    it("keeps the selected enemy across responsive changes without duplicate content or shortcuts", () => {
        mountBattle();
        press("5");
        for (const width of [AUTO_WIDE_BREAKPOINT - 1, AUTO_MEDIUM_BREAKPOINT, 390, AUTO_WIDE_BREAKPOINT, 1920]) {
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
        const body = width >= AUTO_WIDE_BREAKPOINT
            ? element(".kcq-enemy-details .kcq-screen-layout__body")
            : details.closest(".kcq-battle-overview > .kcq-screen-layout__body") as HTMLElement;
        body.scrollTop = 42;
        if (width < AUTO_WIDE_BREAKPOINT) element(".kcq-game-log-heading-action").click();
        else press("-");
        expect(!!document.querySelector(".kcq-game-log")).toBe(width < AUTO_WIDE_BREAKPOINT);
        if (width < AUTO_WIDE_BREAKPOINT) expect(press("1").defaultPrevented).toBe(false);
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
        expect(document.querySelector(".kcq-character-details-expanded")).not.toBeNull();
        press("Escape");
        press("4");
        press(" ");
        expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "endTurn" });
    });
});
