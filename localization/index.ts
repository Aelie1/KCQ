import type { KCQCampaign, KCQCharacter } from "../src/content";
import type { StringTable } from "../src/ui/presentation/presentation";
import { hinariEnglishStrings, koEnglishStrings, matsukoEnglishStrings, naruyoEnglishStrings, sakariEnglishStrings } from "./en/characters";
import { gameGuideEnglishStrings } from "./en/gameGuide";
import { skunkEnglishStrings } from "./en/skunk";
import { systemEnglishStrings } from "./en/system";
import { narrativeEnglishStrings } from "./en/narrative";

export type KCQLanguage = "en";

export const baseStrings: Record<KCQLanguage, StringTable> = {
    "en": { ...systemEnglishStrings, ...gameGuideEnglishStrings, ...narrativeEnglishStrings }
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
    },
    "naruyo": {
        "en": naruyoEnglishStrings
    },
    "sakari": {
        "en": sakariEnglishStrings
    },

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
