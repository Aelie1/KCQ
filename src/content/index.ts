import { ContentCatalog, ContentCatalogFragment } from "../engine/protected/types";
import { createGameEngine, createLibrary } from "../engine/public/engine";
import { ContentLibrary } from "../engine/public/library";
import { Engine } from "../engine/public/types";
import { baseCatalog } from "./base";
import { hinariCatalog } from "./characters/hinari";
import { koCatalog } from "./characters/ko";
import { matsukoCatalog } from "./characters/matsuko";
import { naruyoCatalog } from "./characters/naruyo";
import { sakariCatalog } from "./characters/sakari";
import { skunkCatalog } from "./skunk/content";

export type KCQCharacter = "ko" | "matsuko" | "hinari" | "naruyo" | "sakari";
export type KCQCampaign = "skunk";

export const characterCatalogs: Record<KCQCharacter, ContentCatalogFragment> = {
    "ko": koCatalog,
    "matsuko": matsukoCatalog,
    "hinari": hinariCatalog,
    "naruyo": naruyoCatalog,
    "sakari": sakariCatalog,
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
        callbacks: catalogs.flatMap(c => c.callbacks ?? []),
        encounters: catalogs.flatMap(c => c.encounters ?? []),
        campaigns: catalogs.flatMap(c => c.campaigns ?? []),
    };
}

export function createEngine(characters: readonly KCQCharacter[], campaign: KCQCampaign, seed?: number): Engine {
    const catalogs: ContentCatalogFragment[] = [];
    catalogs.push(baseCatalog);
    for (const character of characters) {
        catalogs.push(characterCatalogs[character]);
    }
    catalogs.push(campaignCatalogs[campaign]);
    return createGameEngine(campaign, mergeCatalogs(...catalogs), seed);
}

export function createCharacterLibrary(): ContentLibrary {
    return createLibrary(
        mergeCatalogs(...Object.values(characterCatalogs))
    );
}

export function createCampaignLibrary(characters: readonly KCQCharacter[], campaign: KCQCampaign,): ContentLibrary {
    return createLibrary(
        mergeCatalogs(baseCatalog, ...characters.map(id => characterCatalogs[id]), campaignCatalogs[campaign])
    );
}