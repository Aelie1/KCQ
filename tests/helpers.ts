import { expect } from "vitest";
import type { BindingDef, CharacterDef, EncounterDef, EnemyDef, MoveDef } from "../src/engine/protected/definitions";
import type {
    iBinding,
    iCharacter,
    iEnemy,
    iStatus,
} from "../src/engine/protected/types";
import { GameEngine } from "../src/engine/public/engine";
import type {
    ActionFailureReason,
    BindingLevel,
    MoveType,
} from "../src/engine/public/types";

const bindingLevels: BindingLevel[] = [
    "none",
    "easy",
    "medium",
    "hard",
    "extreme",
    "impossible",
];

function statusMap(
    entries: Partial<Record<BindingLevel, iStatus[]>> = {},
): Record<BindingLevel, iStatus[]> {
    return Object.fromEntries(
        bindingLevels.map((level) => [level, entries[level] ?? []]),
    ) as Record<BindingLevel, iStatus[]>;
}

export function makeBindingDef(
    id: string,
    entries: Partial<Record<BindingLevel, iStatus[]>> = {},
): BindingDef {
    return { id, status: statusMap(entries), data: {} };
}

export function makeMove(
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

export function makeWaitMove(): MoveDef {
    return makeMove("wait", "none", {
        targetSide: "none",
        targets: 0,
        accuracy: undefined,
    });
}

export function makeCharacterDef(id: string, moves: MoveDef[] = []): CharacterDef {
    return { id, moves, passives: [] };
}

export function makeCharacter(
    id = "hero",
    bindings: iBinding[] = [],
    moves: MoveDef[] = [],
): iCharacter {
    return {
        id,
        definition: makeCharacterDef(id, moves),
        acted: false,
        standing: false,
        bonusEscapes: 0,
        bindings,
        buffs: [],
    };
}

export function makeBinding(definition: BindingDef, value: number): iBinding {
    return {
        id: definition.id,
        definition,
        value,
        data: { ...definition.data },
    };
}

export function makeEnemyDef(
    id: string,
    moves: MoveDef[],
    ai?: EnemyDef["ai"],
): EnemyDef {
    const defaultMove = moves[0];
    if (!defaultMove) throw new Error("Test enemy requires at least one move");

    return {
        id,
        hp: 37,
        defense: 0,
        passives: [],
        ai: ai ?? ((state, actor) => [{
            type: "move",
            actor,
            move: { definition: defaultMove },
            targets: defaultMove.targets === 0 ? [] : [state.characters[0]],
        }]),
    };
}

export function makeEnemy(definition: EnemyDef, id = `${definition.id}1`): iEnemy {
    return {
        id,
        definition,
        buffs: [],
        currHp: definition.hp,
        maxHp: definition.hp,
        currDef: definition.defense,
        intentions: [],
        preview: [],
        cooldowns: {},
        data: {},
    };
}

export function setupBoundEngine(
    binding: BindingDef,
    amount: number,
    additionalEncounters: EncounterDef[] = [],
) {
    const setupMove = makeMove("apply-binding", "mouth", {
        targetSide: "player",
        resolve: (state) => [{
            type: "binding",
            target: state.characters[0],
            binding,
            amount,
        }],
    });
    const armsMove = makeMove("arms-move", "arms");
    const mouthMove = makeMove("mouth-move", "mouth");
    const hero = makeCharacterDef("hero", [setupMove, armsMove, mouthMove]);
    const foe = makeEnemyDef("foe", [makeWaitMove()]);
    const encounter: EncounterDef = { id: "bound-test", enemies: [foe], bindings: [], traps: [] };
    const engine = new GameEngine([encounter, ...additionalEncounters], 1);
    engine.loadCharacter(hero);
    engine.loadEncounter(encounter.id);

    expect(engine.executeAction({
        type: "attack",
        actor: hero.id,
        move: setupMove.id,
        targets: [hero.id],
    }).success).toBe(true);
    expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);

    return { engine, hero, foeId: `${foe.id}1`, armsMove, mouthMove };
}

export function expectMoveRejection(
    engine: GameEngine,
    actor: string,
    move: string,
    target: string,
    reason: ActionFailureReason,
) {
    expect(engine.getMoves(actor).find((action) => action.move.id === move)).toMatchObject({
        available: false,
        reason,
    });
    expect(engine.executeAction({
        type: "attack",
        actor,
        move,
        targets: [target],
    })).toEqual({ success: false, reason });
}
