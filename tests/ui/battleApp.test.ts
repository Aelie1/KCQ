import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { stockStrings } from "../helpers/stockStrings";

// Portals emit no in-stage markup; retain their separately rendered body content.
const bodyPortals = vi.hoisted(() => [] as string[]);
vi.mock("solid-js/web", async importOriginal => {
    const web = await importOriginal<typeof import("solid-js/web")>();
    return {
        ...web,
        Portal: (props: { children: ReturnType<typeof createComponent> }) => {
            bodyPortals.push(web.renderToString(() => props.children));
            return "";
        },
    };
});
beforeEach(() => { bodyPortals.length = 0; });

describe("playable Solid battle application", () => {
    it("renders its initial overview from an already prepared real Engine", () => {
        const engine = createStockEngine(12345);
        createBattle(engine, "plains_1", "standard");
        const presentation = new Presentation(stockStrings);

        const html = renderToString(() => createComponent(BattleApp, {
            engine,
            presentation,
        }));

        expect(html).toMatch(/class="[^"]*\bkcq-battle-overview\b[^"]*"/);
        expect(html).toContain(presentation.encounter("plains_1"));
        expect(html).not.toContain("kcq-battle-result__overlay");
        expect(bodyPortals).toHaveLength(0);
        expect(html.match(/<div[^>]*class="kcq-battle-stage__background"[^>]*>/)?.[0]).not.toMatch(/inert|aria-hidden/);
        for (const character of engine.getGameState().characters) {
            expect(html).toContain(presentation.entity(character.id));
        }
    });

    it.each(["victory", "defeat"] as const)("renders the %s result outside the battle stage with an inert background", outcome => {
        const engine = createStockEngine(12345);
        createBattle(engine, "plains_1", "standard");
        const state = engine.getGameState();
        state.turn.outcome = outcome;
        vi.spyOn(engine, "getGameState").mockReturnValue(state);
        const html = renderToString(() => createComponent(BattleApp, {
            engine, presentation: new Presentation({ ...stockStrings, "encounter.plains_1.victory": "", "encounter.plains_1.defeat": "" }),
        }));
        expect(html).not.toContain("kcq-battle-result__overlay");
        expect(bodyPortals).toHaveLength(1);
        const modal = bodyPortals[0]!;
        expect(modal).toContain("kcq-battle-result--" + outcome);
        expect(modal).toContain(new Presentation(stockStrings).battleState(outcome));
        expect(html).toContain("kcq-battle-overview");
        expect(html).toMatch(/class="kcq-battle-stage__background"[^>]*inert[^>]*aria-hidden="true"/);
        expect(modal).toMatch(/class="[^"]*\bkcq-battle-result__overlay\b[^"]*"/);
        expect(modal).toContain('role="dialog"');
        expect(modal.match(/<button/g)).toHaveLength(outcome === "victory" ? 3 : 4);
        expect(modal).toContain(">View Game Log</button>");
        expect(modal.includes(">Retry</button>")).toBe(outcome === "defeat");
        expect(modal).toContain(">Back to Title Screen</button>");
        expect(modal).toContain(">Back to Level Select</button>");
        expect(modal).not.toContain("End Turn");
        expect(modal).toContain("View Game Log");
        for (const character of state.characters) {
            expect(html).toContain(new Presentation(stockStrings).entity(character.id));
        }
        for (const enemy of state.enemies) {
            expect(html).toContain(new Presentation(stockStrings).entity(enemy.id));
        }
    });
});
