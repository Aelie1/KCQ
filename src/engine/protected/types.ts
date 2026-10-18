import {
    Binding, BindingEffect, Buff, BuffEffect, Character, DamageEffect,
    Difficulty,
    Enemy, EnemyEffect, EntityId,
    HitBand,
    StanceId, TargetInfo,
    Trap, TrapEffect, Turn
} from "../public/types";
import { BindingDef, CallbackDef, CampaignDef, CharacterDef, EncounterDef, EnemyDef, MoveDef, PassiveDef, StatusDef, TrapDef } from "./definitions";

export interface ContentCatalog {
    characters: CharacterDef[];
    enemies: EnemyDef[];
    moves: MoveDef[];
    passives: PassiveDef[];
    bindings: BindingDef[];
    traps: TrapDef[];
    statuses: StatusDef[];
    callbacks: CallbackDef[];
    encounters: EncounterDef[];
    campaigns: CampaignDef[];
}

export type ContentCatalogFragment = Partial<ContentCatalog>;

export type iEntity = iCharacter | iEnemy;

export interface iGameState {
    turn: iTurn;
    nextId: Record<EntityId, number>;
    characters: iCharacter[];
    enemies: iEnemy[];
    traps: iTrap[];
    encounter: EncounterDef | null;
    difficulty: Difficulty;
}

interface iTurn extends Omit<Turn, "outcome"> { };

export interface iCharacter extends Omit<Character, "buffs" | "bindings" | "modifiers" | "blockedMoveTypes"> {
    definition: CharacterDef;
    buffs: iBuff[];
    bindings: iBinding[];
}

export interface iEnemy extends Omit<Enemy, "buffs" | "intentions" | "modifiers" | "rank" | "defense" | "maxHp"> {
    definition: EnemyDef;
    intentions: iIntention[];
    buffs: iBuff[];
    data: Record<string, number>;
}

export interface iIntention {
    actor: iEntity;
    move: iMove;
    rolls: iIntentionRoll[];
    resolved: boolean;
}

export interface iIntentionRoll {
    target: iEntity | null;
    roll: number;
}


export interface iMoveListModifier {
    addedMoves?: MoveDef[];
    blockedMoves?: MoveDef[];
}

export interface iBuff extends Omit<Buff, "statuses" | "moveList"> {
    active: boolean;
    statuses?: iStatus[];
    moveList?: iMoveListModifier;
    callback?: CallbackDef;
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

export interface iMoveResult {
    effects: iEffect[];
    targets: iTargetResult[];
}

export interface iTargetResult {
    target: iEntity;
    result: HitBand;
    effects: iEffect[];
}

export interface iTargetInfo extends Omit<TargetInfo, "target" | "effects"> {
    target: iEntity;
    effectiveness: number;
}

export interface iBinding extends Omit<Binding, "level" | "status" | "tickEffects"> {
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
    | iDefeatEffect
    | iCooldownEffect
    | iTrapEffect
    | iStanceEffect
    | iMoveEffect
    | iRefreshEffect
    | iRetargetEffect
    | iCancelEffect
    | iWeakenEffect
    | iDiscordEffect
    | iDataEffect
    | iTickEffect
    | iBonusEffect;

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
    definition: EntityId;
    id?: EntityId;
    buff?: iBuff;
    hpRatio?: number;
}

interface iDefeatEffect extends Omit<EnemyEffect, "target"> {
    operation: "defeat";
    target: iEnemy;
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
}

interface iDiscordEffect {
    type: "intention"
    operation: "discord";
    target: iEnemy;
}

interface iWeakenEffect {
    type: "intention"
    operation: "weaken";
    target: iEnemy;
    amount: number;
}

interface iBonusEffect {
    type: "bonus"
    target: iCharacter;
    amount: number;
}

interface iDataEffect {
    type: "data"
    target: iEntity;
    name: string;
    amount: number;
    visible: boolean;
}

interface iTickEffect {
    type: "tick"
    operation: "start" | "end";
    target: iEntity;
    binding: iBinding;
}