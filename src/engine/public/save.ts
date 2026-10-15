import { BindingId, BuffId, CallbackId, DefinitionId, DifficultyId, EncounterId, EntityId, HitBand, ModifierSet, MoveId, MoveListModifier, Phase, Status, Trap } from "./types";

export interface SaveState {
    seed: number;
    aiRng: number;
    accRng: number;
    turn: SaveTurn;
    nextId: Record<EntityId, number>;
    characters: SaveCharacter[];
    enemies: SaveEnemy[];
    traps: Trap[];
    encounter: EncounterId | null;
    difficulty: DifficultyId;
}

export interface SaveTurn {
    round: number;
    step: number;
    phase: Phase;
}

export interface SaveCharacter {
    id: EntityId;
    acted: boolean;
    standing: boolean;
    bonusEscapes: number;
    bindings: SaveBinding[];
    buffs: SaveBuff[];
    cooldowns: Record<MoveId, number>;
    data: Record<string, number>;
}

export interface SaveEnemy {
    id: EntityId;
    defId: DefinitionId;
    currHp: number;
    intentions: SaveIntention[];
    buffs: SaveBuff[];
    cooldowns: Record<MoveId, number>;
}

export interface SaveIntention {
    actor: EntityId;
    move: SaveMove;
    rolls: SaveIntentionRoll[];
    resolved: boolean;
}

export interface SaveIntentionRoll {
    target: EntityId | null;
    roll: number;
}

export interface SaveMove {
    definition: MoveId;
    binding?: BindingId;
    band?: HitBand;
    effectiveness?: number;
    roll?: number;
    data?: Record<string, number>;
}

export interface SaveBuff {
    id: BuffId;
    icon?: "shield" | "sword" | "shield-off" | "crown" | "sun" | "ambush" | "sprayer";
    severity?: number;
    duration?: number;
    statuses?: Status[];
    modifiers?: ModifierSet;
    moveList?: MoveListModifier;
    linkedEntity?: EntityId;
    active: boolean;
    callback?: CallbackId;
}

export interface SaveBinding {
    id: BindingId;
    value: number;
    data: Record<string, number>;
}