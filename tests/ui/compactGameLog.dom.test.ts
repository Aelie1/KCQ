import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameLogPresentationEntry } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { CompactGameLog } from "../../src/ui/web/app/components/CompactGameLog";
import { createOverviewGameLogPreference } from "../../src/ui/web/app/overviewGameLogLines";
import { BattleSettingsPanel } from "../../src/ui/web/app/panels/BattleSettingsPanel";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
let unmount: (() => void) | undefined;
beforeEach(() => window.localStorage.clear());
afterEach(() => {
    unmount?.(); unmount = undefined;
    document.body.replaceChildren();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const action = (actor = "ko"): GameLogPresentationEntry => ({ kind: "move", actor, move: "telekinesis", outcomes: [] });
function mountPreview(initial = [action()]) {
    const host = document.createElement("div"); document.body.append(host);
    const [entries, setEntries] = createSignal<readonly GameLogPresentationEntry[]>(initial);
    const [lines, setLines] = createSignal(3);
    const [language, setLanguage] = createSignal(presentation);
    const onOpen = vi.fn();
    unmount = render(() => createComponent(CompactGameLog, {
        get entries() { return entries(); }, get lines() { return lines(); }, get presentation() { return language(); },
        party: ["ko", "matsuko", "hinari"], onOpen,
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
    it("shares grouped accuracy, character colors and outcome tones with the full renderer", () => {
        const log = mountPreview([{ kind: "move", actor: "queen1", move: "skunkPerfume", outcomes: [
            { kind: "damage", target: "ko", hits: [{ result: "miss", damage: 0, healing: 0, blocked: 0 }], damage: 0, healing: 0, blocked: 0 },
            { kind: "damage", target: "matsuko", hits: [{ result: "miss", damage: 0, healing: 0, blocked: 0 }], damage: 0, healing: 0, blocked: 0 },
        ] }]);
        expect(log.host.querySelectorAll('[data-outcome="damage"]')).toHaveLength(1);
        expect(log.host.querySelector(".kcq-game-log__target")!.textContent).toBe("Ko-chan, Matsuko");
        expect(log.host.querySelector(".kcq-game-log__value--entity-ko")!.textContent).toBe("Ko-chan");
        expect(log.host.querySelector(".kcq-game-log__value--entity-matsuko")!.textContent).toBe("Matsuko");
        expect(log.host.querySelector(".kcq-game-log__value--miss")!.textContent).toBe("Miss");
        log.setEntries([action("ko")]);
        expect(log.host.querySelector(".kcq-game-log__actor--ko")!.textContent).toBe("Ko-chan");
    });
    it("measures wrapped text at responsive scale, trims older lines and remeasures on resize", () => {
        const pending = new Map<number, FrameRequestCallback>(); let id = 0; let resize!: () => void;
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { pending.set(++id, callback); return id; });
        vi.stubGlobal("cancelAnimationFrame", (frame: number) => pending.delete(frame));
        const disconnect = vi.fn();
        vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect = disconnect; });
        const flush = () => { for (const [frame, callback] of [...pending]) { pending.delete(frame); callback(0); } };
        const log = mountPreview([action("matsuko"), action("hinari"), action("ko")]);
        const content = log.host.querySelector<HTMLElement>(".kcq-compact-game-log__content")!;
        let wrapped = false;
        Object.defineProperty(content, "offsetHeight", { configurable: true, get: () => wrapped ? 112 : 64 });
        vi.spyOn(content, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 100, 300, wrapped ? 224 : 128));
        const articles = [...content.children] as HTMLElement[];
        articles.forEach((article, index) => vi.spyOn(article, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 100 + index * 32, 300, index === 2 ? (wrapped ? 160 : 64) : 32)));
        vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function(this: Range) {
            const article = this.startContainer.parentElement?.closest("article");
            const index = articles.indexOf(article as HTMLElement);
            const count = index === 2 ? (wrapped ? 5 : 2) : 1;
            return Array.from({ length: count }, (_, line) => new DOMRect(0, 104 + index * 32 + line * 32, 50, 24)) as unknown as DOMRectList;
        });
        flush(); expect(content.style.marginTop).toBe("-16px");
        expect(articles[0]!.getAttribute("aria-hidden")).toBe("true");
        expect(articles[2]!.getAttribute("aria-hidden")).toBeNull();
        wrapped = true; resize(); flush(); expect(content.style.marginTop).toBe("-32px");
        expect(articles[2]!.getAttribute("aria-hidden")).toBeNull();
        log.setLines(8); flush(); expect(content.style.marginTop).toBe("0px");
        unmount?.(); unmount = undefined; expect(disconnect).toHaveBeenCalledOnce();
    });
});
