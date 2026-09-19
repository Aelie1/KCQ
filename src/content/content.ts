import { CharacterDef, EncounterDef } from "../engine/protected/definitions";
import { hinari } from "./characters/hinari";
import { ko } from "./characters/ko";
import { matsuko } from "./characters/matsuko";
import { forest_1, forest_2, forest_3, plains_1, plains_2, plains_3 } from "./skunk/encounters";

export const encounterList: EncounterDef[] = [
    plains_1,
    plains_2,
    plains_3,
    forest_1,
    forest_2,
    forest_3,
];

export const characterList: CharacterDef[] = [
    ko,
    matsuko,
    hinari,
]