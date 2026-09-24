import { expect } from "vitest";
import type { BindingDef, CharacterDef, EncounterDef, EnemyDef, MoveDef } from "../../src/engine/protected/definitions";
import { createCustomEngine } from "../../src/engine/protected/engine";
import type { AccuracyProfile, ActionSuccess, Binding, Buff, Character, Enemy, Engine, MoveType, PlayerAction, ValidTarget } from "../../src/engine/public/types";
import { actionView } from "./gameView";

export { actionView } from "./gameView";

export function targetAccuracy(
    engine: Engine,
    actor: string,
    move: string,
    target: string | null,
): AccuracyProfile | null {
    const info = targetPreview(engine, actor, move, target);
    if (!info.damage) return null;
    return Object.fromEntries(Object.entries(info.damage).map(([band, preview]) => [band, preview.chance]));
}

export function targetPreview(engine: Engine, actor: string, move: string, target: string | null): ValidTarget {
    const action = actionView(engine, actor).moves.find((candidate) => candidate.move.id === move);
    const info = action?.targets.find((candidate) => candidate.target === target);
    if (!info || !info.valid) throw new Error(`Expected ${String(target)} to be a valid target`);
    return info;
}

export function makeBehavioralMove(
    id: string,
    type: MoveType = "mouth",
    overrides: Partial<MoveDef> = {},
): MoveDef {
    return {
        id,
        targetSide: "enemy",
        targets: 1,
        type,
        accuracy: { hit: 100 },
        resolve: () => [],
        ...overrides,
    };
}

export function makeBehavioralCharacter(
    id = "hero",
    moves: MoveDef[] = [],
): CharacterDef {
    return { id, getMoves: () => moves, passives: [] };
}

export function makeEnemyWaitMove(): MoveDef {
    return makeBehavioralMove("wait", "none", {
        targetSide: "none",
        targets: 0,
        accuracy: undefined,
    });
}

export function makeBehavioralEnemy(
    id = "foe",
    moves: MoveDef[] = [makeEnemyWaitMove()],
): EnemyDef {
    const defaultMove = moves[0];
    if (!defaultMove) throw new Error("Test enemy requires at least one move");

    return {
        id,
        rank: "enemy",
        hp: 37,
        defense: 0,
        passives: [],
        ai: (state, actor) => [{
            type: "move",
            actor,
            move: { definition: defaultMove },
            targets: defaultMove.targets === 0 ? [] : [state.characters[0]],
        }],
    };
}

export function makeBehavioralBinding(
    id: string,
    overrides: Partial<BindingDef> = {},
): BindingDef {
    return { id, data: {}, ...overrides };
}

export function makeBehavioralEngine(
    characters: CharacterDef[],
    enemies: EnemyDef[] = [makeBehavioralEnemy()],
    seed = 1,
): Engine {
    const encounter: EncounterDef = { id: "behavioral-test", enemies, bindings: [], traps: [] };
    const engine = createCustomEngine([encounter], characters, seed);
    for (const character of characters) engine.loadCharacter(character.id);
    engine.loadEncounter(encounter.id);
    return engine;
}

export function execute(engine: Engine, action: PlayerAction): ActionSuccess {
    const result = engine.executeAction(action);
    expect(result.success).toBe(true);
    if (!result.success) {
        throw new Error(`Expected action to succeed, received ${result.reason}`);
    }
    return result;
}

export function characterState(engine: Engine, id = "hero"): Character {
    const character = engine.getGameView().characters.find((entry) => entry.id === id);
    if (!character) throw new Error(`Expected character ${id}`);
    return character;
}

export function enemyState(engine: Engine, id = "foe1"): Enemy {
    const enemy = engine.getGameView().enemies.find((entry) => entry.id === id);
    if (!enemy) throw new Error(`Expected enemy ${id}`);
    return enemy;
}

export function bindingState(
    engine: Engine,
    bindingId: string,
    characterId = "hero",
): Binding | undefined {
    return characterState(engine, characterId).bindings.find(
        (binding) => binding.id === bindingId,
    );
}

export function buffState(
    engine: Engine,
    buffId: string,
    entityId = "hero",
): Buff | undefined {
    const state = engine.getGameView();
    const entity = state.characters.find(({ id }) => id === entityId)
        ?? state.enemies.find(({ id }) => id === entityId);
    if (!entity) throw new Error(`Expected entity ${entityId}`);
    return entity.buffs.find((buff) => buff.id === buffId);
}
