import { GameEngine } from "../private/engine";
import type { Engine } from "../public/types";
import type { CharacterDef, EncounterDef } from "./definitions";

export function createCustomEngine(encounters: EncounterDef[], characters: CharacterDef[], seed?: number): Engine {
    return new GameEngine(encounters, characters, seed);
}
