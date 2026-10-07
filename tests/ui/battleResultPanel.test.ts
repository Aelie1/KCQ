import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { englishStrings } from "../../localization/en";
import { Presentation } from "../../src/ui/presentation/presentation";
import { BattleResultPanel } from "../../src/ui/web/app/panels/BattleResultPanel";
import { createBattleResultViewModel, type BattleResultStats } from "../../src/ui/web/app/viewModels/battleResult";
import { makePublicGameState } from "../helpers/publicTestData";

// Expose portal content to Solid's server renderer for panel assertions.
const portal = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("solid-js/web", async importOriginal => ({
    ...await importOriginal<typeof import("solid-js/web")>(),
    Portal: (props: { children: unknown; mount?: Node }) => {
        portal.render(props);
        return props.children;
    },
}));
beforeEach(() => portal.render.mockClear());

const presentation = new Presentation(englishStrings);
const stats: BattleResultStats = {
    rounds: 12, actions: 34, peakBinding: 145, progress: { boss: 0.27 }, incapacitations: 0, rescues: 0,
    escapes: { count: 12, total: 264, max: 40 },
    hits: { count: 14, total: 448, max: 68, maxMove: "fairyRockfall" },
    bindings: { count: 28, total: 336, max: 38, maxMove: "latexSpray" },
};
function model(outcome: "victory" | "defeat", overrides: Partial<BattleResultStats> = {}) {
    const state = makePublicGameState({
        turn: { round: 12, step: 1, phase: "player", outcome },
        encounter: { id: "forest_3", enemies: [], bindings: [], traps: [] },
        difficulty: { id: "mythic", playerModifiers: {}, enemyModifiers: {} },
    });
    return createBattleResultViewModel(state, { ...stats, ...overrides }, presentation)!;
}
const render = (outcome: "victory" | "defeat", overrides?: Partial<BattleResultStats>) =>
    renderToString(() => createComponent(BattleResultPanel, { model: model(outcome, overrides) }));

describe("post-battle result panel", () => {
    it.each(["victory", "defeat"] as const)("renders %s heading, encounter, difficulty, summary and exactly the two result actions", outcome => {
        const html = render(outcome);
        expect(html).toMatch(new RegExp('<h1 id="[^"]+">' + presentation.battleState(outcome) + '</h1>'));
        expect(html).toContain(presentation.encounter("forest_3"));
        expect(html).toContain("Mythic");
        expect(html).toContain("12 Rounds · 34 Actions");
        expect(html.match(/12 Rounds · 34 Actions/g)).toHaveLength(1);
        expect(html).not.toContain("<dt>Rounds</dt>");
        expect(html).not.toContain("<dt>Actions</dt>");
        expect(html.match(/<button[^>]*>([^<]+)<\/button>/g)).toHaveLength(2);
        expect(html).toContain('class="kcq-battle-result__retry"');
        expect(html).toContain(">Retry</button>");
        expect(html).toContain(">Back to Level Select</button>");
        expect(html).not.toContain("Settings");
        expect(html).not.toContain("Party");
    });
    it.each(["victory", "defeat"] as const)("renders %s as an accessible modal without a close control", outcome => {
        const html = render(outcome);
        const headingId = html.match(/<h1 id="([^"]+)">/)?.[1];
        expect(headingId).toBeDefined();
        expect(html).toContain('role="dialog"');
        expect(html).toContain('aria-modal="true"');
        expect(html).toContain('aria-labelledby="' + headingId + '"');
        expect(html).toContain('class="kcq-battle-result__overlay"');
        expect(html).not.toContain("kcq-screen-layout");
        expect(html).not.toMatch(/<dialog|Close|Dismiss|aria-label="X"/);
        expect(html.match(/<button/g)).toHaveLength(2);
        expect(html.indexOf(">Retry</button>")).toBeLessThan(html.indexOf(">Back to Level Select</button>"));
    });

    it("mounts the result in the default body portal with a viewport backdrop", () => {
        render("victory");
        expect(portal.render).toHaveBeenCalledOnce();
        expect(portal.render.mock.calls[0]![0].mount).toBeUndefined();
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const overlay = css.match(/\.kcq-battle-result__overlay\s*\{([^}]+)\}/)?.[1];
        expect(overlay).toMatch(/position:\s*fixed;/);
        expect(overlay).toMatch(/inset:\s*0;/);
        expect(overlay).toMatch(/z-index:\s*3;/);
        expect(overlay).toMatch(/background:\s*rgb\(2 6 23 \/ 65%\);/);
        expect(overlay).not.toMatch(/opacity:|pointer-events:\s*none/);
        const modal = css.match(/\.kcq-battle-result\s*\{([^}]+)\}/)?.[1];
        expect(modal).toMatch(/max-width:\s*340px;/);
        const viewport = css.match(/\.kcq-battle-result__viewport\s*\{([^}]+)\}/)?.[1];
        expect(viewport).toMatch(/width:\s*366px;/);
        expect(viewport).toMatch(/max-width:\s*100%;/);
        expect(viewport).toMatch(/height:\s*var\(--kcq-ui-height\);/);
        expect(viewport).toMatch(/padding:\s*12px;/);
        expect(viewport).toMatch(/zoom:\s*var\(--kcq-ui-zoom, 1\);/);
        expect(modal).toMatch(/background:\s*var\(--kcq-surface-panel\);/);
    });

    it("shows remaining HP prominently on defeat and peak binding only on victory", () => {
        const defeat = render("defeat");
        expect(defeat).toContain('class="kcq-battle-result__progress">27% Boss HP Remaining</strong>');
        expect(defeat.indexOf("27% Boss HP")).toBeLessThan(defeat.indexOf("12 Rounds"));
        expect(defeat).not.toContain("Peak Binding");
        expect(defeat).not.toContain("Incapacitations");
        const victory = render("victory");
        expect(victory).toContain("Peak Binding");
        expect(victory).toContain("145");
        expect(victory).not.toContain("Boss HP");
        expect(victory).not.toContain("Enemy HP");
    });

    it.each([
        [{ boss: 0.27, enemies: 0.91 }, "27% Boss HP"],
        [{ boss: 0, enemies: 0.91 }, "0% Boss HP"],
        [{ enemies: 0.73 }, "73% Enemy HP"],
    ] as const)("shows one remaining HP percentage on defeat: %s", (progress, label) => {
        const html = render("defeat", { progress });
        expect(html).toContain(label);
        expect(html.match(/class="kcq-battle-result__progress"/g)).toHaveLength(1);
        if ("boss" in progress) expect(html).not.toContain("Enemy HP");
        else expect(html).not.toContain("Boss HP");
    });
    it.each(["victory", "defeat"] as const)("hides zero optional stats on %s", outcome => {
        const html = render(outcome);
        expect(html).not.toContain("Incapacitations");
        expect(html).not.toContain("Rescues");
    });
    it("shows positive optional stats but keeps incapacitations off defeat", () => {
        expect(render("victory", { incapacitations: 2, rescues: 1 })).toContain("Incapacitations");
        expect(render("victory", { incapacitations: 2, rescues: 1 })).toContain("Rescues");
        expect(render("defeat", { incapacitations: 2, rescues: 1 })).not.toContain("Incapacitations");
        expect(render("defeat", { incapacitations: 2, rescues: 1 })).toContain("Rescues");
    });
    it("formats averages and maximum action totals with localized move names", () => {
        const rows = model("victory").rows;
        expect(rows.find(row => row.label === "Escapes")).toEqual({ label: "Escapes", value: "12", detail: "avg 22" });
        expect(rows.find(row => row.label === "Hits")?.detail).toBe("avg 32 · max 68 — " + presentation.move("fairyRockfall"));
        expect(rows.find(row => row.label === "Bindings")?.detail).toBe("avg 12 · max 38 — " + presentation.move("latexSpray"));
        expect(render("victory", { hits: { count: 0, total: 0, max: 0 }, bindings: { count: 0, total: 0, max: 0 } })).not.toMatch(/NaN|Infinity/);
    });
    it("does not produce a result model during ongoing combat", () => {
        expect(createBattleResultViewModel(makePublicGameState(), stats, presentation)).toBeUndefined();
    });
});
