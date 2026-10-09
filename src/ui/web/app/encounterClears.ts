import type { DifficultyId, EncounterId } from "../../../engine/public/types";
import { ENCOUNTER_DIFFICULTIES } from "../app";

export type EncounterClears = Readonly<Partial<Record<EncounterId, DifficultyId>>>;

const STORAGE_KEY = "kcq.clears";

export function loadEncounterClears(storage?: Pick<Storage, "getItem">): EncounterClears {
    try {
        const saved: unknown = JSON.parse((storage ?? window.localStorage).getItem(STORAGE_KEY) ?? "{}");
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
        return Object.fromEntries(Object.entries(saved).filter(([, difficulty]) =>
            ENCOUNTER_DIFFICULTIES.some(({ id }) => id === difficulty)));
    } catch {
        return {};
    }
}

export function saveEncounterClears(clears: EncounterClears, storage?: Pick<Storage, "setItem">): void {
    try {
        (storage ?? window.localStorage).setItem(STORAGE_KEY, JSON.stringify(clears, null, 2));
    } catch { /* Keep in-session progress when storage is unavailable. */ }
}
