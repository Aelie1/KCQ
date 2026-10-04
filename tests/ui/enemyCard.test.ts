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
});
