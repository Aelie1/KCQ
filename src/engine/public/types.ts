/*******************************************************
 * Engine
 *******************************************************/
export interface Engine {
    getSeed(): number;
    getActionView(): ActionView[];
    getGameState(): GameState;
    getThresholds(): ThresholdInfo;
    listCharacters(): EntityId[];
    loadCharacter(id: EntityId): GameEvent;
    listEncounters(): EncounterId[];
    loadEncounter(id: EncounterId): GameEvent;
    executeAction(action: PlayerAction): ActionResult;
}

/*******************************************************
 * State
 *******************************************************/

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
    cooldowns: Record<MoveId, number>;
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
    operation: "spawn" | "defeat";
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

export type PreviewInfo = ValidTarget | InvalidTarget;

export interface ValidTarget {
    valid: true;
    target: EntityId | null;
    accuracy?: AccuracyProfile;
    damage?: PreviewProfile;
    effects: Effect[];
}

export interface InvalidTarget {
    valid: false;
    target: EntityId | null;
    reason: FailureReason;
}

export interface BandPreview {
    chance: number;
    min: number;
    max: number;
}

export type PreviewProfile = Partial<Record<HitBand, BandPreview>>;

interface MoveResult {
    target: EntityId,
    result: HitBand
    effects: LeafEvent[];
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

export type ModifierId =
    | "hitarms"
    | "hitmouth"
    | "hitlegs"
    | "hit"
    | "defense"
    | "escape"
    | "vulnerability"
    | "potency"
    | "traps"
    | "willpower"
    | "spread";

export interface ActionInfo {
    move: Move;
    available: boolean;
    targets: PreviewInfo[];
    effects: Effect[];
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
    actions: ActionView[];
    frames: EventFrame[];
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
    | "bindingRestriction"
    | "cooldownIncomplete";



/*******************************************************
 * Events
 ********************************************************/

export interface EventFrame {
    state: GameState;
    event: GameEvent;
}

export type GameEvent =
    | MoveEvent
    | EscapeEvent
    | PhaseEvent
    | StanceChangeEvent
    | EncounterEvent
    | CharacterEvent;

export type LeafEvent =
    | DamageEvent
    | BondageEvent
    | BuffEvent
    | EnemyEvent
    | StanceSetEvent
    | InterruptEvent
    | RefreshEvent
    | CooldownEvent
    | TrapEvent
    | RetargetEvent
    | CancelEvent
    | WeakenEvent;

export interface MoveEvent {
    type: "useMove";
    actor: EntityId;
    move: MoveId;
    effects: LeafEvent[];
    targets: MoveResult[];
}

export interface EscapeEvent {
    type: "useEscape";
    actor: EntityId;
    target: EntityId;
    effects: LeafEvent[];
}

export interface PhaseEvent {
    type: "changePhase";
    phase: Phase;
    effects: LeafEvent[];
}

export interface StanceChangeEvent {
    type: "changeStance";
    actor: EntityId;
    effects: LeafEvent[];
}

export interface EncounterEvent {
    type: "loadEncounter";
    id: string;
    success: boolean;
    bindings: BindingId[];
    effects: LeafEvent[];
}

export interface CharacterEvent {
    type: "loadCharacter";
    id: string;
    success: boolean;
    effects: LeafEvent[];
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

export interface BuffEvent {
    type: "buffAdded" | "buffRemoved" | "buffUpdated";
    target: EntityId;
    buff: BuffId;
}

export interface EnemyEvent {
    type: "enemySpawned" | "enemyDefeated";
    target: EntityId;
}

export interface StanceSetEvent {
    type: "stanceSet";
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
