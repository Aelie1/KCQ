import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameLogPresentationEntry } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { CompactGameLog } from "../../src/ui/web/app/components/CompactGameLog";
import { createOverviewGameLogPreference } from "../../src/ui/web/app/overviewGameLogLines";
import { BattleSettingsPanel } from "../../src/ui/web/app/panels/BattleSettingsPanel";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation({ ...stockStrings, "move.telekinesis.narrative.action": "{actor} uses {move}." });
let unmount: (() => void) | undefined;
beforeEach(() => window.localStorage.clear());
afterEach(() => {
    unmount?.(); unmount = undefined;
    document.body.replaceChildren();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const action = (actor = "ko"): GameLogPresentationEntry => ({ kind: "move", targetIds: [], actor, move: "telekinesis", outcomes: [] });
function mountPreview(initial = [action()], scrollable = false) {
    const host = document.createElement("div"); document.body.append(host);
    const [entries, setEntries] = createSignal<readonly GameLogPresentationEntry[]>(initial);
    const [lines, setLines] = createSignal(3);
    const [language, setLanguage] = createSignal(presentation);
    const onOpen = vi.fn();
    unmount = render(() => createComponent(CompactGameLog, {
        get entries() { return entries(); }, get lines() { return lines(); }, get presentation() { return language(); },
        party: ["ko", "matsuko", "hinari"], onOpen, scrollable,
    }), host);
    return { host, setEntries, setLines, setLanguage, onOpen };
}

describe("Overview Game Log preference", () => {
    it("defaults to three lines, persists every discrete value and rejects invalid values", () => {
        const preference = createOverviewGameLogPreference();
        expect(preference.value).toBe(3);
        for (let value = 0; value <= 8; value++) {
            preference.onChange(value);
            expect(preference.value).toBe(value);
            expect(createOverviewGameLogPreference().value).toBe(value);
        }
        for (const invalid of [-1, 9, 1.5, NaN]) preference.onChange(invalid);
        expect(preference.value).toBe(8);
        for (const invalid of ["", "9", "1.5", "not a number"]) {
            window.localStorage.setItem("kcq.overviewGameLogLines", invalid);
            expect(createOverviewGameLogPreference().value).toBe(3);
        }
    });
    it("keeps the live preference when storage is unavailable", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Unavailable"); });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Unavailable"); });
        const preference = createOverviewGameLogPreference();
        expect(preference.value).toBe(3);
        preference.onChange(0); expect(preference.value).toBe(0);
    });
    it("offers an immediately persisted 0–8 slider with a localized label", () => {
        const preference = createOverviewGameLogPreference();
        const host = document.createElement("div"); document.body.append(host);
        unmount = render(() => createComponent(BattleSettingsPanel, {
            presentation, release: "test", overviewGameLog: preference, onResume: vi.fn(),
        }), host);
        const slider = document.querySelector<HTMLInputElement>('input[type="range"]')!;
        expect([slider.min, slider.max, slider.step, slider.value]).toEqual(["0", "8", "1", "3"]);
        expect(slider.closest("label")!.textContent).toContain("Overview Game Log Lines");
        for (let value = 0; value <= 8; value++) {
            slider.value = String(value); slider.dispatchEvent(new Event("input", { bubbles: true }));
            expect(preference.value).toBe(value);
            expect(document.querySelector("output")!.textContent).toBe(String(value));
            expect(createOverviewGameLogPreference().value).toBe(value);
        }
    });
});

describe("compact Game Log preview", () => {
    it("uses native button semantics, localized labeling, and completely disappears at zero", () => {
        const log = mountPreview();
        const preview = log.host.querySelector<HTMLButtonElement>(".kcq-compact-game-log")!;
        expect(preview.tagName).toBe("BUTTON"); expect(preview.type).toBe("button");
        expect(preview.getAttribute("aria-label")).toBe("Open full Game Log");
        preview.click(); expect(log.onOpen).toHaveBeenCalledOnce();
        log.setLanguage(new Presentation({ ...stockStrings, "ui.gameLog.openFull": "Translated access" }));
        expect(preview.getAttribute("aria-label")).toBe("Translated access");
        log.setLines(0); expect(log.host.childElementCount).toBe(0); expect(log.host.textContent).toBe("");
        log.setLines(8); expect(log.host.querySelector(".kcq-compact-game-log")).not.toBeNull();
    });
    it("shows independently scrollable wide history and follows new entries only from the bottom", () => {
        const pending = new Map<number, FrameRequestCallback>(); let id = 0;
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { pending.set(++id, callback); return id; });
        vi.stubGlobal("cancelAnimationFrame", (frame: number) => pending.delete(frame));
        const flush = () => { for (const [frame, callback] of [...pending]) { pending.delete(frame); callback(0); } };
        const history = Array.from({ length: 12 }, () => action());
        const log = mountPreview(history, true);
        const viewport = log.host.querySelector<HTMLElement>('[role="log"]')!;
        Object.defineProperties(viewport, {
            scrollHeight: { get: () => viewport.children.length * 50 }, clientHeight: { value: 100 },
        });
        expect(viewport.querySelectorAll("article")).toHaveLength(12);
        expect(viewport.tabIndex).toBe(0);
        expect(log.host.querySelector("button.kcq-compact-game-log")).toBeNull();
        log.setLines(0); expect(viewport.querySelectorAll("article")).toHaveLength(12);
        flush(); expect(viewport.scrollTop).toBe(500);
        viewport.scrollTop = 150; viewport.dispatchEvent(new Event("scroll"));
        log.setEntries([...history, action()]); flush(); expect(viewport.scrollTop).toBe(150);
        viewport.scrollTop = 550; viewport.dispatchEvent(new Event("scroll"));
        log.setEntries([...history, action(), action()]); flush(); expect(viewport.scrollTop).toBe(600);
        log.setEntries([...history, action()]);
        expect(pending.size).toBe(1);
        unmount?.(); unmount = undefined; expect(pending.size).toBe(0);
    });
    it("shares grouped accuracy, character colors and outcome tones with the full renderer", () => {
        const log = mountPreview([{
            kind: "move", targetIds: ["ko", "matsuko"], actor: "queen1", move: "skunkPerfume", outcomes: [
                { kind: "damage", target: "ko", hits: [{ result: "miss", damage: 0, healing: 0, blocked: 0 }], damage: 0, healing: 0, blocked: 0 },
                { kind: "damage", target: "matsuko", hits: [{ result: "miss", damage: 0, healing: 0, blocked: 0 }], damage: 0, healing: 0, blocked: 0 },
            ]
        }]);
        expect(log.host.querySelectorAll('[data-outcome="damage"]')).toHaveLength(1);
        expect(log.host.querySelector(".kcq-game-log__target")!.textContent).toBe("Ko-chan, Matsuko");
        expect(log.host.querySelector(".kcq-game-log__value--entity-ko")!.textContent).toBe("Ko-chan");
        expect(log.host.querySelector(".kcq-game-log__value--entity-matsuko")!.textContent).toBe("Matsuko");
        expect(log.host.querySelector(".kcq-game-log__value--miss")!.textContent).toBe("Miss");
        log.setEntries([action("ko")]);
        expect(log.host.querySelector(".kcq-game-log__actor--ko")!.textContent).toBe("Ko-chan");
    });
    it("removes enemy phases with binding ticks, expiration and stance resets before counting candidates", () => {
        const phase: GameLogPresentationEntry = {
            kind: "phase", phase: "enemy", round: 7, outcomes: [
                {
                    kind: "bindingTick", target: "ko", binding: "latexCollar", outcomes: [
                        { kind: "resource", target: "ko", resource: "ribbonPower", change: -2, initial: 10, final: 8 },
                    ]
                },
                { kind: "bindingTick", target: "matsuko", binding: "latexLegs", outcomes: [] },
                { kind: "buff", buff: "pounce", participants: [{ target: "ko", initial: { present: true }, final: { present: false } }] },
                { kind: "stance", actor: "ko", initial: "standing", final: "moving" },
                { kind: "stance", actor: "hinari", initial: "standing", final: "moving" },
            ]
        };
        const log = mountPreview([action("queen1"), action("queen2"), action("skunkette1"), phase]);
        expect([...log.host.querySelectorAll<HTMLElement>("article")].map(article => article.dataset.actor))
            .toEqual(["queen1", "queen2", "skunkette1"]);
        expect(log.host.querySelector('[data-kind="phase"]')).toBeNull();
        expect(log.host.querySelector("[data-outcome]")).toBeNull();
        log.setLines(1);
        expect(log.host.querySelectorAll("article")).toHaveLength(1);
        expect(log.host.querySelector<HTMLElement>("article")!.dataset.actor).toBe("skunkette1");
        log.setEntries([phase]);
        expect(log.host.querySelectorAll("article")).toHaveLength(0);
        expect(log.host.textContent).toContain("No combat events yet.");
    });
    it("retains damage bands and binding levels for multi-target actions", () => {
        const log = mountPreview([{
            kind: "move", targetIds: ["ko", "matsuko"], actor: "queen1", move: "skunkPerfume", outcomes: [
                { kind: "damage", target: "ko", hits: [{ result: "hit", damage: 0, healing: 0, blocked: 0 }], damage: 0, healing: 0, blocked: 0 },
                {
                    kind: "binding", target: "ko", binding: "latexLegs", change: 23, blocked: 0,
                    initial: { value: 58, level: "heavy" }, final: { value: 81, level: "severe" }
                },
                { kind: "damage", target: "matsuko", hits: [{ result: "miss", damage: 0, healing: 0, blocked: 0 }], damage: 0, healing: 0, blocked: 0 },
            ]
        }]);
        expect(log.host.querySelector(".kcq-game-log__value--hit")!.textContent).toBe("Hit");
        expect(log.host.querySelector(".kcq-game-log__value--binding-heavy")!.textContent).toBe("58 (Heavy)");
        expect(log.host.querySelector(".kcq-game-log__value--binding-severe")!.textContent).toBe("81 (Severe)");
        expect(log.host.querySelectorAll('[data-outcome="damage"]')).toHaveLength(2);
        expect(log.host.textContent).toContain(presentation.binding("latexLegs"));
        log.setLines(1);
        expect(log.host.querySelectorAll('[data-outcome="damage"]')).toHaveLength(2);
    });
    it("measures wrapped text at responsive scale, trims older lines and remeasures on resize", () => {
        const pending = new Map<number, FrameRequestCallback>(); let id = 0; let resize!: () => void;
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { pending.set(++id, callback); return id; });
        vi.stubGlobal("cancelAnimationFrame", (frame: number) => pending.delete(frame));
        const disconnect = vi.fn();
        vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() { } disconnect = disconnect; });
        const flush = () => { for (const [frame, callback] of [...pending]) { pending.delete(frame); callback(0); } };
        const log = mountPreview([action("matsuko"), action("hinari"), action("ko")]);
        const content = log.host.querySelector<HTMLElement>(".kcq-compact-game-log__content")!;
        let wrapped = false;
        Object.defineProperty(content, "offsetHeight", { configurable: true, get: () => wrapped ? 112 : 64 });
        vi.spyOn(content, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 100, 300, wrapped ? 224 : 128));
        const articles = [...content.children] as HTMLElement[];
        articles.forEach((article, index) => vi.spyOn(article, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 100 + index * 32, 300, index === 2 ? (wrapped ? 160 : 64) : 32)));
        vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
            const article = this.startContainer.parentElement?.closest("article");
            const index = articles.indexOf(article as HTMLElement);
            const count = index === 2 ? (wrapped ? 5 : 2) : 1;
            return Array.from({ length: count }, (_, line) => new DOMRect(0, 104 + index * 32 + line * 32, 50, 24)) as unknown as DOMRectList;
        });
        flush(); expect(content.style.marginTop).toBe("-16px");
        expect(articles[0]!.getAttribute("aria-hidden")).toBe("true");
        expect(articles[2]!.getAttribute("aria-hidden")).toBeNull();
        wrapped = true; resize(); flush(); expect(content.style.marginTop).toBe("-32px");
        log.setLines(1); flush(); expect(content.style.marginTop).toBe("0px");
        expect(content.children).toHaveLength(1);
        expect(articles[2]!.getAttribute("aria-hidden")).toBeNull();
        log.setLines(8); flush(); expect(content.style.marginTop).toBe("0px");
        unmount?.(); unmount = undefined; expect(disconnect).toHaveBeenCalledOnce();
    });
});

describe("inline Wide history tabs", () => {
    it("switches to localized Story prose in the same viewport and restores the mechanical history", () => {
        const log = mountPreview([action()], true);
        const viewport = log.host.querySelector<HTMLElement>('[role="log"]')!;
        const combat = viewport.innerHTML;
        const tabs = [...log.host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
        expect(tabs.map(tab => tab.textContent)).toEqual(["Game Log", "Story Log"]);
        tabs[1]!.click();
        expect(viewport.textContent).toContain("Ko-chan uses Telekinesis.");
        expect(log.host.querySelector('[role="log"]')).toBe(viewport);
        expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
        expect(log.onOpen).not.toHaveBeenCalled();
        log.setLanguage(new Presentation({ ...stockStrings, "ui.gameLog.storyLog": "Translated Story", "move.telekinesis.narrative.action": "{actor}: {move}!" }));
        expect(tabs[1]!.textContent).toBe("Translated Story");
        expect(viewport.textContent).toContain("Ko-chan: Telekinesis!");
        log.setLanguage(presentation);
        tabs[0]!.click();
        expect(viewport.innerHTML).toBe(combat);
    });

    it("retains each tab's scrollback and auto-follow, with keyboard tab navigation", () => {
        const pending = new Map<number, FrameRequestCallback>(); let id = 0;
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { pending.set(++id, callback); return id; });
        vi.stubGlobal("cancelAnimationFrame", (frame: number) => pending.delete(frame));
        const flush = () => { for (const [frame, callback] of [...pending]) { pending.delete(frame); callback(0); } };
        const entries = Array.from({ length: 12 }, () => action());
        const log = mountPreview(entries, true);
        const viewport = log.host.querySelector<HTMLElement>('[role="log"]')!;
        Object.defineProperties(viewport, { scrollHeight: { value: 1000 }, clientHeight: { value: 100 } });
        const tabs = [...log.host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
        const scroll = (top: number) => { viewport.scrollTop = top; viewport.dispatchEvent(new Event("scroll")); };
        flush(); expect(viewport.scrollTop).toBe(900);
        scroll(125); tabs[1]!.click(); flush(); expect(viewport.scrollTop).toBe(900);
        scroll(250); tabs[0]!.click(); flush(); expect(viewport.scrollTop).toBe(125);
        log.setEntries([...entries, action()]); flush(); expect(viewport.scrollTop).toBe(125);
        tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
        flush(); expect(document.activeElement).toBe(tabs[1]); expect(viewport.scrollTop).toBe(250);
        expect(tabs[0]!.tabIndex).toBe(-1);
        const panel = log.host.querySelector('[role="tabpanel"]')!;
        expect(panel.getAttribute("aria-labelledby")).toBe(tabs[1]!.id);
        expect(tabs[1]!.getAttribute("aria-controls")).toBe(panel.id);
        scroll(900); log.setEntries([...entries, action(), action()]); flush(); expect(viewport.scrollTop).toBe(900);
    });
});

describe("cropped preview tabs", () => {
    it("switches prose without opening history and opens it only from the log body", () => {
        const log = mountPreview([action()]);
        const tabs = [...log.host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
        tabs[1]!.click();
        const body = log.host.querySelector<HTMLButtonElement>('.kcq-compact-game-log')!;
        expect(body.textContent).toContain('Ko-chan uses Telekinesis.');
        expect(body.querySelector('.kcq-game-log__story-text')).not.toBeNull();
        expect(log.onOpen).not.toHaveBeenCalled();
        body.click(); expect(log.onOpen).toHaveBeenCalledOnce();
        tabs[0]!.click(); expect(body.querySelector('.kcq-game-log__story-text')).toBeNull();
        expect(body.textContent).toContain('Telekinesis');
    });
});
