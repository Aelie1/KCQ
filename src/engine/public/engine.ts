import { GameEngine } from "../private/engine";
import { ContentCatalog } from "../protected/types";
import { Engine } from "./types";

export function createGameEngine(catalog: ContentCatalog, seed?: number): Engine {
    return new GameEngine(catalog, seed);
}
