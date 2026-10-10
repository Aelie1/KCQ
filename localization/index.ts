import type { KCQCampaign, KCQCharacter } from "../src/content";
import type { StringTable } from "../src/ui/presentation/presentation";
import { hinariEnglishStrings, koEnglishStrings, matsukoEnglishStrings } from "./en/characters";
import { skunkEnglishStrings } from "./en/skunk";
import { libraryEnglishStrings } from "./en/library";
import { systemEnglishStrings } from "./en/system";

export type KCQLanguage = "en";

export const baseStrings: Record<KCQLanguage, StringTable> = {
    "en": { ...systemEnglishStrings, ...libraryEnglishStrings }
};

export const characterStrings: Record<KCQCharacter, Record<KCQLanguage, StringTable>> = {
    "ko": {
        "en": koEnglishStrings
    },
    "matsuko": {
        "en": matsukoEnglishStrings
    },
    "hinari": {
        "en": hinariEnglishStrings
    }
};
export const campaignStrings: Record<KCQCampaign, Record<KCQLanguage, StringTable>> = {
    "skunk": {
        "en": skunkEnglishStrings
    }
};

export function getStringTable(language: KCQLanguage, characters?: readonly KCQCharacter[], campaign?: KCQCampaign): StringTable {
    const strings: StringTable[] = [];
    strings.push(baseStrings[language]);
    if (characters) {
        for (const character of characters) {
            strings.push(characterStrings[character][language]);
        }
    }
    if (campaign) {
        strings.push(campaignStrings[campaign][language]);
    }
    return Object.assign({}, ...strings);
}