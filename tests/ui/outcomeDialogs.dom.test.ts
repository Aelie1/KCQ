import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BattleResultPanel } from "../../src/ui/web/app/panels/BattleResultPanel";
import { BattleSettingsPanel } from "../../src/ui/web/app/panels/BattleSettingsPanel";
import { VictoryStoryPanel } from "../../src/ui/web/app/panels/VictoryStoryPanel";
import { Presentation } from "../../src/ui/presentation/presentation";
import type { BattleResultViewModel } from "../../src/ui/web/app/viewModels/battleResult";
import { stockStrings } from "../helpers/stockStrings";

const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let dispose: (() => void) | undefined;
const narrativeText = "First paragraph.\n\n  Authored indentation.\n".repeat(150) + "Final narrative line.";
const rows = Array.from({ length: 17 }, (_, i) => ({
    label: "Statistic " + i, value: i === 0 ? "-" : String(i),
    ...(i % 2 ? { detail: "Long localized detail and move name. ".repeat(12) } : {}),
}));
const model = (outcome: "victory" | "defeat" = "victory"): BattleResultViewModel => ({
    outcome, heading: outcome === "victory" ? "Victory" : "Defeat", encounter: "Encounter", difficulty: "Standard",
    summary: "12 Rounds \u00b7 34 Actions", progress: outcome === "defeat" ? "27% Boss HP Remaining" : undefined,
    rows, retryLabel: "Retry", backLabel: "Back to Level Select", gameLogLabel: "View Game Log", nextLevelLabel: "Next Level",
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
    const onRetry = vi.fn(), onBackToLevelSelect = vi.fn(), onGameLog = vi.fn(), onNextLevel = vi.fn(), onContinue = vi.fn();
    dispose = render(() => kind === "story" ? createComponent(VictoryStoryPanel, {
        model: { outcome: result.outcome, heading: result.heading, encounter: result.encounter, narrative: narrativeText, continueLabel: "Continue" }, onContinue,
    }) : createComponent(BattleResultPanel, {
        model: { ...result, nextEncounter: next ? "plains_2" : undefined }, onRetry, onBackToLevelSelect, focusGameLog,
        onGameLog: log ? onGameLog : undefined, onNextLevel,
    }), host);
    return { trigger, onRetry, onBackToLevelSelect, onGameLog, onNextLevel, onContinue };
}

describe("outcome dialog presentation", () => {
    it.each(["results", "story"] as const)("switches %s with zoom-aware available space and retains the same DOM", kind => {
        mount(kind);
        const dialog = element('[role="dialog"]');
        expect(style(".kcq-battle-result__viewport").width).toBe("600px");
        expect(style(".kcq-battle-result").maxWidth).toBe("580px");
        expect(style(".kcq-battle-result__actions").gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
        for (const [width, height, desktop] of [[1024, 768, true], [1920, 480, true], [779, 800, false], [780, 800, true], [390, 844, false]] as const) {
            viewport.setViewport({ width, height }); window.dispatchEvent(new Event("resize"));
            expect(element('[role="dialog"]')).toBe(dialog);
            expect(element(".kcq-outcome__overlay").dataset.kcqTitleLayout).toBe(desktop ? "desktop" : "mobile");
            expect(style(".kcq-battle-result__viewport").width).toBe(desktop ? "600px" : "366px");

        }
    });

    it.each([[390, 844], [779, 800]])("preserves stacked mobile actions at %s by %s", (width, height) => {
        viewport.setViewport({ width, height });
        mount("results");
        expect(style(".kcq-battle-result__viewport").width).toBe("366px");
        expect(style(".kcq-battle-result__actions").gridTemplateColumns).toBe("");
        expect(style(".kcq-battle-result__stats").display).toBe("block");
    });

    it.each(["results", "story"] as const)("keeps %s compact at a short desktop height", kind => {
        viewport.setViewport({ width: 1920, height: 480 });
        mount(kind);
        expect(style(".kcq-battle-result").gap).toBe("6px");
        expect(style("footer button").minHeight).toBe("36px");
        expect(style("header").flexShrink).toBe("0");
        expect(style("footer").flexShrink).toBe("0");
        expect(style(kind === "story" ? ".kcq-victory-story__narrative" : "dl").overflowY).toBe("auto");
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

    it("renders every supplied statistic, value and optional detail in order", () => {
        mount("results", model("defeat"));
        expect([...document.querySelectorAll("dt")].map(node => node.textContent)).toEqual(rows.map(row => row.label));
        expect([...document.querySelectorAll("dd strong")].map(node => node.textContent)).toEqual(rows.map(row => row.value));
        expect([...document.querySelectorAll("dd span")].map(node => node.textContent)).toEqual(rows.flatMap(row => row.detail ? [row.detail] : []));
        expect(element(".kcq-battle-result__progress").textContent).toBe("27% Boss HP Remaining");
        expect(style(".kcq-battle-result__stats").gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
        expect(style(".kcq-battle-result__row dd").overflowWrap).toBe("anywhere");
        expect(style(".kcq-battle-result__stats").overflowY).toBe("auto");
    });

    it.each([[true, true, 4], [true, false, 3], [false, true, 3], [false, false, 2]] as const)("keeps action order and behavior with log=%s next=%s", (log, next, count) => {
        const actions = mount("results", model(), log, next);
        const buttons = [...element("footer").querySelectorAll("button")];
        expect(buttons.map(button => button.textContent)).toEqual([...(log ? ["View Game Log"] : []), ...(next ? ["Next Level"] : []), "Retry", "Back to Level Select"]);
        expect(buttons).toHaveLength(count);
        expect(getComputedStyle(buttons[count - 1]!).gridColumn).toBe(count % 2 ? "1 / -1" : "auto");
        buttons.forEach(button => button.click());
        expect(actions.onRetry).toHaveBeenCalledOnce(); expect(actions.onBackToLevelSelect).toHaveBeenCalledOnce();
        expect(actions.onGameLog).toHaveBeenCalledTimes(log ? 1 : 0); expect(actions.onNextLevel).toHaveBeenCalledTimes(next ? 1 : 0);
        expect(document.activeElement).toBe(element(next ? ".kcq-battle-result__next" : ".kcq-battle-result__retry"));
        expect(press(buttons[count - 1]!, "Tab").defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(element("dl"));
        expect(press(element("dl"), "Tab", true).defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(buttons[count - 1]);
    });

    it.each(["results", "story"] as const)("keeps %s reading regions keyboard accessible, headers/actions fixed and restores focus", kind => {
        const { trigger, onContinue } = mount(kind);
        const reading = element(kind === "story" ? ".kcq-victory-story__narrative" : "dl");
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
