import { StringTable } from "../src/ui/presentation/presentation";
import { eventEnglishStrings } from "./en/events";
import { systemEnglishStrings } from "./en/system";

export type KCQLanguage = "en";

export const baseStrings: Record<KCQLanguage, StringTable> = {
    "en": { ...systemEnglishStrings, ...eventEnglishStrings }
};
