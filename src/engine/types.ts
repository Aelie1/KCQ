/*******************************************************
 * State
 *******************************************************/

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

export type Phase = "player" | "enemy";

export type EntityId = string;

export type EntitySide = "player" | "enemy";

/*******************************************************
 * Characters
 *******************************************************/

export interface Character {
    id: EntityId;
    acted: boolean;
    standing: boolean;
    bonusEscapes: number;
    bindings: Binding[];
    buffs: Buff[];
    status: Status[];
}

/*******************************************************
 * Enemies
 *******************************************************/

export interface Enemy {
    id: EntityId;
    currHp: number;
    currDef: number;
    intention: GameAction | null;
    buffs: Buff[];
}

/*******************************************************
 * Buffs
 *******************************************************/

export interface Buff {
    duration: number;
    effect: number;
}

export type BuffId = string;

/*******************************************************
 * Passives
 *******************************************************/

export interface Passive {
    id: string;
}

/*******************************************************
 * Moves
 *******************************************************/

export interface Move {
    id: string;
    target: EntitySide;
    targets: TargetCount;
    type: MoveType;
}

export type MoveType =
    | "arms"
    | "mouth"
    | "legs"
    | "enemy";

export type MoveId = string;

export type AccuracyResult = "miss" | "graze" | "hit" | "crit";

export type AccuracyProfile = Partial<Record<AccuracyResult, number>>;

export type TargetCount = number | "all"

/*******************************************************
 * Bindings
 *******************************************************/

export interface Binding {
    id: BindingId;
    value: number;
    level: BindingLevel;
    state: Record<string, number>;
}

export type BindingId = string;

export type BindingLevel =
    | "none"
    | "easy"
    | "medium"
    | "hard"
    | "extreme"
    | "impossible"


/*******************************************************
 * Statuses
 *******************************************************/

export interface Status {
    id: StatusId;
    value: number;
}

export type StatusId =
    | "bound"
    | "gagged"
    | "hobbled"
    | "vibrating"
    | "submissive"
    | "breathless"
    | "blinded"
    | "immobilized"
    | "helpless"
    | "stunned"
    | "incapacitated";

export type ModifierId = 
    | "hitarms" 
    | "hitmouth" 
    | "hitlegs" 
    | "defense" 
    | "escape" 
    | "enemyeffect" 
    | "traps" 
    | "willpower"


/*******************************************************
 * Actions
 *******************************************************/

export interface ActionInfo {
    move: Move;
    available: boolean;
    reason?: ActionFailureReason;
}

export type GameAction = AttackAction | EscapeAction | StanceAction | EndTurnAction;

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

export interface StanceAction {
    type: "stance";
    actor: EntityId;
    stance: StanceId;
}

export type StanceId = "standing" | "moving";

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
    | "actorImmobilized"
    | "assistUnavailable"
    | "escapeUnavailable"
    | "statusRestriction"
    | "bindingRestriction";



/*******************************************************
 * Events
 ********************************************************/

export type GameEvent = MoveEvent | AccuracyEvent | DamageEvent | BondageEvent | PhaseEvent | BuffEvent | DefeatEvent | StanceEvent;

export interface MoveEvent {
    type: "moveUsed";
    actor: EntityId;
    move: MoveId;
    targets: EntityId[];
}

export interface AccuracyEvent {
    type: "accuracyResult";
    actor: EntityId;
    move: MoveId;
    target: EntityId;
    result: AccuracyResult;
    effectiveness: number;
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

export interface StanceEvent {
    type: "stanceChanged";
    actor: EntityId;
    stance: StanceId;
}

/*******************************************************
 * Encounters
 *******************************************************/

export type EncounterId = string;