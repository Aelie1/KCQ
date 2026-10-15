import { GameEngine } from "../private/engine";
import { ContentCatalog } from "../protected/types";
import { CampaignId, Engine } from "./types";

export function createGameEngine(campaign: CampaignId, catalog: ContentCatalog, seed?: number): Engine {
    return new GameEngine(campaign, catalog, seed);
}
