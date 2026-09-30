import { difficulties } from "../../src/engine/private/constants";
import type { iGameState } from "../../src/engine/protected/types";

export const STANDARD_DIFFICULTY = difficulties.standard;

export function makeInternalState(overrides: Partial<iGameState> = {}): iGameState {
    return {
        turn: { round: 1, step: 1, phase: "player" },
        nextId: {},
        characters: [],
        enemies: [],
        traps: [],
        encounter: null,
        difficulty: STANDARD_DIFFICULTY,
        ...overrides,
    };
}
