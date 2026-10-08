import { baseStrings, KCQLanguage } from "../../localization";
import { hinariEnglishStrings, koEnglishStrings, matsukoEnglishStrings } from "../../localization/en/characters";
import { skunkEnglishStrings } from "../../localization/en/skunk";
import { ContentCatalog, ContentCatalogFragment, ContentDef } from "../engine/protected/types";
import { createGameEngine } from "../engine/public/engine";
import { Engine } from "../engine/public/types";
import { StringTable } from "../ui/presentation/presentation";
import { baseCatalog } from "./base";
import { hinariCatalog } from "./characters/hinari";
import { koCatalog } from "./characters/ko";
import { matsukoCatalog } from "./characters/matsuko";
import { skunkCatalog } from "./skunk/content";

export type KCQCharacter = "ko" | "matsuko" | "hinari";
export type KCQCampaign = "skunk";

export const characterList: Record<KCQCharacter, ContentDef> = {
    "ko": {
        catalog: koCatalog,
        strings: { "en": koEnglishStrings }
    },
    "matsuko": {
        catalog: matsukoCatalog,
        strings: { "en": matsukoEnglishStrings }
    },
    "hinari": {
        catalog: hinariCatalog,
        strings: { "en": hinariEnglishStrings }
    }
};

export const campaignList: Record<KCQCampaign, ContentDef> = {
    "skunk": {
        catalog: skunkCatalog,
        strings: { "en": skunkEnglishStrings }
    }
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

export function getStringTable(language: KCQLanguage, characters?: KCQCharacter[], campaign?: KCQCampaign): StringTable {
    const strings: StringTable[] = [];
    strings.push(baseStrings[language]);
    if (characters) {
        for (const character of characters) {
            strings.push(characterList[character].strings[language]);
        }
    }
    if (campaign) {
        strings.push(campaignList[campaign].strings[language]);
    }
    return Object.assign({}, ...strings);
}


export function createEngine(characters: KCQCharacter[], campaign: KCQCampaign, seed?: number): Engine {
    const catalogs: ContentCatalogFragment[] = [];
    catalogs.push(baseCatalog);
    for (const character of characters) {
        catalogs.push(characterList[character].catalog);
    }
    catalogs.push(campaignList[campaign].catalog);
    return createGameEngine(mergeCatalogs(...catalogs), seed);
}