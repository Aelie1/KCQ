import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { EnemyCard } from "../../src/ui/web/app/components/EnemyCard";
import { IntentRow } from "../../src/ui/web/app/components/IntentRow";
import { TargetHeader } from "../../src/ui/web/app/components/TargetHeader";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { createEnemyCardViewModel } from "../../src/ui/web/app/viewModels/enemyCard";
import { createIntentViewModel } from "../../src/ui/web/app/viewModels/intentRow";

describe("enemy card", () => {
    it("renders only actual intention rows without an empty placeholder slot", () => {
        const fixture = battleOverviewFixture;
        const enemy = fixture.state.enemies[0];
        const model = createEnemyCardViewModel(
            enemy,
            fixture.presentation,
            fixture.state.characters,
        );
        const html = renderToString(() => createComponent(EnemyCard, { enemy: model }));

        expect(model.visibleIntentions).toHaveLength(1);
        expect((html.match(/kcq-enemy-card__intent-slot/g) ?? [])).toHaveLength(1);
        expect(html).not.toContain("kcq-enemy-card__empty-intent");
    });

    it("keeps compact linked-player icons beside shrinkable enemy names", () => {
        const fixture = battleOverviewFixture;
        const enemy = {
            ...fixture.state.enemies[0],
            intentions: [],
            buffs: [
                { id: "pounce", linkedEntity: "ko" },
                { id: "pounce", linkedEntity: "matsuko" },
            ],
        };
        const model = createEnemyCardViewModel(
            enemy, fixture.presentation, fixture.state.characters,
        );
        const cardHtml = renderToString(() => createComponent(EnemyCard, { enemy: model }));
        const targetHtml = renderToString(() => createComponent(TargetHeader, {
            target: {
                id: enemy.id,
                target: enemy.id,
                name: model.name,
                valid: true,
                effects: [],
                linkedEntities: model.linkedEntities,
                tone: "neutral",
            },
        }));
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const iconRule = css.match(/\.kcq-linked-entity-chip--icon-only\s*\{([^}]*)\}/)?.[1] ?? "";
        const enemyNameRule = css.match(/\.kcq-enemy-card__name\s*\{([^}]*)\}/)?.[1] ?? "";
        const targetNameRule = css.match(/\.kcq-target-header__name\s*\{([^}]*)\}/)?.[1] ?? "";

        for (const html of [cardHtml, targetHtml]) {
            expect(html).toContain('aria-label="Linked to Ko-chan"');
            expect(html).toContain('aria-label="Linked to Matsuko"');
            expect(html).not.toContain(">Ko-chan</span>");
            expect(html).not.toContain(">Matsuko</span>");
        }
        expect(iconRule).toContain("flex: 0 0 auto");
        expect(enemyNameRule).toContain("flex: 1 1 auto");
        expect(enemyNameRule).toContain("text-overflow: ellipsis");
        expect(targetNameRule).toContain("min-width: 0");
        expect(targetNameRule).toContain("text-overflow: ellipsis");
    });

    it("colors intention targets from EntityId and outcomes from HitBand", () => {
        const fixture = battleOverviewFixture;
        const multiTarget = createIntentViewModel({
            move: "latexSpray",
            targets: [
                { target: "ko", band: "none", effects: [] },
                { target: "matsuko", band: "none", effects: [] },
                { target: "hinari", band: "none", effects: [] },
                { target: "unknown-target", band: "none", effects: [] },
            ],
            effects: [],
        }, fixture.presentation);
        const targetsHtml = renderToString(() => createComponent(IntentRow, { intent: multiTarget }));

        expect(multiTarget.targets?.map(({ id, tone }) => [id, tone])).toEqual([
            ["ko", "ko"],
            ["matsuko", "matsuko"],
            ["hinari", "hinari"],
            ["unknown-target", "neutral"],
        ]);
        expect(targetsHtml).toContain("kcq-intent-row__target--ko");
        expect(targetsHtml).toContain("kcq-intent-row__target--matsuko");
        expect(targetsHtml).toContain("kcq-intent-row__target--hinari");
        expect(targetsHtml).toContain("kcq-intent-row__target--neutral");

        for (const band of ["miss", "graze", "hit", "crit"] as const) {
            const intent = createIntentViewModel({
                move: "latexSpray",
                targets: [{ target: "ko", band, effects: [] }],
                effects: [],
            }, fixture.presentation);
            const html = renderToString(() => createComponent(IntentRow, { intent }));
            expect(html).toContain(`kcq-status-chip--outcome-${band}`);
        }

        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const outcomeColors = {
            miss: "var(--kcq-text-muted)",
            graze: "var(--kcq-state-warning)",
            hit: "var(--kcq-binding-heavy)",
            crit: "var(--kcq-state-danger)",
        } as const;
        for (const [band, color] of Object.entries(outcomeColors)) {
            const rule = css.match(new RegExp(`\\.kcq-status-chip--outcome-${band}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
            expect(rule).toContain(`color: ${color}`);
        }
    });

    it("keeps short intentions inline and wraps long target groups without displacing outcomes", () => {
        const fixture = battleOverviewFixture;
        const shortIntent = createIntentViewModel({
            move: "pounce",
            targets: [{ target: "ko", band: "graze", effects: [] }],
            effects: [],
        }, fixture.presentation);
        const longIntent = {
            ...shortIntent,
            moveLabel: "Empowering Magic",
            targetLabel: "Skunk Queen",
            targets: [{ id: "skunketteQueen", label: "Skunk Queen", tone: "neutral" as const }],
            outcome: "hit" as const,
            outcomeLabel: "Hit",
        };
        const shortHtml = renderToString(() => createComponent(IntentRow, { intent: shortIntent }));
        const longHtml = renderToString(() => createComponent(IntentRow, { intent: longIntent }));
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const rowRule = css.match(/\.kcq-intent-row\s*\{([^}]*)\}/)?.[1] ?? "";
        const contentRule = css.match(/\.kcq-intent-row__content\s*\{([^}]*)\}/)?.[1] ?? "";
        const moveRule = css.match(/\.kcq-intent-row__move\s*\{([^}]*)\}/)?.[1] ?? "";
        const targetGroupRule = css.match(/\.kcq-intent-row__target-group\s*\{([^}]*)\}/)?.[1] ?? "";
        const intentionsRule = css.match(/\.kcq-enemy-card__intentions\s*\{([^}]*)\}/)?.[1] ?? "";
        const slotRule = css.match(/\.kcq-enemy-card__intent-slot\s*\{([^}]*)\}/)?.[1] ?? "";

        for (const html of [shortHtml, longHtml]) {
            expect(html).toMatch(/kcq-intent-row__content[^>]*>.*kcq-intent-row__move/s);
            expect(html).toMatch(/kcq-intent-row__target-group[^>]*>.*kcq-intent-row__arrow.*kcq-intent-row__targets/s);
        }
        expect(shortHtml).toContain("Pounce");
        expect(shortHtml).toContain("Ko-chan");
        expect(longHtml).toContain("Empowering Magic");
        expect(longHtml).toContain("Skunk Queen");
        expect(longHtml).toContain("kcq-status-chip--outcome-hit");
        expect(rowRule).toContain("grid-template-columns: minmax(0, 1fr) auto");
        expect(rowRule).toContain("min-height: 20px");
        expect(rowRule).not.toMatch(/(^|\n)\s*height:/);
        expect(rowRule).not.toContain("white-space: nowrap");
        expect(contentRule).toContain("flex-wrap: wrap");
        expect(moveRule).toContain("flex: 0 0 auto");
        expect(targetGroupRule).toContain("flex: 0 0 auto");
        expect(targetGroupRule).toContain("white-space: nowrap");
        expect(css).toMatch(/\.kcq-intent-row>\.kcq-status-chip\s*\{[^}]*align-self: start[^}]*margin-top: 1px/s);
        expect(intentionsRule).toContain("grid-auto-rows: minmax(20px, auto)");
        expect(slotRule).toContain("min-height: 20px");
        expect(slotRule).not.toMatch(/(^|\n)\s*height:/);
    });

    it("renders multiple intentions in separate content-driven slots", () => {
        const fixture = battleOverviewFixture;
        const enemy = fixture.state.enemies.find(({ intentions }) => intentions.length > 1);
        expect(enemy).toBeDefined();

        const model = createEnemyCardViewModel(
            enemy!, fixture.presentation, fixture.state.characters,
        );
        const html = renderToString(() => createComponent(EnemyCard, { enemy: model }));

        expect(model.visibleIntentions.length).toBeGreaterThan(1);
        expect((html.match(/kcq-enemy-card__intent-slot/g) ?? [])).toHaveLength(model.visibleIntentions.length);
        expect((html.match(/kcq-intent-row__content/g) ?? [])).toHaveLength(model.visibleIntentions.length);
    });

    it("collapses a complete current-party intention to localized ALL only on overview cards", () => {
        const fixture = battleOverviewFixture;
        const enemy = {
            ...fixture.state.enemies[0],
            intentions: [{
                move: "latexSpray",
                targets: fixture.state.characters.map(({ id }) => ({
                    target: id,
                    band: "none" as const,
                    effects: [],
                })),
                effects: [],
            }],
        };
        const overview = createEnemyCardViewModel(
            enemy, fixture.presentation, fixture.state.characters,
        );
        const overviewHtml = renderToString(() => createComponent(EnemyCard, { enemy: overview }));
        const general = createIntentViewModel(enemy.intentions[0], fixture.presentation);

        expect(overview.intentions[0]).toMatchObject({
            moveLabel: "Latex Spray",
            allTargetsLabel: "ALL",
            targetLabel: "ALL",
        });
        expect(overview.intentions[0].targets).toBeUndefined();
        expect(overviewHtml).toContain("ALL");
        expect(overviewHtml).not.toContain("Ko-chan");
        expect(general.targets?.map(({ label }) => label)).toEqual([
            "Ko-chan", "Matsuko", "Hinari",
        ]);
    });

    it("keeps partial overview intentions as EntityId-colored player names", () => {
        const fixture = battleOverviewFixture;
        const enemy = {
            ...fixture.state.enemies[0],
            intentions: [{
                move: "latexSpray",
                targets: [
                    { target: "ko", band: "none" as const, effects: [] },
                    { target: "matsuko", band: "none" as const, effects: [] },
                ],
                effects: [],
            }],
        };
        const model = createEnemyCardViewModel(
            enemy, fixture.presentation, fixture.state.characters,
        );
        const html = renderToString(() => createComponent(EnemyCard, { enemy: model }));

        expect(model.intentions[0].allTargetsLabel).toBeUndefined();
        expect(model.intentions[0].targets?.map(({ id, tone }) => [id, tone])).toEqual([
            ["ko", "ko"],
            ["matsuko", "matsuko"],
        ]);
        expect(html).toContain("Ko-chan");
        expect(html).toContain("Matsuko");
        expect(html).toContain("kcq-intent-row__target--ko");
        expect(html).toContain("kcq-intent-row__target--matsuko");
        expect(html).not.toContain("ALL");
    });
});
