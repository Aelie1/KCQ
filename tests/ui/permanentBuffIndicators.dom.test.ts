import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import type { Window as HappyWindow } from "happy-dom";
import type { Buff, GameState } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { BattleOverviewPanel } from "../../src/ui/web/app/panels/BattleOverviewPanel";
import { battleOverviewFixture as fixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { stockStrings } from "../helpers/stockStrings";

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.replaceChildren(); });
function mount(view: Parameters<typeof render>[0]) {
    const host = document.createElement("div");
    document.body.append(host);
    dispose = render(view, host);
}

describe("live permanent buff indicators", () => {
    it.each([320, 390, 1280])("updates both groups independently at viewport width %s", width => {
        const viewport = (window as unknown as HappyWindow).happyDOM;
        const previous = { width: window.innerWidth, height: window.innerHeight };
        viewport.setViewport({ width, height: 844 });
        try {
            const enemy = fixture.state.enemies[0]!;
            const temporary: Buff = { id: "temporary", duration: 3, icon: "shield", modifiers: { defense: 2 } };
            const permanent: Buff = { id: "empressMight", icon: "crown", modifiers: { hit: 8, defense: 2 } };
            const [state, setState] = createSignal<GameState>({ ...fixture.state, enemies: [{ ...enemy, buffs: [temporary, permanent] }] });
            const update = (buffs: Buff[]) => setState({ ...state(), enemies: [{ ...enemy, buffs }] });
            mount(() => createComponent(BattleOverviewPanel, { ...fixture, get state() { return state(); } }));
            const card = document.querySelector(".kcq-enemy-card")!;
            const row = card.querySelector(".kcq-enemy-card__debuffs")!;
            const left = row.querySelector(".kcq-enemy-card__temporary-effects")!;
            const right = row.querySelector(".kcq-enemy-card__permanent-effects")!;
            expect(left.parentElement).toBe(right.parentElement);
            expect(left.querySelectorAll('svg[data-icon="shield"]')).toHaveLength(3);
            expect(right.querySelectorAll('svg[data-icon="crown"]')).toHaveLength(1);
            expect(right.textContent).toBe("+8");
            const indicator = right.querySelector<HTMLElement>(".kcq-enemy-card__permanent-effect")!;
            expect(indicator.title).toContain("+8");
            expect(indicator.title).toContain("+2");
            expect(indicator.getAttribute("aria-label")).toBe(indicator.title);

            update([{ ...temporary, duration: 1 }, { ...permanent, icon: "sun", modifiers: { hit: -3 } }]);
            expect(left.querySelectorAll("svg")).toHaveLength(1);
            expect(right.querySelectorAll('svg[data-icon="sun"]')).toHaveLength(1);
            expect(right.textContent).toBe("-3");
            expect(indicator.title).toContain("-3");
            update([permanent]);
            expect(row.querySelector(".kcq-enemy-card__temporary-effects")).toBeNull();
            expect(right.textContent).toBe("+8");
            update([temporary, { ...permanent, icon: undefined }]);
            expect(row.querySelector(".kcq-enemy-card__permanent-effects")).toBeNull();
            expect(row.querySelectorAll('svg[data-icon="shield"]')).toHaveLength(3);
            update([{ ...permanent, duration: 2 }]);
            expect(row.querySelector(".kcq-enemy-card__permanent-effects")).toBeNull();
            expect(row.querySelectorAll('svg[data-icon="crown"]')).toHaveLength(2);
            update([permanent]);
            expect(row.querySelector(".kcq-enemy-card__temporary-effects")).toBeNull();
            expect(row.querySelectorAll('svg[data-icon="crown"]')).toHaveLength(1);
            update([]);
            expect(card.querySelector(".kcq-enemy-card__debuffs")).toBeNull();
        } finally { viewport.setViewport(previous); }
    });

    it("keeps permanent buff Details accessible through the real combat card", () => {
        const engine = createStockEngine(1);
        engine.loadCharacter("ko"); engine.loadEncounter("tower_1");
        const enemy = engine.getGameState().enemies[0]!;
        const buff = enemy.buffs.find(buff => buff.icon && buff.duration === undefined)!;
        mount(() => createComponent(BattleApp, {
            engine, presentation: new Presentation(stockStrings), playbackSpeed: { value: "instant", onChange: () => {} },
        }));
        const indicator = document.querySelector<HTMLElement>(".kcq-enemy-card__permanent-effect")!;
        expect(indicator.textContent).toBe(`+${buff.modifiers!.hit}`);
        indicator.click();
        const details = document.querySelector(".kcq-character-effects")!;
        expect(details).not.toBeNull();
        expect(details.textContent).toContain(new Presentation(stockStrings).buff(buff.id, buff.severity));
        expect(details.textContent).toContain(`+${buff.modifiers!.hit}`);
    });
});
