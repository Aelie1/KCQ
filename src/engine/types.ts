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

export type EntitySide = "player" | "enemy" | "none";

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
    modifiers: ModifierSet;
    blockedMoveTypes: MoveType[];
}

/*******************************************************
 * Enemies
 *******************************************************/

export interface Enemy {
    id: EntityId;
    maxHp: number;
    currHp: number;
    currDef: number;
    intention: Intention | null;
    buffs: Buff[];
    cooldowns: Record<MoveId,number>;
}

export interface Intention {
    move: MoveId;
    targets: TargetInfo[];
    effects: Effect[];  //this is any effects not attached to a target
}

export interface TargetInfo {
    target: EntityId;
    band: HitBand;
    effects: Effect[];
}

/*******************************************************
 * Buffs
 *******************************************************/

export interface Buff {
    id: BuffId;
    duration?: number;
    active: boolean;
    statuses?: Status[];
    modifiers?: ModifierSet;
    linkedEntity?: EntityId;
}

export type BuffId = string;

/*******************************************************
 * Effects
 *******************************************************/
export type Effect =
    | DamageEffect
    | BindingEffect
    | BuffEffect;

export interface DamageEffect {
    type: "damage";
    source: EntityId;
    target: EntityId;
    amount: number;
}

export interface BindingEffect {
    type: "binding";
    target: EntityId;
    binding: BindingId;
    amount: number;
}

export interface BuffEffect {
    type: "buff";
    target: EntityId;
    buff: BuffId;
    operation: "add" | "remove";
}


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
    side: EntitySide;
    targets: TargetCount;
    type: MoveType;
    binding?: BindingId;
}

export type MoveType =
    | "arms"
    | "mouth"
    | "legs"
    | "none";

export type MoveId = string;

export type HitBand = 
    | "miss" 
    | "graze" 
    | "hit" 
    | "crit" 
    | "none";

export type AccuracyProfile = Partial<Record<HitBand, number>>;

export interface AccuracyResult {
    band: HitBand;
    effectiveness: number;
}

export type TargetCount = number | "all"

export type ValidityInfo = ValidTarget | InvalidTarget;

export interface ValidTarget {
    valid: true;
    target: EntityId | null;
    accuracy: AccuracyProfile | null;
}

export interface InvalidTarget {
    valid: false;
    target: EntityId | null;
    reason: ActionFailureReason;
}

/*******************************************************
 * Bindings
 *******************************************************/

export interface Binding {
    id: BindingId;
    value: number;
    level: BindingLevel;
    data: Record<string, number>;
    status: Status[];
}

export type BindingId = string;

export type BindingLevel =
    | "none"
    | "easy"
    | "medium"
    | "hard"
    | "extreme"
    | "impossible"
    | "max"


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
    | "incapacitated"
    | "standing";

export type ModifierSet = Partial<Record<ModifierId,number>>;

export type ModifierId =
    | "hitarms"
    | "hitmouth"
    | "hitlegs"
    | "hit"
    | "defense"
    | "escape"
    | "effect"
    | "potency"
    | "traps"
    | "willpower"
    | "spread"


/*******************************************************
 * Actions
 *******************************************************/

export interface AvailabilityInfo {
    id: EntityId;
    available: boolean;
    reason?: ActionFailureReason;
}

export interface ActionInfo {
    move: Move;
    available: boolean;
    reason?: ActionFailureReason;
}

export interface StanceInfo {
    available: boolean;
    reason?: ActionFailureReason;
}

export interface EscapeOptions {
    options: EscapeInfo[];
    assistAllowed: boolean;
}

export interface EscapeInfo {
    actor: EntityId;
    target: EntityId;
    binding: BindingId;
    effects: Effect[];
}

export type ActionType = 
    | "attack" 
    | "escape" 
    | "stance" 
    | "endTurn"

export type PlayerAction = AttackAction | EscapeAction | StanceAction | EndTurnAction;

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
    | "invalidMove"
    | "invalidBinding"
    | "invalidTarget"
    | "invalidTargetCount"
    | "duplicateTargets"
    | "wrongPhase"
    | "actorAlreadyActed"
    | "actorSkipped"
    | "actorImmobilized"
    | "actorIncapacitated"
    | "targetIncapacitated"
    | "moveUnavailable"
    | "attackUnavailable"
    | "assistUnavailable"
    | "escapeUnavailable"
    | "bindingRestriction";



/*******************************************************
 * Events
 ********************************************************/

export type GameEvent = MoveEvent | DamageEvent | BondageEvent | PhaseEvent | BuffEvent | EnemyEvent | StanceEvent | EncounterEvent;

export interface MoveEvent {
    type: "moveUsed";
    actor: EntityId;
    move: MoveId;
    targets: { 
        target: EntityId, 
        result: HitBand 
    }[];
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
    type: "buffAdded" | "buffRemoved" | "buffUpdated";
    target: EntityId;
    buff: BuffId;
}

export interface EnemyEvent {
    type: "enemySpawned" | "enemyDefeated";
    target: EntityId;
}

export interface EncounterEvent {
    type: "encounter";
    id: string;
    success: boolean;
    bindings: BindingId[];
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