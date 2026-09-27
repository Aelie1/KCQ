import { GameEngine } from "../private/engine";
import type { Engine } from "../public/types";
import { ContentCatalog } from "./types";

export function createCustomEngine(catalog: ContentCatalog, seed?: number): Engine {
    return new GameEngine(catalog, seed);
}
