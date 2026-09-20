import type { AccuracyProfile, BindingLevel, FailureReason, ModifierId, ModifierSet, Move, MoveType, StatusId, TrapId } from "../public/types";
import type { Random } from "./random";
import type { iBinding, iCharacter, iEffect, iEnemy, iEntity, iGameState, iMove, iMoveEffect, iStatus, iTargetInfo, iTrap } from "./types";


export interface CharacterDef {
    id: string;
    getMoves: (actor: iCharacter) => MoveDef[];
    passives: PassiveDef[];
    data?: Record<string, number>;
}

export interface EnemyDef {
    id: string;
    rank: "minion" | "enemy" | "boss";
    hp: number;
    defense: number;
    passives: PassiveDef[];
    ai: (state: iGameState, actor: iEnemy, rng: Random) => iMoveEffect[];
    onDamage?: (state: iGameState, actor: iEntity, target: iEnemy, damage: number) => iEffect[];
    onDefeat?: (state: iGameState, target: iEnemy) => iEffect[];
}

export interface MoveDef extends Move {
    accuracy?: AccuracyProfile;
    check?: "accuracy" | "willpower"
    alwaysAvailable?: boolean;
    baseDamage?: number;
    baseHits?: number;
    cooldown?: number;
    freeOnHit?: boolean;
    modifiers?: ModifierSet;
    resolve: (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]) => iEffect[];
    isValid?: (move: MoveDef, target: iEntity | null) => FailureReason | undefined;
}

export interface PassiveDef {
    id: string;
    status?: StatusLevelDef;
    immunities?: StatusDef[];
}

export interface BindingDef {
    id: string;
    status?: Partial<Record<BindingLevel, iStatus[]>>;
    data?: Record<string, number>;
    onAdd?: (state: iGameState, target: iCharacter, binding: iBinding, amount: number) => iEffect[];
    onEscape?: (actor: iCharacter, target: iCharacter, binding: iBinding, amount: number, spread: number) => iEffect[];
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

export interface StatusLevelDef {
    hasActed?: boolean;
    hasBonusEscapes?: boolean;
    isStanding?: boolean;
    modifiers?: Partial<Record<ModifierId, number>>;
    allowedMoveTypes?: MoveType[];
    blockedMoveTypes?: MoveType[];
    blocksAttack?: boolean;
    blocksEscape?: boolean;
    blocksAssist?: boolean;
    blocksBonusEscape?: boolean;
    blocksMoving?: boolean;
    skipsTraps?: boolean;
    skipsTurn?: boolean;
    incapacitated?: boolean;
}

export interface EncounterDef {
    id: string;
    enemies: EnemyDef[];
    bindings: BindingDef[];
    traps: TrapSetup[];
    setup?: (state: iGameState) => iEffect[];
}

export interface TrapSetup {
    definition: TrapDef;
    amount: number;
}

