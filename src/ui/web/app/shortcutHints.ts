import { createSignal } from "solid-js";

export type ShortcutHintMode = "temporary" | "always";
export interface ShortcutHintPreference {
    readonly value: ShortcutHintMode;
    onChange: (mode: ShortcutHintMode) => void;
}

const STORAGE_KEY = "kcq.keyboardShortcutHints";

export function createShortcutHintPreference(): ShortcutHintPreference {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    const [mode, setMode] = createSignal<ShortcutHintMode>(saved === "always" ? "always" : "temporary");
    return {
        get value() { return mode(); },
        onChange(value) {
            setMode(value);
            try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* Keep the in-session preference. */ }
        },
    };
}
