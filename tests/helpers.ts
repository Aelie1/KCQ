import { expect } from "vitest";
import { GameEngine } from "../src/engine/engine";
import { isCharacter } from "../src/engine/helpers";
import type {
    BindingDef,
    CharacterDef,
    EnemyDef,
    iBinding,
    iCharacter,
    iEnemy,
    iStatus,
    MoveDef,
    EncounterDef,
} from "../src/engine/itypes";
import type {
    ActionFailureReason,
    BindingLevel,
    MoveType,
} from "../src/engine/types";

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
    return { id, status: statusMap(entries), initialState: {} };
}

export function makeMove(
    id: string,
    type: MoveType = "mouth",
    overrides: Partial<MoveDef> = {},
): MoveDef {
    return {
        id,
        target: "enemy",
        targets: 1,
        type,
        accuracy: { hit: 100 },
        resolve: () => [],
        ...overrides,
    };
}

export function makeWaitMove(): MoveDef {
    return makeMove("wait", "enemy", { target: "player" });
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
        state: { ...definition.initialState },
    };
}

export function makeEnemyDef(
    id: string,
    moves: MoveDef[],
    ai?: EnemyDef["ai"],
): EnemyDef {
    return {
        id,
        hp: 37,
        defense: 0,
        moves,
        passives: [],
        ai: ai ?? ((state, actor) => ({
            actor,
            move: moves[0],
            targets: [state.characters[0]],
        })),
    };
}

export function makeEnemy(definition: EnemyDef, id = `${definition.id}1`): iEnemy {
    return {
        id,
        definition,
        buffs: [],
        currHp: definition.hp,
        currDef: definition.defense,
        intention: null,
    };
}

export function setupBoundEngine(
    binding: BindingDef,
    amount: number,
    additionalEncounters: EncounterDef[] = [],
) {
    const setupMove = makeMove("apply-binding", "mouth", {
        target: "player",
        resolve: (_state, _actor, targets) => {
            const target = targets[0].target;
            return isCharacter(target)
                ? [{ type: "binding", target, binding, amount }]
                : [];
        },
    });
    const armsMove = makeMove("arms-move", "arms");
    const mouthMove = makeMove("mouth-move", "mouth");
    const hero = makeCharacterDef("hero", [setupMove, armsMove, mouthMove]);
    const foe = makeEnemyDef("foe", [makeWaitMove()]);
    const encounter: EncounterDef = { id: "bound-test", enemies: [foe] };
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
    expect(engine.getActions(actor).find((action) => action.move.id === move)).toMatchObject({
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
