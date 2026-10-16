import { describe, expect, it } from "vitest";
import type { Intention } from "../../src/engine/public/types";
import { Presentation } from "../../src/ui/presentation/presentation";
import { battleOverviewFixture as fixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { createIntentPreviewRows } from "../../src/ui/web/app/viewModels/intentPreview";
import { stockStrings } from "../helpers/stockStrings";

const project = (intention: Intention, presentation = fixture.presentation) =>
    createIntentPreviewRows(intention, presentation, "skunkette1");

describe("wide enemy intention previews", () => {
    it("formats buffs, all modifiers, healing, summons and other public effects without inventing accuracy", () => {
        const intention: Intention = { move: "skunkPerfume", resolved: false, targets: [], effects: [
            { type: "buff", target: "skunkette1", operation: "add", buff: {
                id: "latexMist", severity: 4, duration: 2, modifiers: { hit: 2, defense: -1, escape: -3 },
                statuses: [{ id: "blinded", value: 2 }], moveList: { addedMoves: ["pounce"] },
            } },
            { type: "damage", target: "skunkette1", amount: -50 },
            { type: "enemy", target: "fairy", operation: "spawn" },
            { type: "trap", trap: "trapPuddle", amount: 10 },
            { type: "data", target: "ko", name: "subspace", amount: 7 },
            { type: "refresh", target: "ko" },
            { type: "move", move: "latexSpray" },
        ] };
        const before = structuredClone(intention);
        const rows = project(intention);
        const labels = rows.flatMap(row => row.consequences).join(" | ");
        expect(rows.every(row => row.outcome === undefined)).toBe(true);
        expect(labels).toContain("Latex Mist IV");
        expect(labels).toContain("Accuracy +2");
        expect(labels).toContain("Defense -1");
        expect(labels).toContain("Escape -3");
        expect(labels).toContain("2 Rounds");
        expect(labels).toContain("Blinded");
        expect(labels).toContain("Add Pounce");
        expect(labels).toContain("Healing +50");
        expect(labels).toContain("Spawn Fairy");
        expect(labels).toContain("Amount 10");
        expect(labels).toContain("+7");
        expect(labels).toContain("Refresh");
        expect(labels).toContain("Move Latex Spray");
        expect(intention).toEqual(before);
    });

    it("preserves recipient changes, removals and unknown binding amounts", () => {
        const rows = project({ move: "latexSpray", resolved: true, targets: [{ target: "ko", band: "hit", effects: [
            { type: "binding", target: "ko", binding: "latexArms" },
            { type: "buff", target: "matsuko", operation: "remove", buff: { id: "latexMist", severity: 4 } },
        ] }], effects: [
            { type: "intention", target: "skunkette1", operation: "target", destination: "hinari" },
            { type: "enemy", target: "skunkette1", operation: "defeat" },
        ] });
        expect(rows.map(row => row.targets?.[0]?.id)).toEqual(["ko", "matsuko", "skunkette1"]);
        expect(rows[0]).toMatchObject({ outcome: "hit", resolved: true, consequences: ["Skunk Arms"] });
        expect(rows[1]!.outcome).toBeUndefined();
        expect(rows[1]!.consequences?.[0]).toMatch(/Remove.*Latex Mist IV/);
        expect(rows[2]!.consequences).toEqual(["Retarget Hinari", "Defeat"]);
    });

    it("uses localized labels and preserves a targetless accuracy roll", () => {
        const presentation = new Presentation({ ...stockStrings,
            "move.latexPuddle.name": "Flaque", "hitBand.graze.name": "Effleure", "ui.targeting.trapAmount": "Quantite {amount}",
        });
        const rows = project({ move: "latexPuddle", band: "graze", resolved: false, targets: [], effects: [
            { type: "trap", trap: "trapPuddle", amount: 9 },
        ] }, presentation);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ moveLabel: "Flaque", outcome: "graze", outcomeLabel: "Effleure" });
        expect(rows[0]!.consequences?.[0]).toContain("Quantite 9");
    });

    it("preserves a move with no targets or preview effects", () => {
        expect(project({ move: "callReinforcements", resolved: false, targets: [], effects: [] }))
            .toEqual([{ moveLabel: "Call Reinforcements", resolved: false, consequences: [] }]);
    });
});
