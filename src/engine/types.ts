export type MoveType = "arms" | "mouth" | "legs" | "enemy";
export type EntityId = string;
export type BindingId = string;
export type BuffId = string;
export type MoveId = string;
export type Phase = "player" | "enemy";
export type EntitySide = "player" | "enemy";

export interface GameState {
    turn: Turn;
    characters: Character[];
    enemies: Enemy[];
}

export interface Turn {
    round: number;
    step: number;
    phase: Phase;
}

export interface Character {
    id: EntityId;
    acted: boolean;
    bindings: Binding[];
    buffs: Buff[];
}

export interface Enemy {
    id: EntityId;
    currHp: number;
    currDef: number;
    intention: GameAction | null;
    buffs: Buff[];
}

export interface Buff {
    duration: number;
    effect: number;
}

export interface Passive {
    id: string;
}

export interface Move {
    id: string;
    target: EntitySide;
    targets: number;
    type: MoveType;
}

export interface Binding {
    id: BindingId;
    value: number;
}

/*******************************************************
 * Actions
 *******************************************************/

export interface ActionInfo {
    move: Move;
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

export type GameAction = AttackAction | EscapeAction | EndTurnAction;

export interface AttackAction {
    type: "attack";
    actor: EntityId;
    move: MoveId;
    targets: EntityId[];
}

export interface EscapeAction {
    type: "escape";
    actor: EntityId;
    target: EntityId;
    binding: BindingId;
}

export interface EndTurnAction {
    type: "endTurn";
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
    | "invalidBinding"
    | "wrongPhase"
    | "actorAlreadyActed"
    | "moveUnavailable"
    | "cannotEscapeTrack";



/*******************************************************
 * Events
 ********************************************************/

export type GameEvent = MoveEvent | DamageEvent | BondageEvent | PhaseEvent | BuffEvent | DefeatEvent;

export interface MoveEvent {
    type: "moveUsed";
    actor: EntityId;
    move: MoveId;
    targets: EntityId[];
}

export interface DamageEvent {
    type: "damage";
    target: EntityId;
    amount: number;
}
export interface BondageEvent {
    type: "bondageChanged" | "bondageAdded" | "bondageRemoved";
    target: EntityId;
    binding: BindingId;
    amount: number;
}
export interface PhaseEvent {
    type: "phaseChanged";
    phase: Phase;
}
export interface BuffEvent {
    type: "buff";
    target: EntityId;
    buff: BuffId;
}
export interface DefeatEvent {
    type: "enemyDefeated";
    target: EntityId;
}

/*******************************************************
 * History
 *******************************************************/

export interface HistoryEntry {
    action?: GameAction;
    events: GameEvent[];
    state: GameState;
}