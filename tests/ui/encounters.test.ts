import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import type { Effect } from "../../src/engine/public/types";
import { englishStrings } from "../../localization/en";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createEncounterDetailsViewModel, createEncounterPickerViewModel, encounterStars } from "../../src/ui/web/app/viewModels/encounters";
import { createEffectPreviewViewModels } from "../../src/ui/web/app/viewModels/effectPreviews";
import { createTargetingViewModel } from "../../src/ui/web/app/viewModels/targeting";
import { targetingFixtures } from "../../src/ui/web/app/fixtures/targeting";

const presentation = new Presentation(englishStrings);
const library = createEngine().getLibrary();

describe("encounter catalog view models", () => {
    it("uses the public catalog in its authored order", () => {
        const model = createEncounterPickerViewModel(library, presentation);
        expect(model.encounters.map(({ id }) => id)).toEqual([
            "plains_1", "plains_2", "plains_3", "forest_1", "forest_2", "forest_3",
            "tower_1", "tower_2", "tower_3", "outside",
        ]);
        expect(model.encounters.map(({ name }) => name)).toEqual(
            Object.values(library.encounters).map(({ id }) => presentation.encounter(id)),
        );
        const reordered = { ...library, encounters: { outside: library.encounters.outside, plains_1: library.encounters.plains_1 } };
        expect(createEncounterPickerViewModel(reordered, presentation).encounters.map(({ id }) => id)).toEqual(["outside", "plains_1"]);
    });

    it.each([
        [1, "★☆☆☆☆"], [2, "★★☆☆☆"], [3, "★★★☆☆"], [4, "★★★★☆"], [5, "★★★★★"],
    ])("renders %i challenge stars in a five-star display", (stars, expected) => {
        expect(encounterStars(stars as number)).toBe(expected);
    });

    it("leaves encounters uncleared and accepts optional localized best clears", () => {
        expect(createEncounterPickerViewModel(library, presentation).encounters.every(({ bestClearLabel }) => bestClearLabel === "👑 ---")).toBe(true);
        const detail = createEncounterDetailsViewModel(library, "outside", presentation);
        expect(detail.bestClear).toBeUndefined();
        expect(detail.bestClearLabel).toBe("👑 ---");
        expect(createEncounterDetailsViewModel(library, "outside", presentation, "veteran").bestClearLabel).toBe("👑 Veteran");
        expect(createEncounterPickerViewModel(library, presentation, { outside: "standard" }).encounters.at(-1)?.bestClearLabel).toBe("👑 Standard");
    });

    it("derives generic enemy identities, ranks and HP from public references", () => {
        const detail = createEncounterDetailsViewModel(library, "forest_3", presentation);
        expect(detail.description).toBe(presentation.encounter("forest_3", "desc"));
        expect(detail.enemies.map(({ name }) => name)).toEqual(["Skunkette", "Skunkette", "Skunk Queen", "Fairy"]);
        detail.enemies.forEach((enemy, index) => {
            const ref = library.enemies[library.encounters.forest_3.enemies[index].defId];
            expect(enemy.hp).toBe(ref.hp);
            expect(enemy.hpLabel).toBe(`HP: ${ref.hp}`);
            expect(enemy.rank).toBe(ref.rank);
            expect(enemy.rankLabel).toBe(presentation.enemyRank(ref.rank));
            expect(enemy.name).not.toContain("{index}");
        });
        expect(detail.enemies.find(({ rank }) => rank === "boss")?.rankTone).toBe("danger");
        expect(presentation.enemyDefinition("skunk")).toBe("Skunk");
        expect(presentation.enemyDefinition("rainmaker")).toBe("Rainmaker");
        // Runtime numbering in combat is unchanged.
        expect(presentation.entity("skunkette2")).toBe("Skunkette 2");
    });

    it("uses named setup identities instead of their generic definition", () => {
        expect(createEncounterDetailsViewModel(library, "tower_1", presentation).enemies.map(({ name }) => name)).toEqual(["Skunk Empress", "Skunkette Queen"]);
        expect(createEncounterDetailsViewModel(library, "outside", presentation).enemies.map(({ name }) => name)).toEqual(["Skunk Goddess", "Skunk Empress", "Skunkette Queen"]);
    });

    it("formats only curated setup effects through the shared preview path", () => {
        for (const encounter of Object.values(library.encounters)) {
            const detail = createEncounterDetailsViewModel(library, encounter.id, presentation);
            expect(detail.effects).toEqual(createEffectPreviewViewModels(encounter.setup, { presentation }, "encounter-setup"));
            expect(JSON.stringify(detail)).not.toMatch(/\{index\}|\[entity\./);
        }
        const altered = { ...library, encounters: { ...library.encounters, plains_1: { ...library.encounters.plains_1, traps: ["trapPuddle"], setup: [] } } };
        expect(createEncounterDetailsViewModel(altered, "plains_1", presentation).effects).toEqual([]);
    });

    it("handles public pseudo recipients and all effect variants without a game state", () => {
        const effects: Effect[] = [
            { type: "binding", target: "allies", binding: "latexCollar", amount: 20 },
            { type: "buff", target: "empress", operation: "add", buff: { id: "empressMight", modifiers: { hit: 2, defense: 2 } } },
            { type: "trap", trap: "trapPuddle", amount: 100 },
            { type: "damage", target: "enemies", amount: 10 },
            { type: "enemy", target: "goddess", operation: "defeat" },
            { type: "move", move: "telekinesis" },
            { type: "data", target: "allies", name: "subspace", amount: 1 },
            { type: "refresh", target: "allies" },
            { type: "intention", target: "empress", operation: "cancel", amount: 0.5 },
        ];
        const previews = createEffectPreviewViewModels(effects, { presentation });
        expect(previews).toHaveLength(effects.length);
        expect(previews[0]).toMatchObject({ kind: "compact", payload: "Skunk Collar", details: ["Allies", "+20 Binding"] });
        expect(previews[1]).toMatchObject({ kind: "buff", recipient: "Skunk Empress" });
        expect(previews[2]).toMatchObject({ kind: "compact", payload: "Latex Puddle", details: ["Amount 100"] });
    });

    it("keeps targeting and standalone formatting on the same path", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const effects: Effect[] = [{ type: "trap", trap: "trapPuddle", amount: 12 }, { type: "intention", target: "skunketteQueen", operation: "cancel", amount: 0.5 }];
        const model = createTargetingViewModel(fixture.state, fixture.actorId, { ...fixture.action, effects }, fixture.presentation, fixture.actions, fixture.thresholds);
        expect(model.actionEffects).toEqual(createEffectPreviewViewModels(effects, { state: fixture.state, actions: fixture.actions, thresholds: fixture.thresholds, presentation: fixture.presentation }, "action-effect"));
    });
});
