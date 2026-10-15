import { compressToBase64, decompressFromBase64 } from "lz-string";
import type { SaveState } from "../../../engine/public/save";
import type { BattleStatsSaveState } from "./viewModels/battleResult";
import type { GameLogSaveState } from "./viewModels/gameLogHistory";
import { isSavePackage } from "./savePackageValidation";
import { gitRevision } from "./version";

/** Browser-owned envelope. Capture after a complete action has reached both trackers.
 * Restore the engine first, then initialize each tracker with its saved state.
 * Decoding validates structure; loadSaveState still owns content-reference validation. */
export interface SavePackage {
    version: string;
    saveState: SaveState;
    gameLog: GameLogSaveState;
    stats: BattleStatsSaveState;
}

export type SaveDecodeResult =
    | { status: "loaded"; save: SavePackage }
    | { status: "incompatible"; version: string }
    | { status: "corrupted" };

export function createSavePackage(saveState: SaveState, gameLog: GameLogSaveState, stats: BattleStatsSaveState): SavePackage {
    const version = gitRevision();
    if (!version) throw new Error("A Git revision is required to create a save");
    return structuredClone({ version, saveState, gameLog, stats });
}

/** LZ-string's Base64 codec performs compression and transport encoding together. */
export function serializeSavePackage(save: SavePackage): string {
    const json = JSON.stringify(save);
    if (!isSavePackage(JSON.parse(json))) throw new Error("Invalid save package");
    return compressToBase64(json);
}

export function deserializeSavePackage(encoded: string): SaveDecodeResult {
    try {
        if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,3}$/.test(encoded)) return { status: "corrupted" };
        const json = decompressFromBase64(encoded);
        // The codec can ignore trailing or truncated data. Require a complete canonical stream.
        if (!json || compressToBase64(json) !== encoded) return { status: "corrupted" };
        const save: unknown = JSON.parse(json);
        if (!save || typeof save !== "object" || !("version" in save)
            || typeof save.version !== "string" || !save.version) return { status: "corrupted" };
        // Check compatibility before interpreting the revision-specific payload.
        if (!gitRevision() || save.version !== gitRevision()) return { status: "incompatible", version: save.version };
        return isSavePackage(save) ? { status: "loaded", save } : { status: "corrupted" };
    } catch {
        return { status: "corrupted" };
    }
}
