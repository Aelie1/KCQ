export interface GameState {
    turn: TurnState;
    characters: CharacterState[];
    enemies: EnemyState[];
}

export interface Buff {
    id: string;
}

export interface BuffState {
    definition: Buff;
    duration: number;
    effect: number;
}

export interface Character {
    id: string;
    moves: Move[];
    passives: Passive[];
}

export interface MoveInfo {
    id: string;
    target: TargetType;
    targets: number;
    type: MoveType;
}

export interface Move extends MoveInfo {
    activate: (state: GameState, actor: EntityId, targets: EntityId[]) => void;
}

export interface ActionInfo {
    move: MoveInfo;
    available: boolean;
    reason?: ActionUnavailableReason;
}

export type ActionUnavailableReason =
    | "wrongPhase"
    | "actorAlreadyActed"
    | "moveUnavailable"
    | "onCooldown"
    | "insufficientResource"
    | "bindingRestriction";

export interface Passive {
    id: string;
}

export interface CharacterState {
    definition: Character;
    acted: boolean;
    bindings: BindingState[];
    buffs: BuffState[];
}

export interface BindingState {
    id: BindingId;
    ownerId: EntityId;
    value: number;
}

export interface Enemy {
    id: string;
    hp: number;
    defense: number;
    moves: Move[];
    passives: Passive[];
    ai: (state: GameState) => GameAction;
}

export interface EnemyState {
    id: EntityId;
    definition: Enemy;
    currHp: number;
    currDef: number;
    buffs: BuffState[];
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
export type BindingId = string;
export type Phase =
    | "player"
    | "enemy";

export interface TurnState {
    round: number;
    step: number;
    phase: Phase;
}

export type GameAction = AttackAction | EscapeAction | EndTurnAction;

export interface AttackAction {
    type: "attack";
    actorId: EntityId;
    moveId: Move;
    targetId: EntityId;
}

export interface EscapeAction {
    type: "escape";
    actorId: EntityId;
    targetTrackId: BindingId;
}

export interface EndTurnAction {
    type: "endTurn";
}

export type GameEvent =
    | {
        type: "moveUsed";
        actorId: EntityId;
        moveId: Move;
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
        trackId: BindingId;
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