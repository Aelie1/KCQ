export interface GameState {
    metadata: StateMetadata;
    characters: CharacterState[];
    enemies: EnemyState[];
}

export interface CharacterDefinition {
    id: string;
    moves: MoveDefinition[];
    passives: PassiveDefinition[];
}

export interface MoveDefinition {
    id: string;
    target: TargetType;
    targets: number;
    type: MoveType;
    activate: (state: GameState, actor: EntityId, targets: EntityId[]) => void;
}

export interface PassiveDefinition {
    id: string;
}

export interface CharacterState {
    definition: CharacterDefinition;
    acted: boolean;
    bindingTracks: BindingTrackState[];
}

export interface BindingTrackState {
    id: BindingTrackId;
    ownerId: EntityId;
    value: number;
}

export interface EnemyState {
    id: EntityId;
    name: string;
}

export type ActionResult = ActionSuccess | ActionFailure;

export interface ActionSuccess {
    success: true;
    state: GameState;
    events: GameEvent[];
}

export interface ActionFailure {
    success: false;
    reason: ActionFailureReason;
}

export type ActionFailureReason =
    | "invalidActor"
    | "invalidTarget"
    | "invalidMove"
    | "wrongPhase"
    | "actorAlreadyActed"
    | "moveUnavailable"
    | "cannotEscapeTrack";

export type MoveType =
    | "physical"
    | "mystical"
    | "agility";

export type TargetType =
    | "ally"
    | "enemy";

export type EntityId = string;
export type BindingTrackId = string;
export type Phase =
    | "player"
    | "enemy";

export interface StateMetadata {
    round: number;
    step: number;
    phase: Phase;
}

export type GameAction = AttackAction | EscapeAction | EndTurnAction;

export interface AttackAction {
    type: "attack";
    actorId: EntityId;
    moveId: MoveDefinition;
    targetId: EntityId;
}

export interface EscapeAction {
    type: "escape";
    actorId: EntityId;
    targetTrackId: BindingTrackId;
}

export interface EndTurnAction {
    type: "endTurn";
}

export type GameEvent =
    | {
        type: "moveUsed";
        actorId: EntityId;
        moveId: MoveDefinition;
        targetIds: EntityId[];
    }
    | {
        type: "damage";
        sourceId: EntityId;
        targetId: EntityId;
        amount: number;
    }
    | {
        type: "bondageChanged";
        targetId: EntityId;
        trackId: BindingTrackId;
        oldValue: number;
        newValue: number;
    }
    | {
        type: "phaseChanged";
        from: Phase;
        to: Phase;
    };

export interface HistoryEntry {
    action?: GameAction;
    events: GameEvent[];
    state: GameState;
}