import type { AccuracyProfile, BindingId, BindingLevel, Effect, EncounterId, EnemySetup, EntityId, FailureReason, FlagId, ModifierSet, Move, MoveId, MoveType, PassiveId, StatusId, TrapId } from "../public/types";
import type { Random } from "./random";
import type { iBinding, iCharacter, iEffect, iEnemy, iEntity, iGameState, iMove, iMoveEffect, iMoveResult, iStatus, iTargetInfo, iTrap } from "./types";

export const EMPOWERMENT_BUFF = "empowerment";

export interface CharacterDef {
    id: EntityId;
    moves: MoveDef[];
    passives: PassiveDef[];
    empoweredMoves: MoveDef[];
    data?: Record<string, number>;
}

export interface EnemyDef {
    id: EntityId;
    rank: "minion" | "enemy" | "boss";
    hp: number;
    defense: number;
    passives: PassiveDef[];
    moves: MoveDef[];
    ai: (state: iGameState, actor: iEnemy, rng: Random) => iMoveEffect[];
    onDamage?: (state: iGameState, actor: iEntity, target: iEnemy, damage: number) => iEffect[];
    onDefeat?: (state: iGameState, target: iEnemy) => iEffect[];
}

export interface MoveDef extends Move {
    index?: number;
    accuracy?: AccuracyProfile;
    check?: "accuracy" | "willpower";
    alwaysAvailable?: boolean;
    baseDamage?: number;
    baseHits?: number;
    cooldown?: Record<MoveId, number>;
    modifiers?: ModifierSet;
    bindings?: BindingDef[];
    getHits?: (actor: iEntity, move: MoveDef) => number;
    resolve: (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]) => iMoveResult;
    isValid?: (move: MoveDef, actor: iEntity) => FailureReason | undefined;
    isValidTarget?: (move: MoveDef, target: iEntity | null) => FailureReason | undefined;
}

export interface PassiveDef {
    id: PassiveId;
    status?: StatusLevelDef;
    immunities?: StatusDef[];
}

export interface BindingDef {
    id: BindingId;
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
    modifiers?: ModifierSet;
    flags?: FlagId[];
    allowedMoveTypes?: MoveType[];
    blockedMoveTypes?: MoveType[];
}

export interface EncounterDef {
    id: EncounterId;
    stars: number;
    enemies: EnemySetup[];
    bindings: BindingDef[];
    traps: TrapSetup[];
    setup?: (state: iGameState) => iEffect[];
    librarySetup?: () => Effect[];
}

export interface TrapSetup {
    definition: TrapDef;
    amount: number;
}

