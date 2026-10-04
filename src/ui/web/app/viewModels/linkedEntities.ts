import type {
    Buff,
    Character,
    EntityId,
    GameState,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";

export type PlayerTone = "hinari" | "ko" | "matsuko" | "neutral";
export type LinkedEntityTone = PlayerTone;

export interface LinkedEntityViewModel {
    accessibleLabel: string;
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
            accessibleLabel: presentation.ui("linkedEntity.linkedTo", {
                character: presentation.entity(id),
            }),
            id,
            name: presentation.entity(id),
            tone: playerTone(id),
        });
    }

    return links;
}

export function projectLinkedEntity(
    id: EntityId,
    state: Pick<GameState, "characters" | "enemies">,
    presentation: Presentation,
): LinkedEntityViewModel | undefined {
    const character = state.characters.find(({ id: characterId }) => characterId === id);
    if (character) {
        return {
            accessibleLabel: presentation.ui("linkedEntity.linkedTo", {
                character: presentation.entity(id),
            }),
            id,
            name: presentation.entity(id),
            tone: playerTone(character.id),
        };
    }
    if (state.enemies.some(({ id: enemyId }) => enemyId === id)) {
        return {
            accessibleLabel: presentation.ui("linkedEntity.linkedTo", {
                character: presentation.entity(id),
            }),
            id,
            name: presentation.entity(id),
            tone: "neutral",
        };
    }
    return undefined;
}

export function playerTone(id: EntityId): PlayerTone {
    switch (id) {
        case "ko":
        case "matsuko":
        case "hinari":
            return id;
        default:
            return "neutral";
    }
}
