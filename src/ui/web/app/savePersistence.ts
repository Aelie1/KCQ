import { deserializeSavePackage, serializeSavePackage, type SaveDecodeResult, type SavePackage } from "./savePackage";
import { gitRevision } from "./version";

export const AUTOSAVE_STORAGE_KEY = "kcq.autosave";

export type SaveReadResult = SaveDecodeResult | { status: "missing" | "inaccessible" };
export type SaveWriteResult = { status: "saved" | "corrupted" | "inaccessible" }
    | { status: "incompatible"; version: string };

export function readSave(storage?: Pick<Storage, "getItem">): SaveReadResult {
    let encoded: string | null;
    try {
        encoded = (storage ?? window.localStorage).getItem(AUTOSAVE_STORAGE_KEY);
    } catch {
        return { status: "inaccessible" };
    }
    return encoded === null ? { status: "missing" } : deserializeSavePackage(encoded);
}

export function writeSave(save: SavePackage, storage?: Pick<Storage, "setItem">): SaveWriteResult {
    let encoded: string;
    try {
        encoded = serializeSavePackage(save);
        if (!gitRevision() || save.version !== gitRevision()) return { status: "incompatible", version: save.version };
    } catch {
        return { status: "corrupted" };
    }
    try {
        (storage ?? window.localStorage).setItem(AUTOSAVE_STORAGE_KEY, encoded);
        return { status: "saved" };
    } catch {
        return { status: "inaccessible" };
    }
}

export function clearSave(storage?: Pick<Storage, "removeItem">): { status: "cleared" | "inaccessible" } {
    try {
        (storage ?? window.localStorage).removeItem(AUTOSAVE_STORAGE_KEY);
        return { status: "cleared" };
    } catch {
        return { status: "inaccessible" };
    }
}
