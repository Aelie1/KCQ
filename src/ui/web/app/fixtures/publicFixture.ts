import type { Character, EntityId } from "../../../../engine/public/types";

/** Public engine defaults for production-side UI/demo fixtures. */
export function makeFixtureCharacter(
    id: EntityId,
    overrides: Partial<Character> = {},
): Character {
    return {
        id,
        acted: false,
        standing: false,
        bonusEscapes: 0,
        bindings: [],
        buffs: [],
        cooldowns: {},
        modifiers: {},
        blockedMoveTypes: [],
        data: {},
        ...overrides,
    };
}
