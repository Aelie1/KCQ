import { describe, expect, it } from "vitest";
import { characterCatalogs, type KCQCharacter } from "../../src/content";
import { getStringTable } from "../../localization";
import { Presentation } from "../../src/ui/presentation/presentation";
import { availableCharacters, isValidParty } from "../../src/ui/web/app/partySelection";
import { createPartySelectionViewModel } from "../../src/ui/web/app/viewModels/partySelection";

const presentation = new Presentation(getStringTable("en", availableCharacters));

describe("party selection data", () => {
    it("derives the roster from content and supplies localized identity, role and three points", () => {
        expect(availableCharacters).toEqual(Object.keys(characterCatalogs));
        const model = createPartySelectionViewModel(availableCharacters, availableCharacters, presentation);
        for (const character of model.characters) {
            expect(character.name).toBe(presentation.entity(character.id));
            expect(character.role).toBe(presentation.characterSelection(character.id, "role"));
            expect(character.points).toHaveLength(3);
            expect([character.name, character.role, ...character.points].join(" ")).not.toContain("[entity.");
            expect(character.selected).toBe(true);
        }
    });

    it("requires exactly three distinct registered characters", () => {
        expect(isValidParty(["ko", "matsuko", "hinari"])).toBe(true);
        for (const party of [[], ["ko"], ["ko", "matsuko"], ["ko", "ko", "hinari"], ["ko", "matsuko", "missing"], ["ko", "matsuko", "hinari", "ko"]]) {
            expect(isValidParty(party)).toBe(false);
        }
    });

    it("shows additional roster entries and makes room for them by deselecting a member", () => {
        const extra = "future" as KCQCharacter;
        const available = [...availableCharacters, extra];
        const full = createPartySelectionViewModel(available, availableCharacters, presentation);
        expect(full.characters).toHaveLength(4);
        expect(full.characters[3]).toMatchObject({ id: extra, selected: false, disabled: true });
        expect(full.characters[0]).toMatchObject({ selected: true, disabled: false });
        const partial = createPartySelectionViewModel(available, ["matsuko", "hinari"], presentation);
        expect(partial.characters[3]).toMatchObject({ selected: false, disabled: false });
    });
});
