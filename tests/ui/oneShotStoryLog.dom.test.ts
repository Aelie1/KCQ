import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { createCharacterLibrary } from "../../src/content";
import { createStockEngine } from "../../src/stock";
import type { GameLogPresentationEntry } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { CompactGameLog } from "../../src/ui/web/app/components/CompactGameLog";
import { GameLogPanel } from "../../src/ui/web/app/panels/GameLogPanel";
import { stockStrings } from "../helpers/stockStrings";

let unmount: (() => void) | undefined;
afterEach(() => { unmount?.(); document.body.replaceChildren(); });

describe("one-time Story Log rendering", () => {
    it.each(["full", "wide", "preview"] as const)("highlights only skill prose using character tokens in the %s log", kind => {
        const entries: GameLogPresentationEntry[] = [
            { kind: "move", actor: "ko", move: "powerOfDenial", targetIds: ["enemy1"], outcomes: [
                { kind: "buff", buff: "test", participants: [{ target: "ko", initial: { present: false }, final: { present: true } }] },
            ] },
            { kind: "move", actor: "matsuko", move: "immolation", targetIds: [], outcomes: [] },
            { kind: "move", actor: "ko", move: "telekinesis", targetIds: [], outcomes: [] },
        ];
        const presentation = new Presentation({
            ...stockStrings,
            "move.powerOfDenial.narrative.action.enemies": "Denial prose.",
            "move.immolation.narrative.action": "Immolation prose.",
            "move.telekinesis.narrative.action": "Ordinary prose.",
            "buff.test.narrative.added": "Unrelated effect.",
        });
        const library = createCharacterLibrary();
        const host = document.createElement("div"); document.body.append(host);
        const [mode, setMode] = createSignal<"combat" | "story">("story");
        if (kind === "full") {
            const engine = createStockEngine(); createBattle(engine, "plains_1", "standard");
            unmount = render(() => createComponent(GameLogPanel, { entries, presentation, library, get mode() { return mode(); }, onModeChange: setMode, state: engine.getGameState() }), host);
        } else {
            unmount = render(() => createComponent(CompactGameLog, {
                entries, presentation, library, get mode() { return mode(); }, onModeChange: setMode, party: ["ko", "matsuko", "hinari"], lines: 8, scrollable: kind === "wide",
            }), host);
        }
        const glows = [...host.querySelectorAll<HTMLElement>(".kcq-game-log__one-shot")];
        expect(glows.map(span => span.textContent)).toEqual(["Denial prose.", "Immolation prose."]);
        expect(glows.map(span => span.style.getPropertyValue("--kcq-story-glow")))
            .toEqual(["var(--kcq-name-ko)", "var(--kcq-name-matsuko)"]);
        expect([...host.querySelectorAll("p.kcq-game-log__story-text")].map(p => p.textContent))
            .toEqual(["Denial prose.", "Unrelated effect.", "Immolation prose.", "Ordinary prose."]);
        host.querySelector<HTMLButtonElement>('[role="tab"]')!.click();
        expect(host.querySelector(".kcq-game-log__one-shot")).toBeNull();
        expect(host.querySelector(".kcq-game-log__story-text")).toBeNull();
        expect(host.querySelector("[data-outcome]")).not.toBeNull();
    });
});
