import type { KCQCharacter } from "../../../../content";
import type { Presentation } from "../../../presentation/presentation";
import { PARTY_SIZE } from "../partySelection";

export function createPartySelectionViewModel(
    available: readonly KCQCharacter[], selected: readonly KCQCharacter[], presentation: Presentation,
) {
    return {
        title: presentation.ui("party.title"),
        instructions: presentation.ui("party.instructions", { count: PARTY_SIZE }),
        countLabel: presentation.ui("party.count", { selected: selected.length, count: PARTY_SIZE }),
        backLabel: presentation.ui("party.cancel"),
        continueLabel: presentation.ui("party.continue"),
        characters: available.map(id => ({
            id,
            name: presentation.entity(id),
            role: presentation.characterSelection(id, "role"),
            points: (["point1", "point2", "point3"] as const).map(point => presentation.characterSelection(id, point)),
            selected: selected.includes(id),
            disabled: !selected.includes(id) && selected.length >= PARTY_SIZE,
            selectionLabel: presentation.ui(selected.includes(id) ? "party.selected" : "party.unselected"),
        })),
    };
}

export type PartySelectionViewModel = ReturnType<typeof createPartySelectionViewModel>;
