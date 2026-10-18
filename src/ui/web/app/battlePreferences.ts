import type { KCQCharacter } from "../../../content";
import type { DifficultyId } from "../../../engine/public/types";
import { stockCharacters } from "../../../stock";
import { DEFAULT_DIFFICULTY, ENCOUNTER_DIFFICULTIES } from "../app";
import { isValidParty } from "./partySelection";

export function loadPreferredParty(storage?: Pick<Storage, "getItem">): readonly KCQCharacter[] {
    try {
        const saved: unknown = JSON.parse((storage ?? window.localStorage).getItem("kcq.party") ?? "null");
        if (Array.isArray(saved) && saved.every(id => typeof id === "string") && isValidParty(saved)) return saved;
    } catch { /* Storage may be unavailable or malformed. */ }
    return [...stockCharacters];
}

export function savePreferredParty(party: readonly KCQCharacter[], storage?: Pick<Storage, "setItem">): void {
    if (!isValidParty(party)) return;
    try { (storage ?? window.localStorage).setItem("kcq.party", JSON.stringify(party)); }
    catch { /* Keep the confirmed party in-session. */ }
}

export function isKnownDifficulty(value: unknown): value is DifficultyId {
    return ENCOUNTER_DIFFICULTIES.some(({ id }) => id === value);
}

export function loadPreferredDifficulty(storage?: Pick<Storage, "getItem">): DifficultyId {
    try {
        const saved = (storage ?? window.localStorage).getItem("kcq.difficulty");
        if (isKnownDifficulty(saved)) return saved;
    } catch { /* Storage may be unavailable. */ }
    return DEFAULT_DIFFICULTY;
}

export function savePreferredDifficulty(difficulty: DifficultyId, storage?: Pick<Storage, "setItem">): void {
    try { (storage ?? window.localStorage).setItem("kcq.difficulty", difficulty); }
    catch { /* Keep the selected difficulty in-session. */ }
}
