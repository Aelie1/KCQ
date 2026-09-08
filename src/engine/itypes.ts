import { AccuracyProfile, AccuracyResult, Binding, BindingLevel, Buff, Character, Enemy, EntitySide, GameAction, GameEvent, GameState, ModifierId, Move, MoveType, Passive, StatusId, Turn } from "./types";

export type iEntity = iCharacter | iEnemy;

export interface iGameState {
    turn: Turn;
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

export interface iEnemy extends Omit<Enemy, "buffs"> {
    definition: EnemyDef;
    buffs: iBuff[];
}

export interface EnemyDef {
    id: string;
    hp: number;
    defense: number;
    moves: MoveDef[];
    passives: PassiveDef[];
    ai: (state: iGameState, actor: iEnemy) => GameAction;
}

/*******************************************************
 * Buffs
 *******************************************************/

export interface iBuff extends Omit<Buff,"statuses"> {
    statuses: iStatus[];
}




/*******************************************************
 * Moves
 *******************************************************/
export interface MoveDef extends Move {
    accuracy: AccuracyProfile;
    activate: (state: iGameState, actor: iEntity, targets: TargetInfo[]) => GameEvent[];
    isValid?: (state: iGameState, actor: iEntity, targets: iEntity[]) => boolean;
}

export interface DamageMoveDef extends MoveDef {
    baseDamage: number;
}

export interface TargetInfo {
    target: iEntity;
    result: AccuracyResult; //What band is it in
    effectiveness: number; //How strong is the hit?
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
    status: Record<BindingLevel, iStatus[]>;
    initialState: Record<string,number>;
    onBindingAdd?: (binding: iBinding) => void;
}

/*******************************************************
 * Statuses
 *******************************************************/

export interface iStatus {
    definition: StatusDef;
    value: number;
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
