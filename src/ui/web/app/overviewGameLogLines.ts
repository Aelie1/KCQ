import { createSignal } from "solid-js";

export const DEFAULT_OVERVIEW_GAME_LOG_LINES = 3;
const STORAGE_KEY = "kcq.overviewGameLogLines";

export interface OverviewGameLogPreference {
    readonly value: number;
    onChange: (lines: number) => void;
}

function validLines(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= 8;
}

export function createOverviewGameLogPreference(): OverviewGameLogPreference {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    const initial = saved !== null && saved.trim() !== "" && validLines(Number(saved))
        ? Number(saved) : DEFAULT_OVERVIEW_GAME_LOG_LINES;
    const [lines, setLines] = createSignal(initial);
    return {
        get value() { return lines(); },
        onChange(value) {
            if (!validLines(value)) return;
            setLines(value);
            try { window.localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* Keep the in-session preference. */ }
        },
    };
}
