import { createSignal } from "solid-js";

export const PLAYBACK_INTERVALS = { instant: 0, fast: 250, normal: 500, slow: 1000 } as const;
export type PlaybackSpeed = keyof typeof PLAYBACK_INTERVALS;
export interface PlaybackSpeedPreference {
    readonly value: PlaybackSpeed;
    onChange: (speed: PlaybackSpeed) => void;
}
const STORAGE_KEY = "kcq.playbackSpeed";
const validSpeed = (value: string | null): value is PlaybackSpeed =>
    value !== null && Object.hasOwn(PLAYBACK_INTERVALS, value);

export function createPlaybackSpeedPreference(): PlaybackSpeedPreference {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    const [speed, setSpeed] = createSignal<PlaybackSpeed>(validSpeed(saved) ? saved : "normal");
    return {
        get value() { return speed(); },
        onChange(value) {
            if (!validSpeed(value)) return;
            setSpeed(value);
            try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* Keep the in-session preference. */ }
        },
    };
}
