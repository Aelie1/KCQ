export const PATCH_NOTES_STORAGE_KEY = "kcq.patchNotes.lastSeenVersion";

/** Store the same identifier shown in the footer, without localized wrapping. */
export function hasSeenPatchNotes(version: string, storage?: Pick<Storage, "getItem">): boolean {
    try {
        // The value is a plain string. Missing or malformed values simply do not match.
        return (storage ?? window.localStorage).getItem(PATCH_NOTES_STORAGE_KEY) === version;
    } catch { return false; }
}

export function markPatchNotesSeen(version: string, storage?: Pick<Storage, "setItem">): void {
    try { (storage ?? window.localStorage).setItem(PATCH_NOTES_STORAGE_KEY, version); }
    catch { /* Dismissal still takes effect for this session when storage is unavailable. */ }
}
