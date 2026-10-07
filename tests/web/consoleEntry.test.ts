import { afterEach, describe, expect, it, vi } from "vitest";
import type { BattleUI } from "../../src/ui/console/controller";
import { DEFAULT_DIFFICULTY, ENCOUNTER_DIFFICULTIES, startBattle } from "../../src/ui/web/app";

vi.mock("../../src/ui/web/app", async (importOriginal) => ({
    ...await importOriginal<typeof import("../../src/ui/web/app")>(),
    startBattle: vi.fn(),
}));
vi.mock("../../src/ui/web/posthog", () => ({ gameplayTelemetry: {} }));

// Only the DOM operations used by startup/selection; combat rendering is covered separately.
class SelectorElement {
    children: SelectorElement[] = [];
    attributes: Record<string, string> = {};
    dataset: Record<string, string> = {};
    textContent = "";
    value = "";
    disabled = false;
    hidden = false;
    onclick?: () => void;
    listeners = new Map<string, () => void>();
    constructor(readonly tagName: string) {}
    append(...children: (SelectorElement | string)[]): void {
        this.children.push(...children.map(child => typeof child === "string" ? Object.assign(new SelectorElement("text"), { textContent: child }) : child));
    }
    replaceChildren(): void { this.children = []; }
    setAttribute(key: string, value: string): void { this.attributes[key] = value; }
    addEventListener(type: string, listener: () => void): void { this.listeners.set(type, listener); }
    querySelectorAll(tag: string): SelectorElement[] {
        return this.children.flatMap(child => [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)]);
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.resetModules();
});

describe("browser-console entry", () => {
    it.each(["click", "keyboard"])("starts a console battle at the selected difficulty via %s and returns to the selector", async (input) => {
        const elements = new Map<string, SelectorElement>();
        for (const id of ["app-title", "screen", "screen-container", "choices", "status", "battle-log-panel", "battle-log", "end-turn", "quit-battle"]) {
            elements.set(id, new SelectorElement("div"));
        }
        const keyListeners = new Set<(event: KeyboardEvent) => void>();
        vi.stubGlobal("document", {
            documentElement: { style: { setProperty: vi.fn() } },
            getElementById: (id: string) => elements.get(id),
            createElement: (tag: string) => new SelectorElement(tag),
            addEventListener: (_type: string, listener: (event: KeyboardEvent) => void) => keyListeners.add(listener),
            removeEventListener: (_type: string, listener: (event: KeyboardEvent) => void) => keyListeners.delete(listener),
        });
        const assign = vi.fn();
        vi.stubGlobal("window", { location: { assign } });
        vi.stubGlobal("__KCQ_RELEASE_TAG__", "test");
        let finishBattle!: () => void;
        vi.mocked(startBattle).mockImplementation(() => new Promise(resolve => { finishBattle = resolve; }));
        await import("../../src/ui/web/main");

        const choices = elements.get("choices")!;
        const selects = choices.querySelectorAll("select");
        expect(selects).toHaveLength(1);
        const difficulty = selects[0];
        expect(difficulty.attributes["aria-label"]).toBe("Difficulty");
        expect(difficulty.children.map(option => option.value)).toEqual(ENCOUNTER_DIFFICULTIES.map(({ id }) => id));
        expect(difficulty.value).toBe(DEFAULT_DIFFICULTY);
        difficulty.value = "mythic";
        const encounter = choices.querySelectorAll("button")[0];
        if (input === "click") encounter.listeners.get("click")!();
        else {
            const preventDefault = vi.fn();
            for (const listener of [...keyListeners]) listener({ key: "1", preventDefault } as unknown as KeyboardEvent);
            expect(preventDefault).toHaveBeenCalledOnce();
        }
        await Promise.resolve();
        expect(startBattle).toHaveBeenCalledOnce();
        const [engine, selectedEncounter, ui, , release, selectedDifficulty] = vi.mocked(startBattle).mock.calls[0];
        expect(engine.listEncounters()).toContain(selectedEncounter);
        expect(selectedEncounter).toBe(encounter.dataset.encounter);
        expect(selectedDifficulty).toBe("mythic");
        expect(release).toBe("test");
        expect(ui.choose).toBeTypeOf("function");
        expect(assign).not.toHaveBeenCalled();
        expect(difficulty.disabled).toBe(true);

        (ui as BattleUI).close?.();
        finishBattle();
        await Promise.resolve();
        expect(elements.get("screen")!.textContent).toBe("Choose encounter:");
        expect(choices.querySelectorAll("select")).toHaveLength(1);
        expect(choices.querySelectorAll("select")[0].disabled).toBe(false);
        expect(choices.querySelectorAll("button").length).toBeGreaterThan(0);
        expect(assign).not.toHaveBeenCalled();
    });
});
