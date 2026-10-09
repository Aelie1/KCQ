import type { EventFrame, GameState } from "../../../../engine/public/types";
import { createGameLogEntries } from "../../../presentation/gameLog";

/** One history per battle session. Retaining frame boundaries lets Pass 1 merge stance runs
 * across actions without merging other top-level events or using the current state as history. */
export function createGameLogHistory(initialState: GameState) {
    const initial = structuredClone(initialState);
    const frames: EventFrame[] = [];
    return {
        record(nextFrames: readonly EventFrame[]) {
            frames.push(...nextFrames);
            return createGameLogEntries(frames, initial);
        },
    };
}
