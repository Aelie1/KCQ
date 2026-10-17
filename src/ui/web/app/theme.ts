import { createSignal, onCleanup } from "solid-js";

export type Theme = "dark" | "light" | "system";
export const DEFAULT_THEME: Theme = "dark";
export interface ThemePreference {
    readonly value: Theme;
    onChange: (theme: Theme) => void;
}
const STORAGE_KEY = "kcq.theme";
const validTheme = (value: string | null): value is Theme =>
    value === "dark" || value === "light" || value === "system";

/** One owner per app; battles share their parent's preference and listener. */
export function createThemePreference(): ThemePreference {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    const [theme, setTheme] = createSignal<Theme>(validTheme(saved) ? saved : DEFAULT_THEME);
    const system = typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: light)") : undefined;
    const apply = (): void => {
        if (typeof document === "undefined") return;
        document.documentElement.dataset.kcqTheme = theme() === "light"
            || (theme() === "system" && system?.matches) ? "light" : "dark";
    };
    const systemChanged = (): void => { if (theme() === "system") apply(); };
    system?.addEventListener("change", systemChanged);
    onCleanup(() => system?.removeEventListener("change", systemChanged));
    apply();
    return {
        get value() { return theme(); },
        onChange(value) {
            if (!validTheme(value)) return;
            setTheme(value);
            apply();
            try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* Keep the in-session preference. */ }
        },
    };
}
