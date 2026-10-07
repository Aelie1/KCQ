import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { englishStrings } from "../../localization/en";
import { Presentation } from "../../src/ui/presentation/presentation";
import { BattleResultPanel } from "../../src/ui/web/app/panels/BattleResultPanel";
import { createBattleResultViewModel, type BattleResultStats } from "../../src/ui/web/app/viewModels/battleResult";
import { makePublicGameState } from "../helpers/publicTestData";

const presentation = new Presentation(englishStrings);
const stats: BattleResultStats = {
    rounds: 12, actions: 34, peakBinding: 145, progress: 0.73, incapacitations: 0, rescues: 0,
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
        expect(html).toMatch(new RegExp('<h1 id="[^"]+">' + outcome.toUpperCase() + '</h1>'));
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
    it.each(["victory", "defeat"] as const)("renders %s as an accessible modal without a full-screen layout or close control", outcome => {
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

    it("shows progress prominently on defeat and peak binding only on victory", () => {
        const defeat = render("defeat");
        expect(defeat).toContain('class="kcq-battle-result__progress">73% Progress</strong>');
        expect(defeat.indexOf("73% Progress")).toBeLessThan(defeat.indexOf("12 Rounds"));
        expect(defeat).not.toContain("Peak Binding");
        expect(defeat).not.toContain("Incapacitations");
        const victory = render("victory");
        expect(victory).toContain("Peak Binding");
        expect(victory).toContain("145");
        expect(victory).not.toContain("Progress");
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
        expect(rows.find(row => row.label === "Hits")?.detail).toBe("avg 32, max 68 — " + presentation.move("fairyRockfall"));
        expect(rows.find(row => row.label === "Bindings")?.detail).toBe("avg 12, max 38 — " + presentation.move("latexSpray"));
        expect(render("victory", { hits: { count: 0, total: 0, max: 0 }, bindings: { count: 0, total: 0, max: 0 } })).not.toMatch(/NaN|Infinity/);
    });
    it("does not produce a result model during ongoing combat", () => {
        expect(createBattleResultViewModel(makePublicGameState(), stats, presentation)).toBeUndefined();
    });
});
