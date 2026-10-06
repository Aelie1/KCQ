import type {
    ActionView,
    Binding,
    Character,
    Enemy,
    EntityId,
    GameState,
} from "../../src/engine/public/types";

/**
 * Boring, neutral public engine data for tests.
 *
 * These factories intentionally build the serialized/public types rather than
 * the mutable internal engine types created by helpers.ts.
 */
export function makePublicCharacter(
    id: EntityId = "hero",
    overrides: Partial<Character> = {},
): Character {
    return {
        id,
        acted: false,
        standing: false,
        bonusEscapes: 0,
        bonusBlocked: false,
        bindings: [],
        buffs: [],
        cooldowns: {},
        modifiers: {},
        blockedMoveTypes: [],
        data: {},
        ...overrides,
    };
}

export function makePublicEnemy(
    id: EntityId = "enemy",
    overrides: Partial<Enemy> = {},
): Enemy {
    return {
        id,
        defId: id,
        rank: "enemy",
        maxHp: 100,
        currHp: 100,
        currDef: 0,
        intentions: [],
        buffs: [],
        cooldowns: {},
        ...overrides,
    };
}

export function makePublicActionView(
    id: EntityId = "hero",
    overrides: Partial<ActionView> = {},
): ActionView {
    return {
        id,
        available: true,
        moves: [],
        escapes: [],
        stance: { available: true },
        ...overrides,
    };
}

export function makePublicGameState(
    overrides: Partial<GameState> = {},
): GameState {
    return {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        characters: [],
        enemies: [],
        traps: [],
        encounter: null,
        difficulty: {
            id: "standard",
            playerModifiers: {},
            enemyModifiers: {},
        },
        ...overrides,
    };
}

export function makePublicBinding(
    id = "binding",
    overrides: Partial<Binding> = {},
): Binding {
    return {
        id,
        value: 0,
        level: "none",
        data: {},
        status: [],
        tickEffects: [],
        ...overrides,
    };
}
