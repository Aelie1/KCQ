export interface GameState {
    metadata: StateMetadata;
    characters: CharacterState[];
    enemies: EnemyState[];
}

interface CharacterState {
    id: EntityId;
    name: string;
    acted: boolean;
    bindingTracks: BindingTrackState[];
}

interface BindingTrackState {
    id: BindingTrackId;
    ownerId: EntityId;
    value: number;
}

interface EnemyState {
    id: EntityId;
    name: string;
}

type ActionResult = ActionSuccess | ActionFailure;

interface ActionSuccess {
    success: true;
    state: GameState;
    events: GameEvent[];
}

interface ActionFailure {
    success: false;
    reason: ActionFailureReason;
}

type ActionFailureReason =
    | "invalidActor"
    | "invalidTarget"
    | "invalidMove"
    | "wrongPhase"
    | "actorAlreadyActed"
    | "moveUnavailable"
    | "cannotEscapeTrack";

type EntityId = string;
type BindingTrackId = string;
type MoveId = string;
type Phase =
    | "player"
    | "enemy";

interface StateMetadata {
    round: number;
    step: number;
    phase: Phase;
}

type GameAction = AttackAction | EscapeAction | EndTurnAction;

interface AttackAction {
    type: "attack";
    actorId: EntityId;
    moveId: MoveId;
    targetId: EntityId;
}

interface EscapeAction {
    type: "escape";
    actorId: EntityId;
    targetTrackId: BindingTrackId;
}

interface EndTurnAction {
    type: "endTurn";
}

type GameEvent =
    | {
        type: "moveUsed";
        actorId: EntityId;
        moveId: MoveId;
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

interface HistoryEntry {
    action?: GameAction;
    events: GameEvent[];
    state: GameState;
}