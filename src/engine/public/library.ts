import { AccuracyProfile, BindingId, BindingLevel, DifficultyId, Effect, EnemyRank, EnemySetup, EntityId, EntitySide, FlagId, ModifierSet, MoveId, MoveTrait, MoveType, PassiveId, StatusId, TargetCount, TrapId } from "./types";

export interface ContentLibrary {
    difficulties: Record<DifficultyId, DifficultyReference>;
    characters: Record<string, CharacterReference>;
    enemies: Record<string, EnemyReference>;
    moves: Record<MoveId, MoveReference>;
    passives: Record<PassiveId, PassiveReference>;
    bindings: Record<BindingId, BindingReference>;
    traps: Record<TrapId, TrapReference>;
    statuses: Record<StatusId, StatusReference>;
    encounters: Record<string, EncounterReference>;
}

export interface DifficultyReference {
    id: DifficultyId;
    playerModifiers: ModifierSet;
    enemyModifiers: ModifierSet;
}

export interface CharacterReference {
    id: EntityId;
    moves: MoveId[];
    passives: PassiveId[];
    empoweredMoves: MoveId[];
    /** Starting resources, detached from the character definition. */
    data?: Record<string, number>;
}

export interface EnemyReference {
    id: EntityId;
    rank: EnemyRank;
    hp: number;
    defense: number;
    moves: MoveId[];
    passives: PassiveId[];
}

export interface MoveReference {
    /** Owner of moves added during an encounter rather than present in the starting roster. */
    owner?: { category: "characters" | "enemies"; id: EntityId };
    id: MoveId;
    targetSide: EntitySide;
    targets: TargetCount;
    hits?: number;
    type: MoveType;
    traits?: MoveTrait[];
    bindings: BindingId[];
    accuracy?: AccuracyProfile;
    check?: "accuracy" | "willpower";
    alwaysAvailable?: boolean;
    baseDamage?: number;
    baseHits?: number;
    cooldown?: Record<MoveId, number>;
    /** Static buff mechanics; never evaluated against a fabricated combat state. */
    effects?: MoveBuffReference[];
    freeOnHit?: boolean;
    modifiers?: ModifierSet;
}

export interface MoveBuffReference {
    id: string;
    recipient: "self" | "selected" | "allies";
    duration?: number;
    modifiers?: ModifierSet;
    statuses?: StatusLevelReference[];
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
    effects: Record<number, Record<BindingId, number>>;
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
