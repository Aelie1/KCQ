import {
    Binding, BindingEffect, Buff, BuffEffect, Character, DamageEffect, Enemy, EnemyEffect, EntityId, HitBand,
    StanceId, TargetInfo, Trap, TrapEffect, Turn
} from "../public/types";
import { BindingDef, CharacterDef, EnemyDef, MoveDef, StatusDef, TrapDef } from "./definitions";

export type iEntity = iCharacter | iEnemy;

export interface iGameState {
    turn: Turn;
    nextId: Record<EntityId, number>;
    characters: iCharacter[];
    enemies: iEnemy[];
    traps: iTrap[];
}

export interface iCharacter extends Omit<Character, "buffs" | "bindings" | "modifiers" | "blockedMoveTypes"> {
    definition: CharacterDef;
    buffs: iBuff[];
    bindings: iBinding[];
}

export interface iEnemy extends Omit<Enemy, "buffs" | "intention"> {
    definition: EnemyDef;
    intention: iIntention[];
    buffs: iBuff[];
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

export interface iBuff extends Omit<Buff, "statuses"> {
    statuses?: iStatus[];
    addedMoves?: MoveDef[];
}

export interface iMove {
    definition: MoveDef;
    binding?: BindingDef;
    band?: HitBand;
    effectiveness?: number;
    roll?: number;
}

export interface iTargetInfo extends Omit<TargetInfo, "target" | "effects"> {
    target: iEntity;
    effectiveness: number;
}

export interface iBinding extends Omit<Binding, "level" | "status"> {
    definition: BindingDef;
}

export interface iTrap extends Trap {
    definition: TrapDef;
}

export type iStatus = {
    definition: StatusDef;
    value: number;
}

export type iEffect =
    | iDamageEffect
    | iBindingEffect
    | iBuffEffect
    | iEnemyEffect
    | iCooldownEffect
    | iTrapEffect
    | iStanceEffect
    | iMoveEffect;

interface iDamageEffect extends Omit<DamageEffect, "source" | "target"> {
    source: iEntity;
    target: iEnemy;
}

interface iBindingEffect extends Omit<BindingEffect, "target" | "binding"> {
    target: iCharacter;
    binding: BindingDef;
    onResolve?: (effect: iBindingEffect) => iEffect[];
}

interface iBuffEffect extends Omit<BuffEffect, "target" | "buff"> {
    target: iEntity;
    buff: iBuff;
    linked?: boolean;
}

interface iEnemyEffect extends Omit<EnemyEffect, "target"> {
    operation: "spawn";
    definition: EnemyDef;
    id?: EntityId;
    buff?: iBuff;
    hpRatio?: number;
}

interface iCooldownEffect {
    type: "cooldown";
    target: iEnemy;
    move: MoveDef;
    value: number;
}

interface iTrapEffect extends Omit<TrapEffect, "trap" | "actor"> {
    actor: iEntity;
    trap: iTrap;
}

interface iStanceEffect {
    type: "stance";
    actor: iCharacter;
    stance: StanceId;
}

interface iMoveEffect {
    type: "move"
    actor: iEntity;
    move: iMove;
    targets: iEntity[];
}