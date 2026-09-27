import type { ContentLibrary } from "../../src/engine/public/library";

/** A minimal public library for policy tests that do not exercise content lookup. */
export function createEmptyContentLibrary(): ContentLibrary {
    return {
        characters: {},
        enemies: {},
        moves: {},
        passives: {},
        bindings: {},
        traps: {},
        statuses: {},
        encounters: {},
    } as ContentLibrary;
}
