import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { EnemyCard } from "../../src/ui/web/app/components/EnemyCard";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { createEnemyCardViewModel } from "../../src/ui/web/app/viewModels/enemyCard";

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
});
