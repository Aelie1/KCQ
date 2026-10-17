import { characterCatalogs, type KCQCharacter } from "../../../content";

// Read the content registry without constructing an engine for the selection screen.
export const availableCharacters: readonly KCQCharacter[] = Object.keys(characterCatalogs) as KCQCharacter[];
export const PARTY_SIZE = 3;

export function isPlayableCharacter(id: string): id is KCQCharacter {
    return Object.hasOwn(characterCatalogs, id);
}

export function isValidParty(party: readonly string[]): party is readonly KCQCharacter[] {
    return party.length === PARTY_SIZE && new Set(party).size === PARTY_SIZE && party.every(isPlayableCharacter);
}
