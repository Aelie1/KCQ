import { Random } from "./random";
import {
    AccuracyProfile, ActionFailureReason, Binding, BindingEffect, BindingLevel, Buff, BuffEffect, Character, DamageEffect,
    Enemy, EnemyEffect, EntityId, HitBand, InvalidTarget, ModifierId, Move, MoveType, Passive, StatusId, TargetInfo, Turn, ValidTarget
} from "./types";

export type iEntity = iCharacter | iEnemy;

export interface iGameState {
    turn: Turn;
    nextEntityId: number;
    characters: iCharacter[];
    enemies: iEnemy[];
}

/*******************************************************
 * Characters
 *******************************************************/
export interface iCharacter extends Omit<Character, "buffs" | "bindings" | "modifiers" | "blockedMoveTypes"> {
    definition: CharacterDef;
    buffs: iBuff[];
    bindings: iBinding[];
}

export interface CharacterDef {
    id: string;
    moves: MoveDef[];
    passives: PassiveDef[];
}

/*******************************************************
 * Enemies
 *******************************************************/

export interface iEnemy extends Omit<Enemy, "buffs" | "intention"> {
    definition: EnemyDef;
    intention: iIntention | null;
    buffs: iBuff[];
}

export interface EnemyDef {
    id: string;
    hp: number;
    defense: number;
    passives: PassiveDef[];
    ai: (state: iGameState, actor: iEnemy, rng: Random) => EnemyAction;
    onDamage?: (state: iGameState, actor: iEntity, target: iEnemy, damage: number) => iEffect[];
    onDefeat?: (state: iGameState, target: iEnemy) => iEffect[];
}

export interface iIntention {
    actor: iEntity;
    move: iMove;
    rolls: iIntentionRoll[];
}

export interface iIntentionRoll {
    target: iEntity | null;
    roll: number;    
}

export interface EnemyAction {
    actor: iEntity;
    move: iMove;
    targets: iEntity[];
}


/*******************************************************
 * Buffs
 *******************************************************/

export interface iBuff extends Omit<Buff, "statuses"> {
    statuses?: iStatus[];
    addedMoves?: MoveDef[];
}

/*******************************************************
 * Moves
 *******************************************************/
export interface iMove {
    definition: MoveDef;
    binding?: BindingDef;
    band?: HitBand;
    effectiveness?: number;
    roll?: number;
}

export interface MoveDef extends Move{
    accuracy?: AccuracyProfile;
    alwaysAvailable?: boolean;
    baseDamage?: number;
    cooldown?: number;
    freeOnHit?: boolean;
    resolve: (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]) => iEffect[];
}


export interface iTargetInfo extends Omit<TargetInfo, "target" | "effects"> {
    target: iEntity;
    effectiveness: number;
}

export type iValidityInfo = iValidTarget | iInvalidTarget;

interface iValidTarget extends Omit<ValidTarget,"target"> {
    valid: true;
    target: iEntity | null;
    accuracy: AccuracyProfile | null;
}

interface iInvalidTarget extends Omit<InvalidTarget,"target"> {
    valid: false;
    target: iEntity | null;
    reason: ActionFailureReason;
}

/*******************************************************
 * Effects
 *******************************************************/

export type iEffect =
    | iDamageEffect
    | iBindingEffect
    | iBuffEffect
    | iEnemyEffect
    | iCooldownEffect;

interface iDamageEffect extends Omit<DamageEffect, "source" | "target"> {
    source: iEntity;
    target: iEnemy;
}

interface iBindingEffect  extends Omit<BindingEffect, "target" | "binding"> {
    target: iCharacter;
    binding: BindingDef;
}

interface iBuffEffect extends Omit<BuffEffect, "target" | "buff">  {
    target: iEntity;
    buff: iBuff;
    linked?: boolean;
}

interface iEnemyEffect extends Omit<EnemyEffect, "target">  {
    target: EnemyDef;
    id?: EntityId;
    buff?: iBuff;
}

interface iCooldownEffect {
    type: "cooldown";
    target: iEnemy;
    move: MoveDef;
    value: number;
}


/*******************************************************
 * Passives
 *******************************************************/
export interface iPassive extends Passive {
    definition: PassiveDef;
}

export interface PassiveDef {
    id: string;
}

/*******************************************************
 * Bindings
 *******************************************************/

export interface iBinding extends Omit<Binding, "level" | "status"> {
    definition: BindingDef;
}

export interface BindingDef {
    id: string;
    status?: Partial<Record<BindingLevel, iStatus[]>>;
    data?: Record<string, number>;
    onAdd?: (state: iGameState, target:iCharacter, binding: iBinding, amount: number) => iEffect[];
    onEscape?: (actor: iCharacter, target: iCharacter, binding: iBinding, amount: number) => iEffect[];
}

/*******************************************************
 * Statuses
 *******************************************************/

export type iStatus = {
    definition: StatusDef;
    value: number;
}

export function s(definition: StatusDef, value: number): iStatus {
    return { definition, value };
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

/*******************************************************
 * Encounters
 *******************************************************/

export interface EncounterDef {
    id: string;
    enemies: EnemyDef[];
    bindings: BindingDef[];
    setup?: (state: iGameState) => void;
}
