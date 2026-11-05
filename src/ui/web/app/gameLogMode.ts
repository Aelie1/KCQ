import { createSignal } from "solid-js";
export type CompactLogStyle = "game" | "story";
export type FullLogStyle = CompactLogStyle | "both";
export const DEFAULT_FULL_LOG_STYLE: FullLogStyle = "both";
export const DEFAULT_COMPACT_LOG_STYLE: CompactLogStyle = "game";

export interface LogStylePreferences {
    readonly full: FullLogStyle;
    readonly compact: CompactLogStyle;
    setFull: (style: FullLogStyle) => void;
    setCompact: (style: CompactLogStyle) => void;
}

function read(key: string): string | null {
    try { return window.localStorage.getItem(`kcq.${key}`); } catch { return null; }
}

function write(key: string, value: string): void {
    try { window.localStorage.setItem(`kcq.${key}`, value); } catch { /* Keep the in-session preference. */ }
}

export function createLogStylePreferences(): LogStylePreferences {
    const savedFull = read("fullLogStyle");
    const savedCompact = read("compactLogStyle");
    const legacyStory = read("gameLogMode") === "story";
    // Migrate only missing keys. Persist each migration so subsequent changes and resets
    // never revive the legacy choice, including when only one new preference exists.
    const initialFull = savedFull === "game" || savedFull === "story" || savedFull === "both" ? savedFull
        : savedFull === null && legacyStory ? "story" : DEFAULT_FULL_LOG_STYLE;
    const initialCompact = savedCompact === "game" || savedCompact === "story" ? savedCompact
        : savedCompact === null && legacyStory ? "story" : DEFAULT_COMPACT_LOG_STYLE;
    if (legacyStory && savedFull === null) write("fullLogStyle", initialFull);
    if (legacyStory && savedCompact === null) write("compactLogStyle", initialCompact);
    const [full, setFull] = createSignal<FullLogStyle>(initialFull);
    const [compact, setCompact] = createSignal<CompactLogStyle>(initialCompact);
    return {
        get full() { return full(); },
        get compact() { return compact(); },
        setFull(value) {
            if (value !== "game" && value !== "story" && value !== "both") return;
            setFull(value);
            write("fullLogStyle", value);
        },
        setCompact(value) {
            if (value !== "game" && value !== "story") return;
            setCompact(value);
            write("compactLogStyle", value);
        },
    };
}
