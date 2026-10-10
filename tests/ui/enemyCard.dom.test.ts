import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import type { Window as HappyWindow } from "happy-dom";
import type { Buff, GameState } from "../../src/engine/public/types";
import type { GameLogPresentationEntry } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createStockEngine } from "../../src/stock";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { BattleOverviewPanel } from "../../src/ui/web/app/panels/BattleOverviewPanel";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { stockStrings } from "../helpers/stockStrings";

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.replaceChildren(); });
function mount(view: Parameters<typeof render>[0]) {
    const host = document.createElement("div");
    document.body.append(host);
    dispose = render(view, host);
}
function click(selector: string) {
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) throw Error("Missing target: " + selector);
    target.click();
}

describe("enemy card live durations", () => {
    it("wires real BattleApp application history into overview cards and updates after End Turn", () => {
        const engine = createStockEngine(1);
        engine.loadCharacter("ko"); engine.loadEncounter("plains_2");
        mount(() => createComponent(BattleApp, { engine, presentation: new Presentation(stockStrings), playbackSpeed: { value: "instant", onChange: () => {} } }));
        click(".kcq-party-card");
        click('.kcq-command-card[aria-label="Starlight Bindings"]');
        click(".kcq-target-card");
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
        expect(document.querySelector(".kcq-enemy-card__debuff")?.getAttribute("aria-label"))
            .toBe("Ko-chan: Starlight Bindings (3 Rounds)");
        expect(document.querySelectorAll('.kcq-enemy-card__debuff svg[data-icon="shield-off"]')).toHaveLength(3);
        click(".kcq-battle-overview__primary-action");
        expect(document.querySelectorAll('.kcq-enemy-card__debuff svg[data-icon="shield-off"]')).toHaveLength(2);
    });

    it.each([320, 390])("keeps full name/HP and distinct clusters reactive at viewport width %i", width => {
        const viewport = (window as unknown as HappyWindow).happyDOM;
        const previous = { width: window.innerWidth, height: window.innerHeight };
        viewport.setViewport({ width, height: 844 });
        try {
            const fixture = battleOverviewFixture;
            const enemy = fixture.state.enemies[0]!;
            const buffs: Buff[] = [
                { id: "starlightBindings", duration: 5, icon: "shield-off", modifiers: { defense: -2 } },
                { id: "servitude", duration: 5, icon: "shield", statuses: [{ id: "servitude", value: 1 }] },
                { id: "subspaceClutter", duration: 5, icon: "sword", modifiers: { hit: -2 } },
            ];
            const history: GameLogPresentationEntry[] = buffs.map((buff, index) => ({
                kind: "move", actor: ["ko", "matsuko", "hinari"][index]!, move: "applied-effect", outcomes: [{
                    kind: "buff", buff: buff.id, participants: [{ target: enemy.id, initial: { present: false },
                        final: { present: true, details: buff } }],
                }],
            }));
            const [state, setState] = createSignal<GameState>({ ...fixture.state, enemies: [{ ...enemy, buffs }] });
            const presentation = new Presentation({ ...stockStrings, ["entity." + enemy.id.replace(/\d+$/, "") + ".name"]: "Skunkette Queen" });
            mount(() => createComponent(BattleOverviewPanel, { ...fixture, presentation, history,
                get state() { return state(); }, onSelectEnemy: () => {},
            }));
            const card = document.querySelector(".kcq-enemy-card")!;
            expect(card.querySelector("h3")?.textContent).toBe("Skunkette Queen");
            expect(card.querySelector(".kcq-enemy-card__hp")?.textContent).toBe(enemy.currHp + " / " + enemy.maxHp);
            expect([...card.querySelectorAll(".kcq-enemy-card__debuff")].map(cluster => [
                cluster.className, cluster.querySelectorAll("svg").length,
            ])).toEqual([
                ["kcq-enemy-card__debuff kcq-player-identity--ko", 5],
                ["kcq-enemy-card__debuff kcq-player-identity--matsuko", 5],
                ["kcq-enemy-card__debuff kcq-player-identity--hinari", 5],
            ]);
            expect(card.querySelectorAll("svg")).toHaveLength(15);
            expect(card.querySelectorAll(".kcq-status-chip__segment")).toHaveLength(0);
            expect(card.querySelector(".kcq-shortcut")).not.toBeNull();
            expect(card.querySelector(".kcq-enemy-card__header .kcq-enemy-card__debuffs")).toBeNull();
            setState({ ...state(), enemies: [{ ...enemy, buffs: [{ ...buffs[0]!, duration: 1, icon: undefined }] }] });
            expect(document.querySelectorAll(".kcq-enemy-card__debuff")).toHaveLength(1);
            expect(document.querySelectorAll(".kcq-enemy-card__debuff .kcq-status-chip__segment")).toHaveLength(1);
            setState({ ...state(), enemies: [{ ...enemy, buffs: [{ ...buffs[0]!, duration: 2, icon: "sword" }] }] });
            expect(document.querySelectorAll('.kcq-enemy-card__debuff svg[data-icon="sword"]')).toHaveLength(2);
            expect(document.querySelectorAll(".kcq-enemy-card__debuff .kcq-status-chip__segment")).toHaveLength(0);
            setState({ ...state(), enemies: [{ ...enemy, buffs: [] }] });
            expect(document.querySelector(".kcq-enemy-card__debuffs")).toBeNull();
        } finally { viewport.setViewport(previous); }
    });
});
