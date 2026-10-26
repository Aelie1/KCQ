import { createSignal } from "solid-js";
import type { GameLogMode } from "./components/GameLogTabs";

const STORAGE_KEY = "kcq.gameLogMode";

export function createGameLogModePreference() {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    const [mode, setMode] = createSignal<GameLogMode>(saved === "story" ? "story" : "combat");
    return [mode, (value: GameLogMode) => {
        if (value !== "combat" && value !== "story") return;
        setMode(value);
        try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* Keep the in-session preference. */ }
    }] as const;
}
