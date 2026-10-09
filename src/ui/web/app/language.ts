import type { Presentation } from "../../presentation/presentation";

export interface LanguageOption {
    id: string;
    label: string;
    presentation: Presentation;
}

export interface LanguageSelection {
    value: string;
    options: readonly LanguageOption[];
    onChange: (id: string) => void;
}

const STORAGE_KEY = "kcq.language";

export function loadLanguage(options: readonly LanguageOption[], storage?: Pick<Storage, "getItem">): LanguageOption {
    let saved: string | null = null;
    try { saved = (storage ?? window.localStorage).getItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    return options.find(option => option.id === saved) ?? options.find(option => option.id === "en")!;
}

export function saveLanguage(id: string, storage?: Pick<Storage, "setItem">): void {
    try { (storage ?? window.localStorage).setItem(STORAGE_KEY, id); } catch { /* Keep the in-session language. */ }
}
