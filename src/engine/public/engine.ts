import { GameEngine } from "../private/engine";
import { serializeLibrary } from "../private/library";
import { ContentCatalog } from "../protected/types";
import { ContentLibrary } from "./library";
import { CampaignId, Engine } from "./types";

export function createGameEngine(campaign: CampaignId, catalog: ContentCatalog, seed?: number): Engine {
    return new GameEngine(campaign, catalog, seed);
}

export function createLibrary(catalog: ContentCatalog): ContentLibrary {
    return serializeLibrary(catalog);
}