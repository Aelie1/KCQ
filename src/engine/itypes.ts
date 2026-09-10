import { Random } from "./random";
import { AccuracyProfile, Binding, BindingEffect, BindingLevel, Buff, BuffEffect, Character, DamageEffect, Enemy, EntitySide, ModifierId, Move, MoveId, MoveType, Passive, StatusId, TargetCount, TargetInfo, Turn } from "./types";

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
export interface iCharacter extends Omit<Character, "buffs" | "bindings" | "status"> {
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
}

export interface iIntention {
    actor: iEntity;
    move: iMove;
    targets: iIntentionTarget[];
}

export interface iIntentionTarget {
    target: iEntity;
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
    roll?: number;
}

export interface MoveDef extends Move{
    accuracy?: AccuracyProfile;
    alwaysAvailable?: boolean;
    baseDamage?: number;
    cooldown?: number;
    resolve: (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]) => iEffect[];
    isValid?: (state: iGameState, actor: iEntity, targets: iEntity[]) => boolean;
}


export interface iTargetInfo extends Omit<TargetInfo, "target" | "effects"> {
    target: iEntity;
    effectiveness: number;
}

/*******************************************************
 * Effects
 *******************************************************/

export type iEffect =
    | iDamageEffect
    | iBindingEffect
    | iBuffEffect;

export interface iDamageEffect extends Omit<DamageEffect, "target"> {
    target: iEnemy;
}

export interface iBindingEffect  extends Omit<BindingEffect, "target" | "binding"> {
    target: iCharacter;
    binding: BindingDef;
}

export interface iBuffEffect extends Omit<BuffEffect, "source" | "target" | "buff">  {
    source: iEntity;
    target: iEntity;
    buff: iBuff;
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

export interface iBinding extends Omit<Binding, "level"> {
    definition: BindingDef;
}

export interface BindingDef {
    id: string;
    status?: Partial<Record<BindingLevel, iStatus[]>>;
    initialState?: Record<string, number>;
    onAdd?: (binding: iBinding) => void;
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

export interface StatusLevelDef {
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
    setup?: (state: iGameState) => void;
}
