import { ContentLibrary } from "./library";

/*******************************************************
 * Engine
 *******************************************************/
export interface Engine {
    getSeed(): number;
    getLibrary(): ContentLibrary;
    getActionView(): ActionView[];
    getGameState(): GameState;
    setDifficulty(difficulty: DifficultyId): void;
    listCharacters(): EntityId[];
    loadCharacter(id: EntityId): GameEvent;
    listEncounters(): EncounterId[];
    loadEncounter(id: EncounterId): GameEvent;
    executeAction(action: PlayerAction): ActionResult;
}

export type CatalogId = string;

/*******************************************************
 * State
 *******************************************************/

export interface ActionView {
    id: EntityId;
    available: boolean;
    reason?: FailureReason;
    moves: ActionInfo[];
    escapes: EscapeInfo[];
    attack: CapabilityInfo;
    escape: CapabilityInfo;
    bonus: CapabilityInfo;
    stance: CapabilityInfo;
}

export interface GameState {
    turn: Turn;
    characters: Character[];
    enemies: Enemy[];
    traps: Trap[];
    encounter: Encounter | null;
    difficulty: Difficulty;
}

export interface Turn {
    round: number;
    step: number;
    phase: Phase;
    outcome: BattleState;
}

export interface Difficulty {
    id: DifficultyId;
    playerModifiers: ModifierSet;
    enemyModifiers: ModifierSet;
}

export type DifficultyId = "casual" | "standard" | "veteran" | "extreme" | "mythic";

export type BattleState = "ongoing" | "defeat" | "victory";

export type Phase = "player" | "enemy";

export type EntityId = string;

export type EntitySide = "either" | "player" | "enemy" | "none";

export type DefinitionId = string;

export type PassiveId = string;


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
    defId: DefinitionId;
    rank: EnemyRank;
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

export type EnemyRank = "minion" | "enemy" | "boss";

/*******************************************************
 * Buffs
 *******************************************************/

export interface MoveListModifier {
    addedMoves?: MoveId[];
    blockedMoves?: MoveId[];
}

export interface Buff {
    id: BuffId;
    severity?: number;
    duration?: number;
    statuses?: Status[];
    modifiers?: ModifierSet;
    moveList?: MoveListModifier;
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
    | MoveEffect
    | DataEffect
    | RetargetEffect
    | RefreshEffect
    | CancelEffect;

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
    buff: Buff;
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

export interface DataEffect {
    type: "data"
    target: EntityId;
    name: string;
    amount: number;
}

export interface RetargetEffect {
    type: "intention"
    operation: "target";
    target: EntityId;
    destination: EntityId;
}

export interface CancelEffect {
    type: "intention"
    operation: "cancel";
    target: EntityId;
    amount: number;
}

export interface RefreshEffect {
    type: "refresh"
    target: EntityId;
}


/*******************************************************
 * Moves
 *******************************************************/

export interface Move {
    id: string;
    targetSide: EntitySide;
    targets: TargetCount;
    hits?: number;
    type: MoveType;
    binding?: BindingId;
    traits?: MoveTrait[];
    freeOnHit?: boolean;
}

export type MoveType =
    | "arms"
    | "mouth"
    | "legs"
    | "none";

export type MoveTrait =
    | "damage"
    | "buff"
    | "debuff"
    | "escape"
    | "onetime"
    | "refresh"
    | "heal"
    | "defeat"
    | "spawn"
    | "trap"
    | "retarget";

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
    tickEffects: Effect[];
}

export type BindingId = string;

export type BindingLevel =
    | "none"
    | "light"
    | "moderate"
    | "heavy"
    | "severe"
    | "overwhelming"
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

export type FlagId =
    | "blocksAttack"
    | "blocksEscape"
    | "blocksAssist"
    | "blocksBonusEscape"
    | "blocksMoving"
    | "skipsTraps"
    | "skipsTurn"
    | "incapacitated";


export interface ActionInfo {
    move: Move;
    available: boolean;
    targets: PreviewInfo[];
    effects: Effect[];
    reason?: FailureReason;
}

export interface CapabilityInfo {
    available: boolean;
    reason?: FailureReason;
}

export interface EscapeInfo {
    available: boolean;
    reason?: FailureReason;
    target: EntityId;
    binding: BindingId;
    bonus?: boolean;
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
    | "bonusUnavailable"
    | "bindingRestriction"
    | "cooldownIncomplete"
    | "insufficientResource"
    | "insufficientTargets";



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
    | WeakenEvent
    | DataEvent
    | IncapacitateEvent;

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
    move: MoveId;
}

export interface WeakenEvent {
    type: "intentionWeakened";
    target: EntityId;
    move: MoveId;
}

export interface DataEvent {
    type: "dataChanged";
    target: EntityId;
    name: string;
    amount: number;
}

export interface IncapacitateEvent {
    type: "characterIncapacitated" | "characterRescued";
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

export interface EnemySetup {
    defId: EntityId;
    id?: EntityId;
}