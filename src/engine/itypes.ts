import { AccuracyProfile, Binding, BindingEffect, BindingLevel, Buff, BuffEffect, Character, DamageEffect, Enemy, ModifierId, Move, MoveId, MoveType, Passive, StatusId, TargetInfo, Turn } from "./types";

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
    ai: (state: iGameState, actor: iEnemy) => EnemyAction;
}

export interface iIntention {
    action: EnemyAction;
    roll: number;
}

export interface EnemyAction {
    actor: iEntity;
    move: MoveDef;
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
export interface MoveDef extends Move {
    displayId?: MoveId;
    accuracy?: AccuracyProfile;
    alwaysAvailable?: boolean;
    resolve: (state: iGameState, actor: iEntity, targets: iTargetInfo[]) => iEffect[];
    isValid?: (state: iGameState, actor: iEntity, targets: iEntity[]) => boolean;
}

export interface DamageMoveDef extends MoveDef {
    baseDamage: number;
}

export interface BindingMoveDef extends MoveDef {
    baseDamage: number;
    binding: BindingDef;
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
