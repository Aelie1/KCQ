import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import type { Buff } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { EnemyCard } from "../../src/ui/web/app/components/EnemyCard";
import { battleOverviewFixture as fixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { createEnemyCardViewModel } from "../../src/ui/web/app/viewModels/enemyCard";
import { stockStrings } from "../helpers/stockStrings";

const project = (buffs: Buff[], presentation = fixture.presentation) =>
    createEnemyCardViewModel({ ...fixture.state.enemies[0]!, buffs }, presentation);
const markup = (buffs: Buff[]) => renderToString(() => createComponent(EnemyCard, { enemy: project(buffs) }));

describe("permanent buff indicators", () => {
    it.each([8, 2, -3, 0, 1.5])("shows one icon with the actual signed hit modifier %s", hit => {
        const buff: Buff = { id: "custom-permanent", icon: "crown", modifiers: { hit, defense: 4 } };
        const before = JSON.stringify(buff);
        const p = new Presentation({ ...stockStrings, "buff.custom-permanent.name": "Might" });
        const model = project([buff], p);
        const signed = hit >= 0 ? `+${hit}` : String(hit);
        expect(model.effectDurations).toEqual([]);
        expect(model.permanentEffects).toEqual([{
            id: buff.id, icon: "crown", valueLabel: signed,
            accessibleLabel: `Might: ${p.modifier("hit")} ${signed}: ${p.modifier("defense")} +4`,
        }]);
        const html = renderToString(() => createComponent(EnemyCard, { enemy: model }));
        expect(html.match(/data-icon="crown"/g)).toHaveLength(1);
        expect(html).toContain(signed);
        expect(html).toContain('title="' + model.permanentEffects[0]!.accessibleLabel + '"');
        expect(html).not.toContain("kcq-duration-pips ");
        expect(html).not.toContain("kcq-enemy-card__temporary-effects");
        expect(JSON.stringify(buff)).toBe(before);
    });

    it("omits iconless permanent buffs and does not treat invalid durations as permanent", () => {
        const buffs: Buff[] = [
            { id: "no-icon", modifiers: { hit: 8 } },
            ...[0, -1, 1.5, Infinity, NaN].map(duration => ({ id: "invalid", icon: "sun" as const, duration })),
        ];
        const model = project(buffs);
        expect(model.permanentEffects).toEqual([]);
        expect(model.effectDurations).toEqual([]);
        expect(markup(buffs)).not.toContain("kcq-enemy-card__debuffs");
    });

    it("keeps duration counts independent when both groups share the row", () => {
        const buffs: Buff[] = [
            { id: "temporary", duration: 3, icon: "shield", modifiers: { hit: 7 } },
            { id: "empressMight", icon: "crown", modifiers: { hit: 8 } },
            { id: "goddessMight", icon: "sun", modifiers: { hit: 2 } },
        ];
        const model = project(buffs);
        expect(model.effectDurations).toMatchObject([{ id: "temporary", duration: 3 }]);
        expect(model.permanentEffects.map(effect => effect.valueLabel)).toEqual(["+8", "+2"]);
        const html = markup(buffs);
        expect(html.match(/data-icon="shield"/g)).toHaveLength(3);
        expect(html.match(/data-icon="crown"/g)).toHaveLength(1);
        expect(html.match(/data-icon="sun"/g)).toHaveLength(1);
        expect(html.indexOf("kcq-enemy-card__temporary-effects")).toBeLessThan(html.indexOf("kcq-enemy-card__permanent-effects"));
    });

    it("shows icon-only permanent effects without inventing a hit modifier", () => {
        const buffs: Buff[] = [{ id: "shield", icon: "shield", modifiers: { defense: 4 } }];
        const model = project(buffs);
        expect(model.permanentEffects[0]!.valueLabel).toBeUndefined();
        expect(model.permanentEffects[0]!.accessibleLabel).toContain("+4");
        expect(markup(buffs).match(/data-icon="shield"/g)).toHaveLength(1);
    });

    it.each(["tower_1", "tower_2", "tower_3", "outside"])("renders serialized encounter modifiers from %s", encounter => {
        const engine = createStockEngine(1);
        engine.loadCharacter("ko"); engine.loadEncounter(encounter);
        const state = engine.getGameState();
        for (const enemy of state.enemies) {
            const model = createEnemyCardViewModel(enemy, fixture.presentation);
            const permanent = enemy.buffs.filter(buff => buff.icon && buff.duration === undefined);
            expect(permanent.length).toBeGreaterThan(0);
            expect(model.permanentEffects.map(effect => effect.valueLabel))
                .toEqual(permanent.map(buff => `+${buff.modifiers!.hit}`));
            const html = renderToString(() => createComponent(EnemyCard, { enemy: model }));
            for (const buff of permanent) expect(html).toContain('data-icon="' + buff.icon + '"');
        }
    });
});
