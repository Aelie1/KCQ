import { AccuracyProfile, BindingId, BindingLevel, Effect, EnemySetup, EntityId, EntitySide, FlagId, ModifierSet, MoveId, MoveType, PassiveId, StatusId, TargetCount, TrapId } from "./types";

export interface ContentLibrary {
    characters: Record<string, CharacterReference>;
    enemies: Record<string, EnemyReference>;
    moves: Record<MoveId, MoveReference>;
    passives: Record<PassiveId, PassiveReference>;
    bindings: Record<BindingId, BindingReference>;
    traps: Record<TrapId, TrapReference>;
    statuses: Record<StatusId, StatusReference>;
    encounters: Record<string, EncounterReference>;
}

export interface CharacterReference {
    id: EntityId;
    moves: MoveId[];
    passives: PassiveId[];
    empoweredMoves: MoveId[];
}

export interface EnemyReference {
    id: EntityId;
    rank: "minion" | "enemy" | "boss";
    hp: number;
    defense: number;
    moves: MoveId[];
    passives: PassiveId[];
}

export interface MoveReference {
    id: MoveId;
    targetSide: EntitySide;
    targets: TargetCount;
    hits?: number;
    type: MoveType;
    bindings: BindingId[];
    accuracy?: AccuracyProfile;
    check?: "accuracy" | "willpower";
    alwaysAvailable?: boolean;
    baseDamage?: number;
    baseHits?: number;
    cooldown?: Record<MoveId, number>;
    freeOnHit?: boolean;
    modifiers?: ModifierSet;
}

export interface PassiveReference {
    id: PassiveId;
    status?: ModifierReference;
    immunities?: StatusId[];
}

export interface BindingReference {
    id: BindingId;
    status?: Partial<Record<BindingLevel, StatusLevelReference[]>>;
}

export interface TrapReference {
    id: TrapId;
}

export interface StatusLevelReference {
    id: StatusId;
    level: number;
}

export interface StatusReference {
    id: StatusId;
    modifiers: ModifierReference[];
}

export interface ModifierReference {
    modifiers?: ModifierSet;
    flags?: FlagId[];
    allowedMoveTypes?: MoveType[];
    blockedMoveTypes?: MoveType[];
}

export interface EncounterReference {
    id: string;
    stars: number;
    enemies: EnemySetup[];
    bindings: BindingId[];
    traps: TrapId[];
    setup: Effect[];
}
