import { Buff, Character, Enemy, GameAction, GameEvent, Move, Passive, Turn } from "./types";

export type iEntity = iCharacter | iEnemy;

export interface iGameState {
    turn: Turn;
    characters: iCharacter[];
    enemies: iEnemy[];
}

/*******************************************************
 * Characters
 *******************************************************/
export interface iCharacter extends Omit<Character, "buffs"> {
    definition: CharacterDef;
    buffs: iBuff[];
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
    ai: (state: iGameState) => GameAction;
}

/*******************************************************
 * Buffs
 *******************************************************/

export interface iBuff extends Buff {
    definition: BuffDef;
}

export interface BuffDef {
    id: string;
}


/*******************************************************
 * Moves
 *******************************************************/
export interface MoveDef extends Move {
    activate: (state: iGameState, actor: iEntity, targets: iEntity[]) => GameEvent[];
    isValid: (state: iGameState, actor: iEntity, targets: iEntity[]) => boolean;
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
