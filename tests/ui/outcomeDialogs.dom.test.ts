import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BattleResultPanel } from "../../src/ui/web/app/panels/BattleResultPanel";
import { BattleSettingsPanel } from "../../src/ui/web/app/panels/BattleSettingsPanel";
import { VictoryStoryPanel } from "../../src/ui/web/app/panels/VictoryStoryPanel";
import { Presentation } from "../../src/ui/presentation/presentation";
import type { BattleResultRow, BattleResultViewModel } from "../../src/ui/web/app/viewModels/battleResult";
import { stockStrings } from "../helpers/stockStrings";

const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let dispose: (() => void) | undefined;
const narrativeText = "First paragraph.\n\n  Authored indentation.\n".repeat(150) + "Final narrative line.";
const rows: BattleResultRow[] = ["escapes", "peakBinding", "hits", "bindings", "incapacitations", "rescues"].map((id, i) => ({
    id: id as BattleResultRow["id"], label: "Localized " + id, value: String(i),
    ...(i % 2 ? { detail: "Long localized detail and move name. ".repeat(12) } : {}),
}));
const model = (outcome: "victory" | "defeat" = "victory"): BattleResultViewModel => ({
    outcome, heading: outcome === "victory" ? "Victory" : "Defeat", encounter: "Encounter", difficulty: "Standard",
    summary: "12 Rounds \u00b7 34 Actions", progress: outcome === "defeat" ? "27% Boss HP Remaining" : undefined,
    rows, retryLabel: "Retry", backLabel: "Back to Level Select", gameLogLabel: "View Game Log", nextLevelLabel: "Next Level", backToTitleLabel: "Back to Title Screen",
});
const element = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const style = (selector: string) => getComputedStyle(element(selector));
const press = (target: HTMLElement, key: string, shiftKey = false) => {
    const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(event); return event;
};
beforeEach(() => {
    viewport.setViewport({ width: 1920, height: 1080 });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
        return this.matches(".kcq-battle-result__overlay") ? window.innerWidth : 0;
    });
    const css = document.createElement("style");
    css.textContent = readFileSync("src/ui/web/app/tokens.css", "utf8") + readFileSync("src/ui/web/app/app.css", "utf8");
    document.body.append(css);
});
afterEach(() => {
    dispose?.(); dispose = undefined; document.body.replaceChildren();
    viewport.setViewport(initialViewport); delete document.documentElement.dataset.kcqTheme; vi.restoreAllMocks();
});
function mount(kind: "results" | "story", result = model(), log = true, next = true, focusGameLog = false) {
    const host = document.createElement("div"); document.body.append(host);
    const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
    const onRetry = vi.fn(), onBackToLevelSelect = vi.fn(), onBackToTitle = vi.fn(), onGameLog = vi.fn(), onNextLevel = vi.fn(), onContinue = vi.fn();
    dispose = render(() => kind === "story" ? createComponent(VictoryStoryPanel, {
        model: { outcome: result.outcome, heading: result.heading, encounter: result.encounter, narrative: narrativeText, continueLabel: "Continue" }, onContinue,
    }) : createComponent(BattleResultPanel, {
        model: { ...result, nextEncounter: next ? "plains_2" : undefined }, onRetry, onBackToLevelSelect, onBackToTitle, focusGameLog,
        onGameLog: log ? onGameLog : undefined, onNextLevel,
    }), host);
    return { trigger, onRetry, onBackToLevelSelect, onBackToTitle, onGameLog, onNextLevel, onContinue };
}

describe("outcome dialog presentation", () => {
    it.each(["results", "story"] as const)("switches %s with zoom-aware available space and retains the same DOM", kind => {
        mount(kind);
        const dialog = element('[role="dialog"]');
        const desktopWidth = parseFloat(style(".kcq-battle-result__viewport").width);
        expect(desktopWidth).toBeGreaterThan(366);
        expect(style(".kcq-battle-result").width).toBe("100%");
        expect(style(".kcq-battle-result__viewport").maxWidth).toBe("100%");
        expect(style(".kcq-battle-result__actions").gridTemplateColumns).toBe(kind === "results" ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))");
        for (const [width, height, desktop] of [[1024, 768, true], [1920, 480, true], [600, 800, false], [390, 844, false]] as const) {
            viewport.setViewport({ width, height }); window.dispatchEvent(new Event("resize"));
            expect(element('[role="dialog"]')).toBe(dialog);
            expect(element(".kcq-outcome__overlay").dataset.kcqTitleLayout).toBe(desktop ? "desktop" : "mobile");
            expect(parseFloat(style(".kcq-battle-result__viewport").width)).toBe(desktop ? desktopWidth : 366);
        }
    });

    it.each([[390, 844], [600, 800]])("preserves stacked mobile actions at %s by %s", (width, height) => {
        viewport.setViewport({ width, height });
        mount("results");
        expect(style(".kcq-battle-result__viewport").width).toBe("366px");
        expect(style(".kcq-battle-result__actions").gridTemplateColumns).toBe("minmax(0, 1fr)");
        expect(style(".kcq-battle-result__stats").display).toBe("block");
    });

    it.each(["results", "story"] as const)("keeps %s compact at a short desktop height", kind => {
        viewport.setViewport({ width: 1920, height: 480 });
        mount(kind);
        expect(style(".kcq-battle-result").gap).toBe("6px");
        expect(style("footer button").minHeight).toBe(kind === "results" ? "42px" : "36px");
        expect(style("header").flexShrink).toBe("0");
        expect(style("footer").flexShrink).toBe("0");
        expect(style(kind === "story" ? ".kcq-victory-story__narrative" : ".kcq-battle-result__stats").overflowY).toBe("auto");
        expect(element(".kcq-outcome__overlay").style.getPropertyValue("--kcq-ui-height")).toBe("304px");
    });

    it("preserves the mobile story typography and height cap", () => {
        viewport.setViewport({ width: 390, height: 844 });
        mount("story");
        expect(style(".kcq-victory-story__narrative").fontSize).toBe("14px");
        expect(style(".kcq-victory-story__narrative").lineHeight).toBe("1.7");
        expect(style(".kcq-victory-story").maxHeight).toBe("min(100%, 600px)");
    });

    it("returns focus to View Game Log when reopening the result", () => {
        mount("results", model(), true, true, true);
        expect(document.activeElement).toBe(element(".kcq-battle-result__log"));
    });

    it.each(["dark", "light"])("uses semantic outcome colors for results and stories in %s", theme => {
        document.documentElement.dataset.kcqTheme = theme;
        for (const kind of ["results", "story"] as const) for (const outcome of ["victory", "defeat"] as const) {
            mount(kind, model(outcome));
            const dialog = element('[role="dialog"]');
            expect(dialog.classList.contains("kcq-battle-result--" + outcome)).toBe(true);
            const probe = document.createElement("span");
            probe.style.color = "var(--kcq-state-" + (outcome === "victory" ? "success" : "danger") + ")"; dialog.append(probe);
            expect(style("h1").color).toBe(getComputedStyle(probe).color);
            expect(dialog.getAttribute("aria-labelledby")).toBe(element("h1").id);
            expect(dialog.getAttribute("aria-modal")).toBe("true");
            dispose?.();
        }
    });

    it("renders fixed headline cards and each supplied secondary summary", () => {
        mount("results", model("defeat"));
        const cards = [...document.querySelectorAll(".kcq-battle-result__stat")];
        expect(cards.map(card => card.getAttribute("data-stat-id"))).toEqual(["bindings", "hits", "escapes"]);
        for (const card of cards) {
            const row = rows.find(row => row.id === card.getAttribute("data-stat-id"))!;
            expect(card.querySelector("dt")?.textContent).toBe(row.label);
            expect(card.querySelector("dd")?.textContent).toBe(row.value);
            expect(card.textContent).not.toContain("Long localized detail");
        }
        const details = [...document.querySelectorAll(".kcq-battle-result__detail-row")];
        for (const row of rows) {
            const headline = ["bindings", "hits", "escapes"].includes(row.id);
            const detail = details.find(detail => detail.querySelector(".kcq-battle-result__detail-label")?.textContent === row.label);
            if (headline && !row.detail) expect(detail).toBeUndefined();
            else {
                expect(detail?.querySelector(".kcq-battle-result__detail-label")?.textContent).toBe(row.label);
                expect(detail?.querySelector(".kcq-battle-result__detail-value")?.textContent).toBe(row.detail ?? row.value);
            }
        }
        expect(element(".kcq-battle-result__progress").textContent).toBe("27% Boss HP Remaining");
        expect(style(".kcq-battle-result__headlines").gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
        expect(style(".kcq-battle-result__detail-value").overflowWrap).toBe("anywhere");
        expect(style(".kcq-battle-result__stats").overflowY).toBe("auto");
    });

    it.each(["victory", "defeat"] as const)("keeps action hierarchy, callbacks and focus containment on %s", outcome => {
        const actions = mount("results", model(outcome));
        const buttons = [...element("footer").querySelectorAll("button")];
        expect(buttons.map(button => button.textContent)).toEqual([outcome === "victory" ? "Next Level" : "Retry", "View Game Log", "Back to Level Select", "Back to Title Screen"]);
        expect(document.activeElement).toBe(buttons[0]);
        expect(getComputedStyle(buttons[0]!).gridColumn).toBe("1 / -1");
        buttons.forEach(button => button.click());
        expect(actions.onRetry).toHaveBeenCalledTimes(outcome === "defeat" ? 1 : 0);
        expect(actions.onNextLevel).toHaveBeenCalledTimes(outcome === "victory" ? 1 : 0);
        expect(actions.onBackToLevelSelect).toHaveBeenCalledOnce();
        expect(actions.onBackToTitle).toHaveBeenCalledOnce(); expect(actions.onGameLog).toHaveBeenCalledOnce();
        const final = buttons[buttons.length - 1]!;
        expect(press(final, "Tab").defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(element(".kcq-battle-result__stats"));
        expect(press(element(".kcq-battle-result__stats"), "Tab", true).defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(final);
    });

    it.each([true, false])("omits unavailable Next Level without substituting Retry (log=%s)", log => {
        mount("results", model(), log, false);
        expect(document.querySelector(".kcq-battle-result__primary")).toBeNull();
        expect(document.querySelector(".kcq-battle-result__retry")).toBeNull();
        expect(document.activeElement).toBe(element(log ? ".kcq-battle-result__log" : ".kcq-battle-result__stats"));
    });

    it.each(["victory", "defeat"] as const)("keeps every headline detail out of its card on %s", outcome => {
        const headlineRows: BattleResultRow[] = ["bindings", "hits", "escapes"].map((id, index) => ({
            id: id as BattleResultRow["id"], label: "Same localized label", value: String(index + 10), detail: "Detail " + id,
        }));
        mount("results", { ...model(outcome), rows: [...headlineRows].reverse() });
        expect([...document.querySelectorAll(".kcq-battle-result__stat dd")].map(node => node.textContent)).toEqual(["10", "11", "12"]);
        expect(element(".kcq-battle-result__headlines").textContent).not.toContain("Detail");
        expect([...document.querySelectorAll(".kcq-battle-result__detail-value")].map(node => node.textContent)).toEqual(["Detail escapes", "Detail hits", "Detail bindings"]);
    });

    it("renders future non-headline rows as ordinary details", () => {
        const future = { id: "futureStatistic" as BattleResultRow["id"], label: "Future statistic", value: "-", detail: "Additional context" };
        mount("results", { ...model(), rows: [...rows, future] });
        expect(document.querySelectorAll(".kcq-battle-result__stat")).toHaveLength(3);
        const detail = [...document.querySelectorAll(".kcq-battle-result__detail-row")]
            .find(row => row.querySelector(".kcq-battle-result__detail-label")?.textContent === future.label)!;
        expect(detail.querySelector(".kcq-battle-result__detail-value")?.textContent).toBe(future.detail);
    });

    it("omits an empty detail stack and keeps three zero headline cards", () => {
        mount("results", { ...model(), rows: rows.filter(row => ["bindings", "hits", "escapes"].includes(row.id)).map(row => ({ ...row, value: "0", detail: undefined })) });
        expect(document.querySelector(".kcq-battle-result__details")).toBeNull();
        expect([...document.querySelectorAll(".kcq-battle-result__stat dd")].map(node => node.textContent)).toEqual(["0", "0", "0"]);
        expect(style(".kcq-battle-result").height).not.toBe("100%");
        expect(style(".kcq-battle-result__stats").flexGrow).not.toBe("1");
    });

    it.each(["results", "story"] as const)("keeps %s reading regions keyboard accessible, headers/actions fixed and restores focus", kind => {
        const { trigger, onContinue } = mount(kind);
        const reading = element(kind === "story" ? ".kcq-victory-story__narrative" : ".kcq-battle-result__stats");
        expect(reading.tabIndex).toBe(0);
        expect(getComputedStyle(reading).minHeight).toBe("0");
        expect(getComputedStyle(reading).overflowY).toBe("auto");
        expect(style("header").flexShrink).toBe("0"); expect(style("footer").flexShrink).toBe("0");
        expect(style(".kcq-battle-result").maxHeight).toBe("100%");
        reading.focus();
        for (const key of ["ArrowDown", "PageDown", "Home", "End"]) expect(press(reading, key).defaultPrevented).toBe(false);
        expect(press(reading, "Escape").defaultPrevented).toBe(true);
        if (kind === "story") {
            expect(reading.textContent).toBe(narrativeText);
            expect(getComputedStyle(reading).whiteSpace).toBe("pre-wrap");
            expect(getComputedStyle(reading).maxWidth).toBe("76ch");
            expect(getComputedStyle(reading).fontSize).toBe("13px");
            const proceed = element("footer button"); proceed.focus();
            expect(press(proceed, "Tab").defaultPrevented).toBe(true); expect(document.activeElement).toBe(reading);
            expect(press(reading, "Tab", true).defaultPrevented).toBe(true); expect(document.activeElement).toBe(proceed);
            proceed.click(); expect(onContinue).toHaveBeenCalledOnce();
        }
        dispose?.(); dispose = undefined; expect(document.activeElement).toBe(trigger);
    });

    it("leaves the Settings frame and scroll behavior unchanged", () => {
        const host = document.createElement("div"); document.body.append(host);
        dispose = render(() => createComponent(BattleSettingsPanel, { presentation: new Presentation(stockStrings), release: "test", onResume: vi.fn() }), host);
        expect(document.querySelector(".kcq-outcome__overlay")).toBeNull();
        expect(style(".kcq-battle-result__viewport").width).toBe("400px");
        expect(style(".kcq-battle-settings").maxWidth).toBe("380px");
        expect(style(".kcq-battle-settings").overflowY).toBe("auto");
    });
});
