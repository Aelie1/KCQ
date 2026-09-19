import {
    Binding, BindingEffect, Buff, BuffEffect, Character, DamageEffect, Enemy, EnemyEffect, EntityId, HitBand,
    StanceId, TargetInfo, Trap, TrapEffect, Turn
} from "../public/types";
import { BindingDef, CharacterDef, EncounterDef, EnemyDef, MoveDef, StatusDef, TrapDef } from "./definitions";

export type iEntity = iCharacter | iEnemy;

export interface iGameState {
    turn: iTurn;
    nextId: Record<EntityId, number>;
    characters: iCharacter[];
    enemies: iEnemy[];
    traps: iTrap[];
    encounter: EncounterDef | null;
}

interface iTurn extends Omit<Turn, "outcome"> { };

export interface iCharacter extends Omit<Character, "buffs" | "bindings" | "modifiers" | "blockedMoveTypes"> {
    definition: CharacterDef;
    buffs: iBuff[];
    bindings: iBinding[];
}

export interface iEnemy extends Omit<Enemy, "buffs" | "intentions"> {
    definition: EnemyDef;
    intentions: iIntention[];
    buffs: iBuff[];
    data: Record<string, number>;
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
    active: boolean;
    statuses?: iStatus[];
    addedMoves?: MoveDef[];
    modifyDamage?: (target: iEnemy, buff: iBuff, amount: number) => iCallbackReturn;
    modifyBinding?: (state: iGameState, actor: iEntity, target: iCharacter, buff: iBuff, binding: BindingDef, amount: number) => iCallbackReturn;
}

export interface iCallbackReturn {
    value: number;
    effects: iEffect[];
}

export interface iMove {
    definition: MoveDef;
    binding?: BindingDef;
    band?: HitBand;
    effectiveness?: number;
    roll?: number;
    data?: Record<string, number>;
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
    | iMoveEffect
    | iRefreshEffect
    | iRetargetEffect
    | iCancelEffect
    | iDataEffect;

interface iDamageEffect extends Omit<DamageEffect, "source" | "target"> {
    source: iEntity;
    target: iEnemy;
}

interface iBindingEffect extends Omit<BindingEffect, "target" | "binding"> {
    source: iEntity;
    target: iCharacter;
    binding: BindingDef;
    onResolve?: (effect: iBindingEffect) => iEffect[];
}

interface iBuffEffect extends Omit<BuffEffect, "target" | "buff" | "effects"> {
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

export interface iMoveEffect {
    type: "move"
    actor: iEntity;
    move: iMove;
    targets: iEntity[];
}

interface iRefreshEffect {
    type: "refresh"
    target: iCharacter;
}

interface iRetargetEffect {
    type: "intention"
    operation: "target";
    target: iEnemy;
    destination: iCharacter;
}

interface iCancelEffect {
    type: "intention"
    operation: "cancel";
    target: iEnemy;
    amount: number;
}

interface iDataEffect {
    type: "data"
    target: iEntity;
    name: string;
    amount: number;
}