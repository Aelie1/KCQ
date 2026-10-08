import { ContentCatalog, ContentCatalogFragment } from "../engine/protected/types";
import { createGameEngine } from "../engine/public/engine";
import { Engine } from "../engine/public/types";
import { baseCatalog } from "./base";
import { hinariCatalog } from "./characters/hinari";
import { koCatalog } from "./characters/ko";
import { matsukoCatalog } from "./characters/matsuko";
import { skunkCatalog } from "./skunk/content";

export type KCQCharacter = "ko" | "matsuko" | "hinari";
export type KCQCampaign = "skunk";

export const characterCatalogs: Record<KCQCharacter, ContentCatalogFragment> = {
    "ko": koCatalog,
    "matsuko": matsukoCatalog,
    "hinari": hinariCatalog,
};

export const campaignCatalogs: Record<KCQCampaign, ContentCatalogFragment> = {
    "skunk": skunkCatalog,
};

function mergeCatalogs(...catalogs: ContentCatalogFragment[]): ContentCatalog {
    return {
        characters: catalogs.flatMap(c => c.characters ?? []),
        enemies: catalogs.flatMap(c => c.enemies ?? []),
        moves: catalogs.flatMap(c => c.moves ?? []),
        passives: catalogs.flatMap(c => c.passives ?? []),
        bindings: catalogs.flatMap(c => c.bindings ?? []),
        traps: catalogs.flatMap(c => c.traps ?? []),
        statuses: catalogs.flatMap(c => c.statuses ?? []),
        encounters: catalogs.flatMap(c => c.encounters ?? []),
    };
}

export function createEngine(characters: readonly KCQCharacter[], campaign: KCQCampaign, seed?: number): Engine {
    const catalogs: ContentCatalogFragment[] = [];
    catalogs.push(baseCatalog);
    for (const character of characters) {
        catalogs.push(characterCatalogs[character]);
    }
    catalogs.push(campaignCatalogs[campaign]);
    return createGameEngine(mergeCatalogs(...catalogs), seed);
}