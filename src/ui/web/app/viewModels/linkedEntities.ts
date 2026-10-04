import type {
    Buff,
    Character,
    EntityId,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";

export type LinkedEntityTone = "hinari" | "ko" | "matsuko" | "neutral";

export interface LinkedEntityViewModel {
    id: EntityId;
    name: string;
    tone: LinkedEntityTone;
}

export function projectLinkedPlayers(
    buffs: readonly Buff[],
    characters: readonly Character[],
    presentation: Presentation,
): LinkedEntityViewModel[] {
    const charactersById = new Map(characters.map((character) => [character.id, character]));
    const seen = new Set<EntityId>();
    const links: LinkedEntityViewModel[] = [];

    for (const buff of buffs) {
        const id = buff.linkedEntity;
        if (id === undefined || seen.has(id) || !charactersById.has(id)) continue;

        seen.add(id);
        links.push({
            id,
            name: presentation.entity(id),
            tone: linkedEntityTone(id),
        });
    }

    return links;
}

function linkedEntityTone(id: EntityId): LinkedEntityTone {
    switch (id) {
        case "ko":
        case "matsuko":
        case "hinari":
            return id;
        default:
            return "neutral";
    }
}
