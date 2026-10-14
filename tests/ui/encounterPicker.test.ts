import { describe, expect, it } from "vitest";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createEncounterPickerViewModel } from "../../src/ui/web/app/viewModels/encounters";
import { stockStrings } from "../helpers/stockStrings";

const library = createStockEngine().getLibrary();
const presentation = new Presentation(stockStrings);

describe("campaign encounter picker", () => {
    it("includes locked encounters in progression order and keeps unlocked summaries unchanged", () => {
        const campaign = library.campaigns.skunk;
        const model = createEncounterPickerViewModel(library, presentation, campaign, { plains_1: "mythic" }, ["plains_2"]);
        const revealed = createEncounterPickerViewModel(library, presentation, campaign, { plains_1: "mythic" }, [], true);
        expect(model.encounters.map(({ id }) => id)).toEqual(revealed.encounters.map(({ id }) => id));
        expect(model.encounters.filter(encounter => !encounter.locked).map(({ id }) => id)).toEqual(["prologue", "plains_2"]);
        for (const encounter of model.encounters.filter(encounter => !encounter.locked)) {
            expect(encounter).toEqual(revealed.encounters.find(({ id }) => id === encounter.id));
        }
        expect(model.encounters.find(({ id }) => id === "plains_1")?.bestClear).toBeUndefined();
        expect(revealed.encounters.every(encounter => !encounter.locked)).toBe(true);
    });

    it.each([
        ["Ko-chan's First Fight", "????????? ????? ?????"],
        ["Level 42: (Final!)", "????? ??? ????????"],
        ["\u00c9t\u00e9\t\u7b2c2\u7ae0\n\ud83d\udc09!  End", "???\t???\n??  ???"],
    ])("masks every non-whitespace character in the localized title %s", (title, masked) => {
        const localized = new Presentation({ ...stockStrings, "encounter.plains_1.name": title });
        const model = createEncounterPickerViewModel(library, localized, library.campaigns.skunk);
        expect(model.encounters.find(({ id }) => id === "plains_1")?.name).toBe(masked);
        const revealed = createEncounterPickerViewModel(library, localized, library.campaigns.skunk, {}, [], true);
        expect(revealed.encounters.find(({ id }) => id === "plains_1")?.name).toBe(title);
    });

    it("uses both campaign outcome maps for branches and merges, independently of catalog order or unlocks", () => {
        const campaign = { id: "future", initial: ["outside"],
            victory: { outside: ["forest_1", "plains_1"], forest_1: ["plains_2", "plains_2"] },
            defeat: { plains_1: ["plains_2", "missing"] } };
        const model = createEncounterPickerViewModel(library, presentation, campaign, {}, ["prologue", "forest_1"]);
        expect(model.encounters.map(({ id }) => id)).toEqual(["outside", "plains_1", "forest_1", "plains_2"]);
        expect(model.encounters.map(({ locked }) => locked)).toEqual([false, true, false, true]);
        const revealed = createEncounterPickerViewModel(library, presentation, campaign, {}, [], true);
        expect(revealed.encounters).toHaveLength(Object.keys(library.encounters).length);
        expect(revealed.encounters.every(encounter => !encounter.locked && encounter.name === presentation.encounter(encounter.id))).toBe(true);
    });

    it("includes each encounter once when campaign progression loops", () => {
        const campaign = { id: "loop", initial: ["plains_1"],
            victory: { plains_1: ["plains_2"], plains_2: ["plains_1"] }, defeat: {} };
        expect(createEncounterPickerViewModel(library, presentation, campaign).encounters.map(({ id }) => id))
            .toEqual(["plains_1", "plains_2"]);
    });
});
