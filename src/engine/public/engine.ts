import { GameEngine } from "../private/engine";
import { ContentCatalog } from "../protected/types";
import { Engine } from "./types";

export function createGameEngine(campaign: string, catalog: ContentCatalog, seed?: number): Engine {
    return new GameEngine(campaign, catalog, seed);
}
