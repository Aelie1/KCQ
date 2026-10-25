import type { MoveBuffReference, MoveReference } from "../public/library";
import type { AccuracyProfile, BindingId, BindingLevel, CallbackId, CampaignId, CampaignLayout, Effect, EncounterId, EnemyRank, EnemySetup, EntityId, FailureReason, FlagId, ModifierSet, Move, MoveId, MoveType, PassiveId, StatusId, TrapId } from "../public/types";
import type { Random } from "./random";
import type { iBinding, iBuff, iCallbackReturn, iCharacter, iEffect, iEnemy, iEntity, iGameState, iMove, iMoveEffect, iMoveResult, iStatus, iTargetInfo } from "./types";

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
    rank: EnemyRank;
    hp: number;
    defense: number;
    passives: PassiveDef[];
    moves: MoveDef[];
    ai: (state: iGameState, actor: iEnemy, rng: Random) => iMoveEffect[];
    onDamage?: (state: iGameState, actor: iEntity, target: iEnemy, damage: number) => iEffect[];
    onDefeat?: (state: iGameState, target: iEnemy) => iEffect[];
}

export interface MoveDef extends Move {
    /** Detached static reference information; not used by combat resolution. */
    libraryEffects?: MoveBuffReference[];
    libraryOwner?: MoveReference["owner"];
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
    isValid?: (state: iGameState, move: MoveDef, actor: iEntity) => FailureReason | undefined;
    isValidTarget?: (move: MoveDef, target: iEntity | null) => FailureReason | undefined;
}

export interface PassiveDef {
    id: PassiveId;
    status?: StatusLevelDef;
    getStatus?: (target: iEntity) => StatusLevelDef;
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
    outcomes: TrapOutcome[];
}

export type TrapOutcome = {
    severity: number;
    threshold: number;
    bindings: [BindingDef, number][];
};

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

export interface CallbackDef {
    id: CallbackId;
    modifyDamage?: (target: iEnemy, buff: iBuff, amount: number) => iCallbackReturn;
    modifyBinding?: (state: iGameState, actor: iEntity, target: iCharacter, buff: iBuff, binding: BindingDef, amount: number) => iCallbackReturn;
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

export interface CampaignDef {
    id: CampaignId,
    initial: EncounterId[];
    victory: Record<EncounterId, EncounterId[]>;
    defeat: Record<EncounterId, EncounterId[]>;
    layout?: CampaignLayout;
}