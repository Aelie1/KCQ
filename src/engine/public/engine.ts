import { characterList, encounterList } from "../../content/content";
import { GameEngine } from "../private/engine";
import { Engine } from "./types";


export function createEngine(seed?: number): Engine {
    return new GameEngine(encounterList, characterList, seed);
}
