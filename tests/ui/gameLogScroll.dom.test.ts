import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameLogPresentationEntry } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { FullGameLog } from "../../src/ui/web/app/components/FullGameLog";
import type { FullLogStyle } from "../../src/ui/web/app/gameLogMode";
import { groupGameLogRounds } from "../../src/ui/web/app/gameLogScroll";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation({ ...stockStrings, "move.telekinesis.narrative.action": "{actor} uses {move}." });
const action = (): GameLogPresentationEntry => ({ kind: "move", actor: "ko", move: "telekinesis", targetIds: [], outcomes: [] });
const history = (empty: number[] = []): GameLogPresentationEntry[] => [1, 2, 3, 4].flatMap(round => [
    { kind: "phase", phase: "player", round, outcomes: [] } as GameLogPresentationEntry,
    ...(empty.includes(round) ? [] : [action()]),
]);
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function mount(initial = history(), initialStyle: FullLogStyle = "both") {
    const pending = new Map<number, FrameRequestCallback>(); let id = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { pending.set(++id, callback); return id; });
    vi.stubGlobal("cancelAnimationFrame", (frame: number) => pending.delete(frame));
    const resizes: (() => void)[] = [], disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
        constructor(callback: () => void) { resizes.push(callback); }
        observe() {} disconnect = disconnect;
    });
    const [entries, setEntries] = createSignal(initial), [style, setStyle] = createSignal(initialStyle);
    const [encounter, setEncounter] = createSignal("one"), [round, setRound] = createSignal(4);
    const host = document.createElement("div"); document.body.append(host);
    dispose = render(() => createComponent(FullGameLog, {
        get entries() { return entries(); }, get style() { return style(); },
        get encounterId() { return encounter(); }, get round() { return round(); }, presentation, party: ["ko"],
    }), host);
    const panels = [...host.querySelectorAll<HTMLElement>('[role="log"]')];
    const flush = () => { for (const [frame, callback] of [...pending]) { pending.delete(frame); callback(0); } };
    const scroll = (panel: HTMLElement, top: number) => { panel.scrollTop = top; panel.dispatchEvent(new Event("scroll")); };
    return { host, panels, pending, flush, scroll, setEntries, setStyle, setEncounter, setRound, disconnect,
        resize: () => resizes.forEach(callback => callback()),
    };
}

/** CSS-pixel layout dimensions; anchors and text still come from the real renderers. */
function geometry(panel: HTMLElement, initial: number[], client = 100, padding = 0) {
    let heights = initial;
    Object.defineProperties(panel, {
        scrollHeight: { configurable: true, get: () => heights.reduce((sum, height) => sum + height, 0) + 2 * padding },
        clientHeight: { configurable: true, value: client },
    });
    const top = vi.fn((round: number) => padding + heights.slice(0, round - 1).reduce((sum, height) => sum + height, 0));
    for (const anchor of panel.querySelectorAll<HTMLElement>("[data-log-round]")) {
        const round = Number(anchor.dataset.logRound);
        Object.defineProperties(anchor, {
            offsetTop: { configurable: true, get: () => top(round) },
            offsetHeight: { configurable: true, get: () => anchor.childElementCount ? heights[round - 1] ?? 0 : 0 },
        });
    }
    return { top, setHeights: (next: number[]) => { heights = next; } };
}

describe("round anchors", () => {
    it("groups actions and both phases by semantic round without changing event data", () => {
        const entries: GameLogPresentationEntry[] = [action(),
            { kind: "phase", phase: "enemy", round: 6, outcomes: [] }, action(),
            { kind: "phase", phase: "player", round: 7, outcomes: [] }, action(),
        ];
        const before = JSON.stringify(entries);
        expect(groupGameLogRounds(entries).map(group => [group.round, group.entries.length])).toEqual([[6, 3], [7, 2]]);
        expect(JSON.stringify(entries)).toBe(before);
        expect(groupGameLogRounds([action()])[0]!.round).toBe(1);
        expect(groupGameLogRounds([])).toEqual([]);
    });
    it("keeps a zero-height anchor for an omitted narrative round", () => {
        const log = mount(history([2])); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        expect([...game.querySelectorAll<HTMLElement>("[data-log-round]")].map(e => e.dataset.logRound)).toEqual(["1", "2", "3", "4"]);
        expect(story.querySelector('[data-log-round="2"]')!.childElementCount).toBe(0);
        expect(story.querySelector('[data-log-round="3"] .kcq-game-log__story-text')).not.toBeNull();
    });
});

describe("synchronized full log scrolling", () => {
    it("maps viewport bottoms to the same round fraction in both directions and across boundaries", () => {
        const log = mount(); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        geometry(game, [200, 400, 300, 300]); geometry(story, [400, 200, 400, 500], 150); log.flush();
        // Game bottom 400 is halfway through Round 2 (200..600); Story bottom becomes 500 (400..600).
        log.scroll(game, 300); log.flush(); expect(story.scrollTop).toBe(350);
        log.scroll(story, 650); log.flush(); expect(game.scrollTop).toBe(650); // Halfway through Round 3.
        log.scroll(game, 700); log.flush(); expect(story.scrollTop).toBeCloseTo(600 + 2 / 3 * 400 - 150);
        log.scroll(game, 500); log.flush(); expect(story.scrollTop).toBe(450); // Exact end of Round 2.
        log.scroll(game, 501); log.flush(); expect(story.scrollTop).toBeCloseTo(600 + 400 / 300 - 150);
    });
    it("clamps positions and accounts for content padding and unequal viewport heights", () => {
        const log = mount(); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        geometry(game, [200, 400, 300, 300], 100, 8); geometry(story, [50, 200, 400, 500], 250, 8); log.flush();
        log.scroll(game, 8); log.flush(); expect(story.scrollTop).toBe(0);
        log.scroll(game, 308); log.flush(); expect(story.scrollTop).toBe(0);
        log.scroll(game, 600); log.flush(); expect(story.scrollTop).toBeCloseTo(258 + 92 / 300 * 400 - 250);
    });
    it("maps empty middle and trailing narrative rounds to nearby boundaries without reverse jumps", () => {
        const log = mount(history([2, 4])); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        geometry(game, [200, 400, 300, 300]); geometry(story, [400, 0, 500, 0]); log.flush();
        log.scroll(game, 300); log.flush(); expect(story.scrollTop).toBe(300);
        story.dispatchEvent(new Event("scroll")); log.flush(); expect(game.scrollTop).toBe(300);
        log.scroll(game, 900); log.flush(); expect(story.scrollTop).toBe(800);
        story.dispatchEvent(new Event("scroll")); log.flush(); expect(game.scrollTop).toBe(900);
    });
    it("handles entirely empty narrative and unknown round metadata", () => {
        const log = mount(history([1, 2, 3, 4])); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        geometry(game, [200, 400, 300, 300]); geometry(story, [0, 0, 0, 0]); log.flush();
        log.scroll(game, 300); expect(() => log.flush()).not.toThrow(); expect(story.scrollTop).toBe(0);
        log.setEntries([action(), { kind: "phase", phase: "enemy", outcomes: [] }, action()]);
        expect(game.querySelector('[data-log-round="1"]')).not.toBeNull();
    });
    it("suppresses asynchronous echoes, coalesces scrolls, and caches round measurements", () => {
        const log = mount(); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        const a = geometry(game, [200, 400, 300, 300]), b = geometry(story, [400, 200, 400, 500]); log.flush();
        const writes = vi.spyOn(story, "scrollTop", "set");
        log.scroll(game, 300); log.scroll(game, 320); expect(log.pending.size).toBe(1); log.flush();
        const target = story.scrollTop, reads = a.top.mock.calls.length + b.top.mock.calls.length;
        expect(reads).toBe(8);
        story.dispatchEvent(new Event("scroll")); expect(log.pending.size).toBe(0); expect(game.scrollTop).toBe(320);
        log.scroll(game, 320.1); expect(log.pending.size).toBe(0);
        log.scroll(game, 330); log.flush(); expect(a.top.mock.calls.length + b.top.mock.calls.length).toBe(reads);
        expect(story.scrollTop).toBeGreaterThan(target);
        expect(writes).toHaveBeenCalledTimes(2);
        log.resize(); log.flush(); expect(a.top.mock.calls.length + b.top.mock.calls.length).toBe(16);
        expect(writes).toHaveBeenCalledTimes(2);
    });
    it.each([0, 1])("pauses both auto-followers when panel %i leaves bottom and resumes both at bottom", source => {
        const log = mount(); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        const a = geometry(game, [200, 400, 300, 300]), b = geometry(story, [400, 200, 400, 500]); log.flush();
        expect(game.scrollTop).toBe(1100); expect(story.scrollTop).toBe(1400);
        log.scroll(log.panels[source]!, 300); log.flush(); const positions = log.panels.map(panel => panel.scrollTop);
        a.setHeights([200, 400, 300, 500]); b.setHeights([400, 200, 400, 800]);
        log.setEntries([...history(), action()]); log.flush(); expect(log.panels.map(panel => panel.scrollTop)).toEqual(positions);
        log.scroll(log.panels[source]!, source ? 1700 : 1300); log.flush();
        expect(game.scrollTop).toBe(1300); expect(story.scrollTop).toBe(1700);
        a.setHeights([200, 400, 300, 600]); b.setHeights([400, 200, 400, 900]);
        log.setEntries([...history(), action(), action()]); log.flush();
        expect(game.scrollTop).toBe(1400); expect(story.scrollTop).toBe(1800);
    });
    it("does not resume follow when the synchronized target clamps to bottom", () => {
        const log = mount(history([4])); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        const a = geometry(game, [200, 400, 300, 300]), b = geometry(story, [400, 200, 400, 0]); log.flush();
        log.scroll(game, 900); log.flush(); expect(story.scrollTop).toBe(900); story.dispatchEvent(new Event("scroll"));
        a.setHeights([200, 400, 300, 500]); b.setHeights([400, 200, 700, 0]); log.resize(); log.flush();
        expect(game.scrollTop).toBe(900);
    });
    it("invalidates round sizes after reflow while preserving the source position", () => {
        const log = mount(); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        geometry(game, [200, 400, 300, 300]); const b = geometry(story, [400, 200, 400, 500]); log.flush();
        log.scroll(game, 300); log.flush(); expect(story.scrollTop).toBe(400);
        b.setHeights([400, 600, 400, 500]); log.resize(); log.flush();
        expect(game.scrollTop).toBe(300); expect(story.scrollTop).toBe(600);
    });
    it.each(["clear", "encounter", "round"] as const)("resets follow after %s and cancels pending work on disposal", reset => {
        const log = mount(); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        geometry(game, [200, 400, 300, 300]); geometry(story, [400, 200, 400, 500]); log.flush();
        log.scroll(game, 300); log.flush();
        if (reset === "clear") log.setEntries([]); else if (reset === "encounter") log.setEncounter("two"); else log.setRound(1);
        log.flush(); expect(game.scrollTop).toBe(1100); expect(story.scrollTop).toBe(1400);
        log.resize(); expect(log.pending.size).toBe(1); dispose!(); dispose = undefined;
        expect(log.pending.size).toBe(0); expect(log.disconnect).toHaveBeenCalledTimes(2);
    });
    it.each(["game", "story"] as const)("preserves ordinary scrolling and follow in %s-only mode", style => {
        const log = mount(history(), style); const panel = log.panels[0]!;
        geometry(panel, [200, 400, 300, 300]); log.flush(); expect(panel.scrollTop).toBe(1100);
        log.scroll(panel, 300); log.setEntries([...history(), action()]); log.flush(); expect(panel.scrollTop).toBe(300);
        log.scroll(panel, 1100); log.flush(); expect(panel.scrollTop).toBe(1100);
        expect(log.host.querySelectorAll('[role="log"]')).toHaveLength(1);
    });
});

describe("scroll ownership", () => {
    it("uses the latest user source when both panels scroll before the next frame", () => {
        const log = mount(); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        geometry(game, [200, 400, 300, 300]); geometry(story, [400, 200, 400, 500]); log.flush();
        log.scroll(game, 300); log.scroll(story, 650); log.flush();
        expect(story.scrollTop).toBe(650); expect(game.scrollTop).toBe(612.5);
    });
    it("lets user scrollback override an already queued bottom-follow update", () => {
        const log = mount(); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        const a = geometry(game, [200, 400, 300, 300]), b = geometry(story, [400, 200, 400, 500]); log.flush();
        a.setHeights([200, 400, 300, 600]); b.setHeights([400, 200, 400, 900]);
        log.setEntries([...history(), action()]);
        log.scroll(story, 400); log.flush();
        expect(story.scrollTop).toBe(400); expect(game.scrollTop).toBe(300);
    });
    it("disables synchronization in single-log mode and restores it when Both is selected again", () => {
        const log = mount(); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        geometry(game, [200, 400, 300, 300]); geometry(story, [400, 200, 400, 500]); log.flush();
        log.setStyle("game"); log.scroll(game, 300); log.flush();
        expect(log.host.querySelectorAll('[role="log"]')).toHaveLength(1); expect(game.scrollTop).toBe(300);
        log.setStyle("both");
        const nextStory = log.host.querySelectorAll<HTMLElement>('[role="log"]')[1]!;
        geometry(nextStory, [400, 200, 400, 500]); log.flush(); expect(nextStory.scrollTop).toBe(400);
        nextStory.dispatchEvent(new Event("scroll")); log.flush(); expect(game.scrollTop).toBe(300);
    });
});

describe("native incremental scrolling", () => {
    it.each([0, 1])("lets small wheel steps leave the bottom of panel %i without rewriting the source", index => {
        const log = mount(); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        geometry(game, [200, 400, 300, 300]); geometry(story, [400, 200, 400, 500]); log.flush();
        const source = log.panels[index]!, target = log.panels[1 - index]!;
        const initialTop = source.scrollTop, initialTarget = target.scrollTop;
        const writes = vi.spyOn(source, "scrollTop", "set");
        for (const distance of [8, 16, 24, 40]) {
            const wheel = new WheelEvent("wheel", { deltaY: -8, bubbles: true, cancelable: true });
            source.dispatchEvent(wheel); expect(wheel.defaultPrevented).toBe(false);
            // happy-dom has no native wheel default; reproduce its incremental scroll event.
            log.scroll(source, initialTop - distance); writes.mockClear();
            log.flush();
            expect(writes).not.toHaveBeenCalled();
            expect(source.scrollTop).toBe(initialTop - distance);
            expect(target.scrollTop).toBeLessThan(initialTarget);
            target.dispatchEvent(new Event("scroll"));
            expect(log.pending.size).toBe(0); // The synchronized echo must not reverse ownership.
        }
    });
});

describe("native source ownership near the bottom", () => {
    it.each(["wheel", "touchmove", "keydown", "pointermove"])("leaves %s input uncanceled and does not write back to a scrolling source", input => {
        const log = mount(); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        geometry(game, [200, 400, 300, 300]); geometry(story, [400, 200, 400, 500]); log.flush();
        const event = input === "keydown" ? new KeyboardEvent(input, { key: "ArrowUp", bubbles: true, cancelable: true })
            : new Event(input, { bubbles: true, cancelable: true });
        game.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
        // Fractional trackpad/native smooth-scroll steps can initially be less than a pixel.
        log.scroll(game, 1099.25);
        const writes = vi.spyOn(game, "scrollTop", "set"); log.flush();
        expect(writes).not.toHaveBeenCalled(); expect(game.scrollTop).toBe(1099.25);
        log.scroll(game, 1097); writes.mockClear(); log.flush();
        expect(writes).not.toHaveBeenCalled(); expect(game.scrollTop).toBe(1097);
        expect(story.scrollTop).toBeLessThan(1400);
    });
    it.each([0, 1])("pauses follow during a small scroll on panel %i even if combat updates before the next frame", index => {
        const log = mount(); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        const a = geometry(game, [200, 400, 300, 300]), b = geometry(story, [400, 200, 400, 500]); log.flush();
        const source = log.panels[index]!, top = source.scrollTop;
        log.scroll(source, top - 8);
        a.setHeights([200, 400, 300, 500]); b.setHeights([400, 200, 400, 800]);
        log.setEntries([...history(), action()]); log.flush();
        expect(source.scrollTop).toBe(top - 8);
        const target = log.panels[1 - index]!; target.dispatchEvent(new Event("scroll"));
        log.resize(); log.flush(); expect(source.scrollTop).toBe(top - 8);
        log.scroll(source, index ? 1700 : 1300); log.flush();
        expect(game.scrollTop).toBe(1300); expect(story.scrollTop).toBe(1700);
    });
    it("resumes both ends when the source has no visible entries in the final round", () => {
        const log = mount(history([4])); const [game, story] = log.panels as [HTMLElement, HTMLElement];
        geometry(game, [200, 400, 300, 300]); geometry(story, [400, 200, 400, 0]); log.flush();
        log.scroll(story, 892); log.flush(); expect(game.scrollTop).toBeLessThan(1100);
        log.scroll(story, 900);
        const writes = vi.spyOn(story, "scrollTop", "set"); log.flush();
        expect(writes).not.toHaveBeenCalled(); expect(game.scrollTop).toBe(1100); expect(story.scrollTop).toBe(900);
    });
});
