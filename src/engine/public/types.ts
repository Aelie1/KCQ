/*******************************************************
 * Engine
 *******************************************************/
export interface Engine {
    getSeed(): number;
    getGameView(): GameView;
    getThresholds(): ThresholdInfo;
    listCharacters(): EntityId[];
    loadCharacter(id: EntityId): GameEvent[];
    listEncounters(): EncounterId[];
    loadEncounter(id: EncounterId): GameEvent[];
    executeAction(action: PlayerAction): ActionResult;
}

/*******************************************************
 * State
 *******************************************************/

export interface GameView extends GameState {
    actions: ActionView[];
}

export interface ActionView {
    id: EntityId;
    available: boolean;
    reason?: FailureReason;
    moves: ActionInfo[];
    escapes: EscapeInfo[];
    stance: StanceInfo;
}

export interface GameState {
    turn: Turn;
    characters: Character[];
    enemies: Enemy[];
    traps: Trap[];
    encounter: Encounter | null;
}

export interface Turn {
    round: number;
    step: number;
    phase: Phase;
    outcome: BattleState;
}

export type BattleState = "ongoing" | "defeat" | "victory";

export type Phase = "player" | "enemy";

export type EntityId = string;

export type EntitySide = "either" | "player" | "enemy" | "none";

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
    data: Record<string, number>;
}

/*******************************************************
 * Enemies
 *******************************************************/

export interface Enemy {
    id: EntityId;
    rank: "minion" | "enemy" | "boss";
    maxHp: number;
    currHp: number;
    currDef: number;
    intentions: Intention[];
    buffs: Buff[];
    cooldowns: Record<MoveId, number>;
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
    | BuffEffect
    | EnemyEffect
    | TrapEffect
    | MoveEffect;

export interface DamageEffect {
    type: "damage";
    target: EntityId;
    amount: number;
}

export interface BindingEffect {
    type: "binding";
    target: EntityId;
    binding: BindingId;
    amount?: number;
}

export interface BuffEffect {
    type: "buff";
    target: EntityId;
    buff: BuffId;
    effects?: ModifierSet;
    operation: "add" | "remove";
}

export interface EnemyEffect {
    type: "enemy";
    target: EntityId;
}

export interface TrapEffect {
    type: "trap";
    trap: TrapId;
    amount: number;
}

export interface MoveEffect {
    type: "move";
    move: MoveId;
}

/*******************************************************
 * Moves
 *******************************************************/

export interface Move {
    id: string;
    targetSide: EntitySide;
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
    reason: FailureReason;
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

export interface ThresholdInfo {
    thresholds: Partial<Record<BindingLevel, number>>;
    max: number;
}

/*******************************************************
 * Traps
 *******************************************************/

export interface Trap {
    id: TrapId;
    amount: number;
}

export type TrapId = string;

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
    | "servitude";

export type ModifierSet = Partial<Record<ModifierId, number>>;

export const modifierStruct = {
    "hitarms": true,
    "hitmouth": true,
    "hitlegs": true,
    "hit": true,
    "defense": true,
    "escape": true,
    "vulnerability": true,
    "potency": true,
    "traps": true,
    "willpower": true,
    "spread": true,
}

export type ModifierId = keyof typeof modifierStruct;

export interface ActionInfo {
    move: Move;
    available: boolean;
    targets: ValidityInfo[];
    reason?: FailureReason;
}

export interface StanceInfo {
    available: boolean;
    reason?: FailureReason;
}

export interface EscapeInfo {
    available: boolean;
    reason?: FailureReason;
    target: EntityId;
    binding: BindingId;
    effects: Effect[];
}

export type ActionType =
    | "move"
    | "escape"
    | "stance"
    | "endTurn"

export type PlayerAction = MoveAction | EscapeAction | StanceAction | EndTurnAction;

export interface MoveAction {
    type: "move";
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
    view: GameView;
    events: GameEvent[];
}

export interface ActionFailure {
    success: false;
    reason: FailureReason;
}

export type FailureReason =
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

export type GameEvent =
    | MoveEvent
    | DamageEvent
    | BondageEvent
    | PhaseEvent
    | BuffEvent
    | EnemyEvent
    | StanceEvent
    | EncounterEvent
    | CooldownEvent
    | TrapEvent
    | InterruptEvent
    | RefreshEvent
    | RetargetEvent
    | CancelEvent
    | WeakenEvent
    | CharacterEvent;

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
    type: "enemyDamaged" | "enemyHealed" | "damageBlocked";
    target: EntityId;
    amount: number;
}

export interface BondageEvent {
    type: "bondageChanged" | "bondageAdded" | "bondageRemoved" | "bondageBlocked";
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
    type: "encounterLoad";
    id: string;
    success: boolean;
    bindings: BindingId[];
}

export interface StanceEvent {
    type: "stanceChanged";
    actor: EntityId;
    stance: StanceId;
}

export interface CooldownEvent {
    type: "cooldownChanged";
    target: EntityId;
    move: MoveId;
    value: number;
}

export interface TrapEvent {
    type: "trapAdded" | "trapRemoved" | "trapTriggered";
    actor: EntityId;
    trap: TrapId;
    amount: number;
}

export interface InterruptEvent {
    type: "actionInterrupted";
    actor: EntityId;
    reason: FailureReason;
}

export interface RefreshEvent {
    type: "actionRefreshed";
    target: EntityId;
}

export interface RetargetEvent {
    type: "targetChanged";
    target: EntityId;
    destination: EntityId;
}

export interface CancelEvent {
    type: "intentionCancelled";
    target: EntityId;
}

export interface WeakenEvent {
    type: "intentionWeakened";
    target: EntityId;
}

export interface CharacterEvent {
    type: "characterLoad";
    id: string;
    success: boolean;
}

/*******************************************************
 * Encounters
 *******************************************************/

export interface Encounter {
    id: string;
    enemies: EntityId[];
    bindings: BindingId[];
    traps: TrapId[];
}

export type EncounterId = string;