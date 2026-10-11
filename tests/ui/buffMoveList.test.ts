import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import type { Buff } from "../../src/engine/public/types";
import { Presentation } from "../../src/ui/presentation/presentation";
import { EffectPreview } from "../../src/ui/web/app/components/EffectPreview";
import { CharacterDetailsPanel } from "../../src/ui/web/app/panels/CharacterDetailsPanel";
import { EnemyDetailsPanel } from "../../src/ui/web/app/panels/EnemyDetailsPanel";
import { characterDetailsFixture } from "../../src/ui/web/app/fixtures/characterDetails";
import { enemyDetailsFixture } from "../../src/ui/web/app/fixtures/enemyDetails";
import { createEffectDetail } from "../../src/ui/web/app/viewModels/characterDetails";
import { createEffectPreviewViewModels } from "../../src/ui/web/app/viewModels/effectPreviews";
import { projectBuffMoveList } from "../../src/ui/web/app/viewModels/buffMoveList";
import { stockStrings } from "../helpers/stockStrings";

const burnout: Buff = { id: "burnout", moveList: {
    addedMoves: ["punch", "kick"], blockedMoves: ["whiteFlame", "immolation"],
} };
const p = new Presentation(stockStrings);
const positive = (label: string) => ({ label, tone: "success" });
const negative = (label: string) => ({ label, tone: "danger" });

describe("buff move-list descriptions", () => {
    it.each([
        [true, true], [true, false], [false, true], [false, false],
    ])("handles allow=%s and block=%s independently in previews and Details", (allow, block) => {
        const strings = { ...stockStrings };
        if (!allow) delete strings["buff.burnout.allow"];
        if (!block) delete strings["buff.burnout.block"];
        const presentation = new Presentation(strings);
        const expected = [
            ...(allow ? [positive("Adds Basic Moves")] : [positive("Add Punch"), positive("Add Kick")]),
            ...(block ? [negative("Seals Flame Moves")] : [negative("Block White Flame"), negative("Block Immolation")]),
        ];
        const before = JSON.stringify(burnout);
        const [effect] = createEffectPreviewViewModels([
            { type: "buff", target: "matsuko", operation: "add", buff: burnout },
        ], { presentation });
        expect(effect).toMatchObject({ moveList: expected });
        expect(createEffectDetail(burnout, characterDetailsFixture.state, presentation).details).toEqual(expected);
        const html = renderToString(() => createComponent(EffectPreview, { effect }));
        expect(html.match(/kcq-status-chip--success/g)).toHaveLength(allow ? 1 : 2);
        expect(html.match(/kcq-status-chip--danger/g)).toHaveLength(block ? 1 : 2);
        expect(html).not.toContain("buff.burnout.allow");
        expect(html).not.toContain("buff.burnout.block");
        expect(JSON.stringify(burnout)).toBe(before);
    });

    it("uses optional lookup and does not fabricate chips for empty categories or removals", () => {
        expect(p.buffMoveList("burnout", "allow")).toBe("Adds Basic Moves");
        expect(p.buffMoveList("unknown", "block")).toBeUndefined();
        expect(projectBuffMoveList({ id: "burnout" }, p)).toEqual([]);
        expect(projectBuffMoveList({ id: "burnout", moveList: { addedMoves: [], blockedMoves: [] } }, p)).toEqual([]);
        expect(createEffectPreviewViewModels([
            { type: "buff", target: "matsuko", operation: "remove", buff: burnout },
        ], { presentation: p })[0]).toMatchObject({ moveList: [] });
        expect(projectBuffMoveList({ id: "pounce", moveList: { addedMoves: ["throwOff"] } }, p))
            .toEqual([positive("Adds Throw Off")]);
    });

    it("retains per-move filtering when an optional key is missing", () => {
        const strings = { ...stockStrings };
        delete strings["buff.burnout.block"];
        expect(projectBuffMoveList(burnout, new Presentation(strings), new Set(["immolation"])))
            .toEqual([positive("Adds Basic Moves"), negative("Block Immolation")]);
        expect(projectBuffMoveList(burnout, p, new Set()))
            .toEqual([positive("Adds Basic Moves")]);
    });

    it("can expand authored categories into localized move references without live state", () => {
        const translated = new Presentation({ ...stockStrings, "move.whiteFlame.name": "Flamme blanche" });
        expect(projectBuffMoveList(burnout, translated, undefined, true)).toEqual([
            { label: "Add Punch", tone: "success", move: "punch" },
            { label: "Add Kick", tone: "success", move: "kick" },
            { label: "Block Flamme blanche", tone: "danger", move: "whiteFlame" },
            { label: "Block Immolation", tone: "danger", move: "immolation" },
        ]);
        expect(projectBuffMoveList({ id: "unknown" }, translated, undefined, true)).toEqual([]);
    });

    it("renders the same consolidated category chips in Character and Enemy Details", () => {
        const character = characterDetailsFixture;
        const enemy = enemyDetailsFixture;
        const html = [
            renderToString(() => createComponent(CharacterDetailsPanel, { ...character, state: {
                ...character.state, characters: character.state.characters.map(c =>
                    c.id === character.focusedCharacterId ? { ...c, buffs: [burnout] } : c),
            } })),
            renderToString(() => createComponent(EnemyDetailsPanel, { ...enemy, state: {
                ...enemy.state, enemies: enemy.state.enemies.map(e =>
                    e.id === enemy.enemyId ? { ...e, buffs: [burnout] } : e),
            } })),
        ];
        for (const raw of html) {
            const markup = raw.replace(/<!--.*?-->/g, "");
            expect(markup).toMatch(/kcq-status-chip--success[^>]*>Adds Basic Moves/);
            expect(markup).toMatch(/kcq-status-chip--danger[^>]*>Seals Flame Moves/);
            expect(markup).not.toContain("Block White Flame");
        }
    });
});
