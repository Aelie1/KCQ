import type { AccuracyProfile, BindingLevel, ModifierId, Move, MoveType, StatusId, TrapId } from "../public/types";
import type { Random } from "./random";
import type { iBinding, iCharacter, iEffect, iEnemy, iEntity, iGameState, iMove, iStatus, iTargetInfo, iTrap } from "./types";


export interface CharacterDef {
    id: string;
    moves: MoveDef[];
    passives: PassiveDef[];
}

export interface EnemyDef {
    id: string;
    hp: number;
    defense: number;
    passives: PassiveDef[];
    ai: (state: iGameState, actor: iEnemy, rng: Random) => iEffect[];
    onDamage?: (state: iGameState, actor: iEntity, target: iEnemy, damage: number) => iEffect[];
    onDefeat?: (state: iGameState, target: iEnemy) => iEffect[];
}

export interface MoveDef extends Move {
    accuracy?: AccuracyProfile;
    check?: "accuracy" | "willpower"
    alwaysAvailable?: boolean;
    baseDamage?: number;
    cooldown?: number;
    freeOnHit?: boolean;
    resolve: (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]) => iEffect[];
}

export interface PassiveDef {
    id: string;
}

export interface BindingDef {
    id: string;
    status?: Partial<Record<BindingLevel, iStatus[]>>;
    data?: Record<string, number>;
    onAdd?: (state: iGameState, target: iCharacter, binding: iBinding, amount: number) => iEffect[];
    onEscape?: (actor: iCharacter, target: iCharacter, binding: iBinding, amount: number) => iEffect[];
    onTick?: (target: iCharacter, binding: iBinding) => iEffect[];
}

export interface TrapDef {
    id: TrapId;
    onTrigger: (target: iCharacter, trap: iTrap, roll: number) => iEffect[];
}

export interface StatusDef {
    id: StatusId;
    levels: StatusLevelDef[];
}

interface StatusLevelDef {
    modifiers?: Partial<Record<ModifierId, number>>;
    blockedMoveTypes?: MoveType[];
    blocksAttack?: boolean;
    blocksEscape?: boolean;
    blocksAssist?: boolean;
    blocksBonusEscape?: boolean;
    blocksMoving?: boolean;
    skipsTurn?: boolean;
    incapacitated?: boolean;
}

export interface EncounterDef {
    id: string;
    enemies: EnemyDef[];
    bindings: BindingDef[];
    traps: TrapSetup[];
    setup?: (state: iGameState) => void;
}

export interface TrapSetup {
    definition: TrapDef;
    amount: number;
}

