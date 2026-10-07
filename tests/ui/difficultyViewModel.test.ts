import { describe, expect, it } from "vitest";
import { englishStrings } from "../../localization/en";
import { createEngine } from "../../src/engine/public/engine";
import type { DifficultyId } from "../../src/engine/public/types";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createDifficultySelectViewModel } from "../../src/ui/web/app/viewModels/difficulty";
import { createEffectPreviewViewModels } from "../../src/ui/web/app/viewModels/effectPreviews";

const library = createEngine().getLibrary();
const presentation = new Presentation(englishStrings);
const difficulties: DifficultyId[] = ["casual", "standard", "veteran", "extreme", "mythic"];
const ruleOrder = ["skunkette", "skunk", "fairy", "queen", "rainmaker"];

describe("difficulty select view model", () => {
    it.each(difficulties)("localizes choices, selection and description for %s", difficulty => {
        const model = createDifficultySelectViewModel(library, "plains_1", difficulty, presentation);
        expect(model.encounterId).toBe("plains_1");
        expect(model.encounterName).toBe(presentation.encounter("plains_1"));
        expect(model.selectedDifficulty).toBe(difficulty);
        expect(model.selectedDifficultyName).toBe(presentation.difficulty(difficulty));
        expect(model.description).toBe(presentation.difficulty(difficulty, "desc"));
        expect(model.choices).toEqual(difficulties.map(id => ({
            id, label: presentation.difficulty(id), selected: id === difficulty,
        })));
    });

    it.each([
        ["casual", true, false], ["standard", false, false], ["veteran", true, false],
        ["extreme", true, true], ["mythic", true, true],
    ] as const)("shows only the specified cards for %s", (difficulty, global, special) => {
        const model = createDifficultySelectViewModel(library, "forest_3", difficulty, presentation);
        expect(Boolean(model.globalEffects)).toBe(global);
        expect(Boolean(model.specialRules)).toBe(special);
        if (!global) expect(model).not.toHaveProperty("globalEffects");
        if (!special) expect(model).not.toHaveProperty("specialRules");
    });

    it.each(["casual", "veteran", "extreme", "mythic"] as const)("previews %s authoritative modifiers with a scoped recipient", difficulty => {
        const model = createDifficultySelectViewModel(library, "plains_1", difficulty, presentation);
        const target = difficulty === "casual" ? "allies" : "enemies";
        const modifiers = difficulty === "casual"
            ? library.difficulties[difficulty].playerModifiers : library.difficulties[difficulty].enemyModifiers;
        expect(model.globalEffects?.recipientName).toBe(presentation.entity(target));
        expect(model.globalEffects?.effects).toEqual(createEffectPreviewViewModels([{
            type: "buff", operation: "add", target, buff: { id: "difficultyModifier", modifiers },
        }], { presentation, scopeTarget: target }, "difficulty"));
        const effect = model.globalEffects?.effects[0];
        expect(effect).toMatchObject({ kind: "buff", tone: "success", name: presentation.buff("difficultyModifier") });
        expect(effect).not.toHaveProperty("recipient");
        if (effect?.kind !== "buff") throw new Error("Expected buff preview");
        expect(effect.modifiers.map(({ value, signedValue }) => ({ value, signedValue }))).toEqual(
            Object.values(modifiers).map(value => ({ value, signedValue: "+" + value })),
        );
        expect(effect.modifiers.map(({ label }) => label)).toEqual(
            difficulty === "casual" ? ["HIT", "ESC"] : ["POT"],
        );
    });

    it("uses supplied public modifier values instead of duplicating the engine numbers", () => {
        const altered = structuredClone(library);
        altered.difficulties.casual.playerModifiers = { hit: 4, escape: 3 };
        altered.difficulties.extreme.enemyModifiers = { potency: 5 };
        const casual = createDifficultySelectViewModel(altered, "plains_1", "casual", presentation).globalEffects?.effects[0];
        const extreme = createDifficultySelectViewModel(altered, "plains_1", "extreme", presentation).globalEffects?.effects[0];
        expect(casual).toMatchObject({ modifiers: [{ value: 4, signedValue: "+4" }, { value: 3, signedValue: "+3" }] });
        expect(extreme).toMatchObject({ modifiers: [{ value: 5, signedValue: "+5" }] });
    });

    it.each(["extreme", "mythic"] as const)("filters %s rules to unique relevant enemy definitions in canonical order", difficulty => {
        const expected: Record<string, string[]> = {
            plains_1: ["skunkette"], plains_2: ["skunkette", "skunk"],
            forest_1: ["skunkette", "fairy"], forest_2: ["skunkette", "skunk", "fairy"],
        };
        for (const [encounterId, enemyIds] of Object.entries(expected)) {
            const rows = createDifficultySelectViewModel(library, encounterId, difficulty, presentation).specialRules?.rows;
            expect(rows).toEqual(enemyIds.map(enemyId => ({
                enemyId, enemyName: presentation.enemyDefinition(enemyId),
                description: englishStrings["difficulty." + difficulty + "." + enemyId],
            })));
        }
        const reordered = structuredClone(library);
        reordered.encounters.plains_1.enemies = [
            { defId: "rainmaker", id: "namedRainmaker" }, { defId: "fairy" },
            { defId: "skunkette" }, { defId: "fairy" }, { defId: "unrelated" }, { defId: "skunk" },
        ];
        expect(createDifficultySelectViewModel(reordered, "plains_1", difficulty, presentation).specialRules?.rows.map(({ enemyId }) => enemyId))
            .toEqual(["skunkette", "skunk", "fairy", "rainmaker"]);
    });

    it.each(["extreme", "mythic"] as const)("shows the whole family with exact localized %s rules for every Queen encounter", difficulty => {
        for (const encounter of Object.values(library.encounters).filter(encounter => encounter.enemies.some(enemy => enemy.defId === "queen"))) {
            const model = createDifficultySelectViewModel(library, encounter.id, difficulty, presentation);
            expect(model.specialRules?.rows).toEqual(ruleOrder.map(enemyId => ({
                enemyId, enemyName: presentation.enemyDefinition(enemyId),
                description: englishStrings["difficulty." + difficulty + "." + enemyId],
            })));
            expect(model.specialRules?.rows[3].enemyName).toBe("Skunk Queen");
        }
    });

    it("omits a rules shell when an encounter has no curated rules", () => {
        const altered = structuredClone(library);
        altered.encounters.plains_1.enemies = [{ defId: "unrelated" }];
        expect(createDifficultySelectViewModel(altered, "plains_1", "extreme", presentation)).not.toHaveProperty("specialRules");
    });

    it("keeps every screen label and rule label in Presentation", () => {
        const localized = new Presentation(Object.fromEntries(Object.keys(englishStrings).map(key => [key, "translated:" + key])));
        const model = createDifficultySelectViewModel(library, "forest_3", "mythic", localized);
        expect(model.encounterName).toBe("translated:encounter.forest_3.name");
        expect(model.description).toBe("translated:difficulty.mythic.desc");
        expect(model.choices.every(choice => choice.label.startsWith("translated:"))).toBe(true);
        expect(Object.values(model.labels).every(label => label.startsWith("translated:"))).toBe(true);
        expect(model.globalEffects?.recipientName).toBe("translated:entity.enemies.name");
        expect(model.globalEffects?.effects[0]).toMatchObject({ name: "translated:buff.difficultyModifier.name" });
        expect(model.specialRules?.rows.every(row => row.enemyName.startsWith("translated:") && row.description.startsWith("translated:"))).toBe(true);
    });
});
