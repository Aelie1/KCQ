import { characterCatalogs, type KCQCharacter } from "../content";
import type { DifficultyId } from "../engine/public/types";
import { stockCharacters } from "../stock";

/** One party and difficulty per invocation; party order is preserved. */
export interface FightConfigurationInput {
    party?: readonly KCQCharacter[];
    difficulty?: DifficultyId;
}

export interface FightConfiguration {
    party: readonly KCQCharacter[];
    difficulty: DifficultyId;
}

export const harnessDifficulties = ["casual", "standard", "veteran", "extreme", "mythic"] as const;

/** Content declaration order is the canonical order for generated combinations. */
export function enumerateHarnessParties(): KCQCharacter[][] {
    const characters = Object.keys(characterCatalogs) as KCQCharacter[];
    const parties: KCQCharacter[][] = [];
    for (let first = 0; first < characters.length - 2; first += 1) {
        for (let second = first + 1; second < characters.length - 1; second += 1) {
            for (let third = second + 1; third < characters.length; third += 1) {
                parties.push([...resolveFightConfiguration({
                    party: [characters[first], characters[second], characters[third]],
                }).party]);
            }
        }
    }
    return parties;
}

/** Validate before constructing an engine or starting workers, including empty batches. */
export function resolveFightConfiguration(input: FightConfigurationInput): FightConfiguration {
    const party = input.party === undefined ? stockCharacters : input.party;
    if (!Array.isArray(party) || party.length !== 3) {
        throw new Error("Party must contain exactly three character IDs.");
    }
    for (const id of party) {
        if (typeof id !== "string" || !Object.hasOwn(characterCatalogs, id)) {
            throw new Error(`Unknown party character ID: ${String(id)}`);
        }
    }
    if (new Set(party).size !== party.length) {
        throw new Error("Party must contain three distinct characters; duplicate character IDs are not allowed.");
    }
    const difficulty = input.difficulty === undefined ? "standard" : input.difficulty;
    if (!harnessDifficulties.includes(difficulty)) {
        throw new Error(`Unknown difficulty ID: ${String(difficulty)}. Available difficulties: ${harnessDifficulties.join(", ")}`);
    }
    return { party: [...party], difficulty };
}
