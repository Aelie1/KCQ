import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import {
    ActorStyleRegistry,
    formatActionGroups,
    type SemanticStyle,
} from "../../src/ui/console/presentation";
import { DevApp } from "../../src/ui/web/app/dev/DevApp";
import { gameLogFixture } from "../../src/ui/web/app/fixtures/gameLog";
import {
    GAME_LOG_SEMANTIC_CLASSES,
    GameLogPanel,
} from "../../src/ui/web/app/panels/GameLogPanel";

function renderGameLog(): string {
    return renderToString(() => createComponent(GameLogPanel, gameLogFixture));
}

function decoded(html: string): string {
    return html.replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

describe("Solid game log panel", () => {
    it("renders the shared formatter output in chronological action-group order", () => {
        const html = decoded(renderGameLog());
        const actorStyles = new ActorStyleRegistry();
        const groups = gameLogFixture.entries.flatMap((entry) => formatActionGroups(
            entry.action,
            entry.frames,
            actorStyles,
            entry.startingRound,
        ));
        const lines = groups.flatMap((group) => group.lines.map((line) => line.text));

        expect(lines.every((line) => html.includes(line))).toBe(true);
        expect(html.indexOf("ko tried to escape latexArms on ko")).toBeLessThan(
            html.indexOf("ko used telekinesis"),
        );
        expect(html.indexOf("ko used telekinesis")).toBeLessThan(html.indexOf("hinari used rockfall"));
        expect(html.indexOf("hinari used rockfall")).toBeLessThan(html.indexOf("matsuko attempted flameBurst"));
        expect(html.indexOf("matsuko attempted flameBurst")).toBeLessThan(html.indexOf("ENEMY PHASE"));
        expect(html.indexOf("ENEMY PHASE")).toBeLessThan(html.indexOf("skunkette1 used latexSpray"));
        expect(html.indexOf("skunkette1 used latexSpray")).toBeLessThan(html.indexOf("PLAYER PHASE"));
    });

    it("preserves phase, actor, multi-target, and nested consequence semantics", () => {
        const html = decoded(renderGameLog());

        expect(html).toContain("kcq-game-log__group--phase");
        expect(html).toContain("kcq-game-log__line--phase-separator");
        expect(html).toContain("kcq-game-log__line--actor-ko");
        expect(html).toContain("kcq-game-log__line--actor-hinari");
        expect(html).toContain("kcq-game-log__line--actor-enemy");
        expect(html).toContain("  -> skunkette1: GRAZE");
        expect(html).toContain("    ↳ skunkette2 took 24 damage.");
        expect(html).toContain("    ↳ skunkette2 was defeated.");
    });

    it("has an explicit CSS class mapping for every SemanticStyle", () => {
        const styles = [
            "actor-ko", "actor-matsuko", "actor-hinari", "actor-enemy",
            "intent-miss", "intent-graze", "intent-hit", "intent-crit",
            "binding-none", "binding-light", "binding-moderate", "binding-heavy",
            "binding-severe", "binding-overwhelming", "binding-max",
            "accuracy-good", "accuracy-caution", "accuracy-poor", "accuracy-very-poor",
            "encounter-separator", "phase-separator", "current-log-action",
            "transient-highlight",
        ] satisfies SemanticStyle[];

        expect(Object.keys(GAME_LOG_SEMANTIC_CLASSES)).toEqual(styles);
        expect(Object.values(GAME_LOG_SEMANTIC_CLASSES).every((value) =>
            value.startsWith("kcq-game-log__line--"))).toBe(true);
    });

    it("renders complete line text without truncation markup", () => {
        const html = renderGameLog();

        expect(html).toContain("skunkette2 took 24 damage.");
        expect(html).not.toContain("title=");
        expect(html).not.toContain("…");
    });

    it("uses the production panel for the Game Log debug entry", () => {
        const html = renderToString(() => createComponent(DevApp, { initialPanel: "log" as const }));

        expect(html).toContain("class=\"kcq-game-log\"");
        expect(html).toContain("kcq-combat-header--subscreen");
        expect(html).toContain("kcq-combat-header__breadcrumb");
        expect(html).not.toContain("kcq-combat-header__settings");
        expect(html).not.toContain("Gallery placeholder");
        expect(html).not.toContain("reserved for a later UI implementation card");
    });
});
