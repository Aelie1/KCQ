import type {
    ActionInfo,
    BindingId,
    BindingLevel,
    Buff,
    Effect,
    Enemy,
    EntityId,
    EscapeInfo,
    MoveId,
    MoveType,
    PlayerAction,
    StatusId,
    ThresholdInfo,
    ValidTarget,
} from "../../engine/public/types";
import type { FightPolicy, PolicyContext } from "../harness";
import {
    CONTROL_KNOWLEDGE_WEIGHT,
    evaluateControlKnowledge as evaluateControlKnowledgeRules,
    type ControlKnowledgeBreakdown,
} from "./knowledge/control-knowledge";
import {
    evaluateKitKnowledge as evaluateKitKnowledgeRules,
    type KitKnowledgeBreakdown,
} from "./knowledge/kit-knowledge";
import {
    evaluatePeriodicBindingPressure,
    type PeriodicBindingPressureBreakdown,
    type PeriodicBindingSourceBreakdown,
} from "./knowledge/periodic-binding-knowledge";
import {
    evaluateReactiveKnowledge as evaluateReactiveKnowledgeRules,
    REACTIVE_KNOWLEDGE_WEIGHT,
    type ReactiveKnowledgeBreakdown,
} from "./knowledge/reactive-knowledge";
import {
    assessSustainedEnemyPressure,
    evaluateSustainedPressureProgress as evaluateSustainedPressureProgressRules,
    SUSTAINED_PRESSURE_PROGRESS_WEIGHT,
    type SustainedPressureProgressBreakdown,
} from "./knowledge/sustained-pressure-knowledge";
import {
    assessSmartPressure,
    evaluateTempoKnowledge as evaluateTempoKnowledgeRules,
    TEMPO_KNOWLEDGE_WEIGHT,
    type SmartPressureAssessment,
    type TempoKnowledgeBreakdown,
} from "./knowledge/tempo-knowledge";
import {
    addBinding,
    applyBindingEffects,
    bindingValue,
    cloneBindingBoard,
    currentBindingBoard,
    recoveryDebt,
    totalRecoveryDebt,
    type BindingBoard,
} from "./smart-bindings";
import {
    assessSmartBoard,
    type SmartBoardAssessment,
    type SmartEnemyAssessment,
    type SmartEnemyTargetAssessment,
} from "./smart-board";

export * from "./knowledge/control-knowledge";
export * from "./knowledge/kit-knowledge";
export * from "./knowledge/intention-knowledge";
export * from "./knowledge/periodic-binding-knowledge";
export * from "./knowledge/reactive-knowledge";
export * from "./knowledge/skunk-knowledge";
export * from "./knowledge/sustained-pressure-knowledge";
export * from "./knowledge/tempo-knowledge";
export { RECOVERY_DEBT_CURVE_A, recoveryDebt } from "./smart-bindings";
export * from "./smart-board";
export { SUSTAINED_PRESSURE_PROGRESS_WEIGHT };

/** Public-preview data retained beside an action so scoring stays inspectable. */
export interface SmartCandidate {
    readonly action: PlayerAction;
    /** Effects that occur once for the action. */
    readonly effects: readonly Effect[];
    /** The target previews applicable to this particular target selection. */
    readonly targets: readonly ValidTarget[];
    /** Number of independently resolved hits represented by each target preview. */
    readonly hits: number;
}

/** One scorer's native value, configured multiplier, and weighted contribution. */
export interface SmartScoreComponent {
    readonly raw: number;
    readonly weight: number;
    readonly score: number;
    readonly diagnostics?: unknown;
}

export interface SmartScorerEvaluation {
    readonly raw: number;
    readonly diagnostics?: unknown;
}

/** Named components retain scorer registration order for diagnostics. */
export interface SmartScoreComponents {
    readonly [name: string]: SmartScoreComponent;
}

/** A pure scoring dimension evaluated from public policy context and preview data. */
export interface SmartScorer {
    readonly id: string;
    readonly weight: number;
    prepare(
        context: PolicyContext,
        board: SmartBoardAssessment,
    ): (candidate: SmartCandidate) => number;
    /** Optional single-pass evaluation for scorers that expose richer diagnostics. */
    prepareDetailed?(
        context: PolicyContext,
        board: SmartBoardAssessment,
    ): (candidate: SmartCandidate) => SmartScorerEvaluation;
}

export interface ScoredSmartCandidate extends SmartCandidate {
    readonly components: SmartScoreComponents;
    readonly total: number;
}

export interface SmartDecision {
    readonly board: SmartBoardAssessment;
    readonly candidates: readonly ScoredSmartCandidate[];
    readonly selected: ScoredSmartCandidate;
}

export interface BindingRecoveryBreakdown {
    readonly baselineDebt: number;
    readonly escapedDebt: number;
    readonly recoveryGain: number;
    readonly selectedProjectedValue: number;
    readonly selectedDebt: number;
    readonly urgency: number;
    readonly raw: number;
}

export type PressureSourceProgressSourceBreakdown = PeriodicBindingSourceBreakdown;
export type PressureSourceProgressBreakdown = PeriodicBindingPressureBreakdown;

export interface FutureMoveOptionsCharacterBreakdown {
    readonly characterId: EntityId;
    readonly gainedMoveIds: readonly string[];
    readonly lostMoveIds: readonly string[];
    readonly blockedProposedGainIds: readonly string[];
}

export interface FutureMoveOptionsBreakdown {
    readonly characters: readonly FutureMoveOptionsCharacterBreakdown[];
    readonly gainedOptions: number;
    readonly lostOptions: number;
    readonly raw: number;
}

export interface BindingMoveAccessCharacterBreakdown {
    readonly characterId: EntityId;
    readonly gainedMoveIds: readonly MoveId[];
    readonly lostMoveIds: readonly MoveId[];
}

export interface BindingMoveAccessBreakdown {
    readonly characters: readonly BindingMoveAccessCharacterBreakdown[];
    readonly gainedMoves: number;
    readonly lostMoves: number;
    readonly raw: number;
}

export interface ReserveSpendingBreakdown {
    readonly lostOptions: number;
    readonly offensiveValue: number;
    readonly expectedKills: number;
    readonly offensiveJustification: number;
    readonly raw: number;
}

export interface LinkedThreatCharacterBreakdown {
    readonly characterId: EntityId;
    readonly severity: number;
    readonly linkedBuffIds: readonly string[];
}

export interface LinkedThreatEnemyBreakdown {
    readonly enemyId: EntityId;
    readonly totalSeverity: number;
    readonly expectedDamage: number;
    readonly currentHp: number;
    readonly progressFraction: number;
    readonly contribution: number;
    readonly linkedCharacters: readonly LinkedThreatCharacterBreakdown[];
}

export interface LinkedThreatBreakdown {
    readonly enemies: readonly LinkedThreatEnemyBreakdown[];
    readonly raw: number;
}

export interface IncomingThreatEnemyBreakdown {
    readonly enemyId: EntityId;
    readonly baselineDebt: number;
    readonly projectedDebt: number;
    readonly threat: number;
    readonly expectedDamage: number;
    readonly currentHp: number;
    readonly expectedLethal: boolean;
    readonly contribution: number;
    readonly bindingTargets: readonly SmartEnemyTargetAssessment[];
    readonly unknownIncomingBindingEffects: number;
    readonly totalIncomingTrapAmount: number;
}

export interface IncomingThreatBreakdown {
    /** Living enemies whose known committed binding pressure increases recovery debt. */
    readonly enemies: readonly IncomingThreatEnemyBreakdown[];
    readonly raw: number;
}

/** Tunable Smart-policy heuristic constants; none is an engine rule. */
export const BINDING_RECOVERY_WEIGHT = 0.75;
export const BINDING_MOVE_ACCESS_WEIGHT = 20;
export const PRESSURE_SOURCE_PROGRESS_WEIGHT = 8;
export const FINISHER_PRESSURE_WEIGHT = 1;
export const FUTURE_MOVE_OPTIONS_WEIGHT = 20;
export const RESERVE_SPENDING_WEIGHT = 1;
export const LINKED_THREAT_WEIGHT = 40;
export const INCOMING_THREAT_WEIGHT = 1;
export const KIT_KNOWLEDGE_WEIGHT = 1;

/** Smart 1's expected-direct-enemy-damage behavior as a reusable component. */
export const expectedDamageScorer: SmartScorer = {
    id: "expectedDamage",
    weight: 1,
    prepare(context) {
        return prepareExpectedEnemyDamage(context);
    },
};

/** Values progress toward defeating enemies linked to harmful character buffs. */
export const linkedThreatScorer: SmartScorer = {
    id: "linkedThreat",
    weight: LINKED_THREAT_WEIGHT,
    prepare(context) {
        const evaluate = prepareLinkedThreat(context);
        return (candidate) => evaluate(candidate).raw;
    },
    prepareDetailed(context) {
        const evaluate = prepareLinkedThreat(context);
        return (candidate) => {
            const diagnostics = evaluate(candidate);
            return { raw: diagnostics.raw, diagnostics };
        };
    },
};

/** Values expected kills that prevent known committed enemy binding pressure. */
export const incomingThreatScorer: SmartScorer = {
    id: "incomingThreat",
    weight: INCOMING_THREAT_WEIGHT,
    prepare(context, board) {
        const evaluate = prepareIncomingThreat(context, board);
        return (candidate) => evaluate(candidate).raw;
    },
    prepareDetailed(context, board) {
        const evaluate = prepareIncomingThreat(context, board);
        return (candidate) => {
            const diagnostics = evaluate(candidate);
            return { raw: diagnostics.raw, diagnostics };
        };
    },
};

/** Applies explicit current-KCQ character-kit and mechanic knowledge. */
export const kitKnowledgeScorer: SmartScorer = {
    id: "kitKnowledge",
    weight: KIT_KNOWLEDGE_WEIGHT,
    prepare(context, board) {
        return (candidate) => evaluateKitKnowledgeRules(context, board, candidate).raw;
    },
    prepareDetailed(context, board) {
        return (candidate) => {
            const diagnostics = evaluateKitKnowledgeRules(context, board, candidate);
            return { raw: diagnostics.raw, diagnostics };
        };
    },
};

/** Contextualizes recovery, pressure removal, and Queen phase advancement. */
export const tempoKnowledgeScorer: SmartScorer = {
    id: "tempoKnowledge",
    weight: TEMPO_KNOWLEDGE_WEIGHT,
    prepare(context, board) {
        const pressure = assessSmartPressure(context, board);
        return (candidate) => evaluateTempoKnowledgeRules(context, board, candidate, pressure).raw;
    },
    prepareDetailed(context, board) {
        const pressure = assessSmartPressure(context, board);
        return (candidate) => {
            const diagnostics = evaluateTempoKnowledgeRules(context, board, candidate, pressure);
            return { raw: diagnostics.raw, diagnostics };
        };
    },
};

/** Values current public Starlight control effects against meaningful enemies. */
export const controlKnowledgeScorer: SmartScorer = {
    id: "controlKnowledge",
    weight: CONTROL_KNOWLEDGE_WEIGHT,
    prepare(context, board) {
        const pressure = assessSmartPressure(context, board);
        return (candidate) => evaluateControlKnowledgeRules(context, candidate, pressure).raw;
    },
    prepareDetailed(context, board) {
        const pressure = assessSmartPressure(context, board);
        return (candidate) => {
            const diagnostics = evaluateControlKnowledgeRules(context, candidate, pressure);
            return { raw: diagnostics.raw, diagnostics };
        };
    },
};

/** Values one-turn prevention and reflected damage from Ko's Reflect moves. */
export const reactiveKnowledgeScorer: SmartScorer = {
    id: "reactiveKnowledge",
    weight: REACTIVE_KNOWLEDGE_WEIGHT,
    prepare(context) {
        return (candidate) => evaluateReactiveKnowledgeRules(context, candidate).raw;
    },
    prepareDetailed(context) {
        return (candidate) => {
            const diagnostics = evaluateReactiveKnowledgeRules(context, candidate);
            return { raw: diagnostics.raw, diagnostics };
        };
    },
};

/** Values an escape by the reduction in projected whole-party recovery debt. */
export const bindingRecoveryScorer: SmartScorer = {
    id: "bindingRecovery",
    weight: BINDING_RECOVERY_WEIGHT,
    prepare(context, board) {
        const evaluate = prepareBindingRecovery(context, board);
        return (candidate) => evaluate(candidate).raw;
    },
};

/** Values binding-threshold changes that alter access to currently present moves. */
export const bindingMoveAccessScorer: SmartScorer = {
    id: "bindingMoveAccess",
    weight: BINDING_MOVE_ACCESS_WEIGHT,
    prepare(context) {
        const evaluate = prepareBindingMoveAccess(context);
        return (candidate) => evaluate(candidate).raw;
    },
    prepareDetailed(context) {
        const evaluate = prepareBindingMoveAccess(context);
        return (candidate) => {
            const diagnostics = evaluate(candidate);
            return { raw: diagnostics.raw, diagnostics };
        };
    },
};

/** Rewards proportional progress toward removing recurring binding generators. */
export const pressureSourceProgressScorer: SmartScorer = {
    id: "pressureSourceProgress",
    weight: PRESSURE_SOURCE_PROGRESS_WEIGHT,
    prepare(context, board) {
        const evaluate = preparePressureSourceProgress(context, board);
        return (candidate) => evaluate(candidate).raw;
    },
    prepareDetailed(context, board) {
        const evaluate = preparePressureSourceProgress(context, board);
        return (candidate) => {
            const diagnostics = evaluate(candidate);
            return { raw: diagnostics.raw, diagnostics };
        };
    },
};

/** Rewards damage progress toward removing enemies that produce future pressure. */
export const sustainedPressureProgressScorer: SmartScorer = {
    id: "sustainedPressureProgress",
    weight: SUSTAINED_PRESSURE_PROGRESS_WEIGHT,
    prepare(context) {
        const pressure = assessSustainedEnemyPressure(context);
        return (candidate) =>
            evaluateSustainedPressureProgressRules(context, candidate, pressure).raw;
    },
    prepareDetailed(context) {
        const pressure = assessSustainedEnemyPressure(context);
        return (candidate) => {
            const diagnostics = evaluateSustainedPressureProgressRules(
                context,
                candidate,
                pressure,
            );
            return { raw: diagnostics.raw, diagnostics };
        };
    },
};

/** Coarsely values declarative gains and losses in future move-list membership. */
export const futureMoveOptionsScorer: SmartScorer = {
    id: "futureMoveOptions",
    weight: FUTURE_MOVE_OPTIONS_WEIGHT,
    prepare(context) {
        const evaluate = prepareFutureMoveOptions(context);
        return (candidate) => evaluate(candidate).raw;
    },
    prepareDetailed(context) {
        const evaluate = prepareFutureMoveOptions(context);
        return (candidate) => {
            const diagnostics = evaluate(candidate);
            return { raw: diagnostics.raw, diagnostics };
        };
    },
};

/** Rewards expected damage applied to enemies near defeat. This is a policy heuristic. */
export const finisherPressureScorer: SmartScorer = {
    id: "finisherPressure",
    weight: FINISHER_PRESSURE_WEIGHT,
    prepare(context) {
        return prepareFinisherPressure(context);
    },
};

/** Cancels offense that does not justify permanently spending future options. */
export const reserveSpendingScorer: SmartScorer = {
    id: "reserveSpending",
    weight: RESERVE_SPENDING_WEIGHT,
    prepare(context) {
        const evaluate = prepareReserveSpending(context);
        return (candidate) => evaluate(candidate).raw;
    },
};

/** Production scorer registration order. Later Smart cards can extend this list. */
export const smartScorers: readonly SmartScorer[] = [
    expectedDamageScorer,
    linkedThreatScorer,
    incomingThreatScorer,
    kitKnowledgeScorer,
    tempoKnowledgeScorer,
    controlKnowledgeScorer,
    reactiveKnowledgeScorer,
    bindingRecoveryScorer,
    bindingMoveAccessScorer,
    pressureSourceProgressScorer,
    sustainedPressureProgressScorer,
    finisherPressureScorer,
    futureMoveOptionsScorer,
    reserveSpendingScorer,
];

/** Exposes the scorer's formula breakdown for focused tests and diagnostics. */
export function evaluateBindingRecovery(
    context: PolicyContext,
    board: SmartBoardAssessment,
    candidate: SmartCandidate,
): BindingRecoveryBreakdown {
    return prepareBindingRecovery(context, board)(candidate);
}

/** Exposes binding-derived move access changes for focused tests and diagnostics. */
export function evaluateBindingMoveAccess(
    context: PolicyContext,
    candidate: SmartCandidate,
): BindingMoveAccessBreakdown {
    return prepareBindingMoveAccess(context)(candidate);
}

/** Exposes recurring-source progress and its per-source contributions. */
export function evaluatePressureSourceProgress(
    context: PolicyContext,
    board: SmartBoardAssessment,
    candidate: SmartCandidate,
): PressureSourceProgressBreakdown {
    return preparePressureSourceProgress(context, board)(candidate);
}

/** Exposes future enemy-pressure progress and its per-enemy contributions. */
export function evaluateSustainedPressureProgress(
    context: PolicyContext,
    candidate: SmartCandidate,
): SustainedPressureProgressBreakdown {
    return evaluateSustainedPressureProgressRules(context, candidate);
}

/** Exposes the future-move option delta for focused tests and diagnostics. */
export function evaluateFutureMoveOptions(
    context: PolicyContext,
    candidate: SmartCandidate,
): FutureMoveOptionsBreakdown {
    return prepareFutureMoveOptions(context)(candidate);
}

/** Exposes the reserve-spending formula for focused tests and diagnostics. */
export function evaluateReserveSpending(
    context: PolicyContext,
    candidate: SmartCandidate,
): ReserveSpendingBreakdown {
    return prepareReserveSpending(context)(candidate);
}

/** Exposes linked-enemy severity and damage progress for focused diagnostics. */
export function evaluateLinkedThreat(
    context: PolicyContext,
    candidate: SmartCandidate,
): LinkedThreatBreakdown {
    return prepareLinkedThreat(context)(candidate);
}

/** Exposes known incoming binding threat and expected-lethal prevention diagnostics. */
export function evaluateIncomingThreat(
    context: PolicyContext,
    board: SmartBoardAssessment,
    candidate: SmartCandidate,
): IncomingThreatBreakdown {
    return prepareIncomingThreat(context, board)(candidate);
}

/** Exposes named content-aware rule adjustments for focused diagnostics. */
export function evaluateKitKnowledge(
    context: PolicyContext,
    board: SmartBoardAssessment,
    candidate: SmartCandidate,
): KitKnowledgeBreakdown {
    return evaluateKitKnowledgeRules(context, board, candidate);
}

/** Exposes pressure measurements and candidate-specific tempo adjustments. */
export function evaluateTempoKnowledge(
    context: PolicyContext,
    board: SmartBoardAssessment,
    candidate: SmartCandidate,
    pressure?: SmartPressureAssessment,
): TempoKnowledgeBreakdown {
    return evaluateTempoKnowledgeRules(context, board, candidate, pressure);
}

/** Exposes Starlight's per-target public control value. */
export function evaluateControlKnowledge(
    context: PolicyContext,
    board: SmartBoardAssessment,
    candidate: SmartCandidate,
): ControlKnowledgeBreakdown {
    return evaluateControlKnowledgeRules(
        context,
        candidate,
        assessSmartPressure(context, board),
    );
}

/** Exposes single-use Reflect prevention and reflected-damage value. */
export function evaluateReactiveKnowledge(
    context: PolicyContext,
    candidate: SmartCandidate,
): ReactiveKnowledgeBreakdown {
    return evaluateReactiveKnowledgeRules(context, candidate);
}

function prepareExpectedEnemyDamage(
    context: PolicyContext,
): (candidate: SmartCandidate) => number {
    const enemyIds = new Set(context.state.enemies.map((enemy) => enemy.id));
    return (candidate) => expectedEnemyDamage(candidate, enemyIds);
}

function prepareLinkedThreat(
    context: PolicyContext,
): (candidate: SmartCandidate) => LinkedThreatBreakdown {
    const livingEnemies = new Map(
        context.state.enemies
            .filter(({ currHp }) => currHp > 0)
            .map((enemy) => [enemy.id, enemy] as const),
    );
    const linkedCharacters = new Map<EntityId, LinkedThreatCharacterBreakdown[]>();

    for (const character of context.state.characters) {
        const passiveIds = context.library.characters[character.id]?.passives ?? [];
        const immunities = new Set(passiveIds.flatMap(
            (passiveId) => context.library.passives[passiveId]?.immunities ?? [],
        ));
        const relationships = new Map<EntityId, { severity: number; buffIds: string[] }>();

        for (const buff of character.buffs) {
            if (buff.linkedEntity === undefined || !livingEnemies.has(buff.linkedEntity)) {
                continue;
            }
            const severity = linkedBuffSeverity(buff, context, immunities);
            if (severity === 0) continue;

            const relationship = relationships.get(buff.linkedEntity) ?? {
                severity: 0,
                buffIds: [],
            };
            relationship.severity = Math.max(relationship.severity, severity);
            if (!relationship.buffIds.includes(buff.id)) relationship.buffIds.push(buff.id);
            relationships.set(buff.linkedEntity, relationship);
        }

        for (const [enemyId, relationship] of relationships) {
            const characters = linkedCharacters.get(enemyId) ?? [];
            characters.push({
                characterId: character.id,
                severity: relationship.severity,
                linkedBuffIds: relationship.buffIds,
            });
            linkedCharacters.set(enemyId, characters);
        }
    }

    return (candidate) => {
        const enemies: LinkedThreatEnemyBreakdown[] = [];
        let raw = 0;

        for (const enemy of livingEnemies.values()) {
            const characters = linkedCharacters.get(enemy.id);
            if (characters === undefined) continue;

            const totalSeverity = characters.reduce(
                (sum, character) => sum + character.severity,
                0,
            );
            const expectedDamage = expectedDamageToEnemy(candidate, enemy.id);
            const progressFraction = clamp(expectedDamage / enemy.currHp, 0, 1);
            const contribution = totalSeverity * progressFraction;
            raw += contribution;
            enemies.push({
                enemyId: enemy.id,
                totalSeverity,
                expectedDamage,
                currentHp: enemy.currHp,
                progressFraction,
                contribution,
                linkedCharacters: characters,
            });
        }

        return { enemies, raw };
    };
}

function prepareIncomingThreat(
    context: PolicyContext,
    board: SmartBoardAssessment,
): (candidate: SmartCandidate) => IncomingThreatBreakdown {
    const current = currentBindingBoard(context.state.characters);
    const baselineDebt = totalRecoveryDebt(current, context.thresholds);
    const assessmentsById = new Map(board.enemies.map((enemy) => [enemy.id, enemy] as const));
    const threats = context.state.enemies.flatMap((enemy) => {
        if (enemy.currHp <= 0) return [];
        const assessment = assessmentsById.get(enemy.id);
        if (assessment === undefined) return [];

        const projected = cloneBindingBoard(current);
        applyEnemyKnownIncoming(projected, assessment, context.thresholds.max);
        const projectedDebt = totalRecoveryDebt(projected, context.thresholds);
        const threat = Math.max(0, projectedDebt - baselineDebt);
        return threat > 0 ? [{ enemy, assessment, projectedDebt, threat }] : [];
    });

    return (candidate) => {
        const enemies: IncomingThreatEnemyBreakdown[] = threats.map(({
            enemy,
            assessment,
            projectedDebt,
            threat,
        }) => {
            const expectedDamage = expectedDamageToEnemy(candidate, enemy.id);
            const expectedLethal = expectedDamage >= enemy.currHp;
            const contribution = expectedLethal ? threat : 0;
            return {
                enemyId: enemy.id,
                baselineDebt,
                projectedDebt,
                threat,
                expectedDamage,
                currentHp: enemy.currHp,
                expectedLethal,
                contribution,
                bindingTargets: assessment.bindingTargets,
                unknownIncomingBindingEffects: assessment.unknownIncomingBindingEffects,
                totalIncomingTrapAmount: assessment.totalIncomingTrapAmount,
            };
        });
        return {
            enemies,
            raw: enemies.reduce((total, enemy) => total + enemy.contribution, 0),
        };
    };
}

function linkedBuffSeverity(
    buff: Buff,
    context: PolicyContext,
    immunities: ReadonlySet<StatusId>,
): number {
    let severity = modifierSeverity(buff.modifiers);
    if ((buff.moveList?.blockedMoves?.length ?? 0) > 0) severity = Math.max(severity, 1);

    for (const status of buff.statuses ?? []) {
        if (immunities.has(status.id)) continue;
        const level = context.library.statuses[status.id]?.modifiers[status.value];
        if (level === undefined) continue;

        const flags = new Set(level.flags ?? []);
        if (flags.has("incapacitated") || flags.has("skipsTurn")) {
            severity = Math.max(severity, 4);
        } else if (flags.has("blocksAttack") || flags.has("blocksEscape")) {
            severity = Math.max(severity, 3);
        } else if (flags.has("blocksMoving") || (level.blockedMoveTypes?.length ?? 0) > 0) {
            severity = Math.max(severity, 2);
        } else if (flags.has("blocksAssist") || flags.has("blocksBonusEscape")) {
            severity = Math.max(severity, 1);
        }
        severity = Math.max(severity, modifierSeverity(level.modifiers));
    }

    return severity;
}

function modifierSeverity(modifiers: Buff["modifiers"]): number {
    const harmfulWhenNegative = [
        "hit",
        "hitarms",
        "hitmouth",
        "hitlegs",
        "defense",
        "escape",
        "potency",
        "traps",
        "willpower",
    ] as const;
    const harmfulWhenPositive = ["vulnerability", "spread"] as const;

    if (harmfulWhenNegative.some((id) => (modifiers?.[id] ?? 0) < 0)) return 1;
    if (harmfulWhenPositive.some((id) => (modifiers?.[id] ?? 0) > 0)) return 1;
    return 0;
}

function prepareFinisherPressure(
    context: PolicyContext,
): (candidate: SmartCandidate) => number {
    const livingEnemies = context.state.enemies.filter(({ currHp }) => currHp > 0);
    return (candidate) => finisherPressure(candidate, livingEnemies);
}

function prepareReserveSpending(
    context: PolicyContext,
): (candidate: SmartCandidate) => ReserveSpendingBreakdown {
    const evaluateFutureOptions = prepareFutureMoveOptions(context);
    const evaluateExpectedDamage = prepareExpectedEnemyDamage(context);
    const evaluateFinisherPressure = prepareFinisherPressure(context);
    const livingEnemies = context.state.enemies.filter(({ currHp }) => currHp > 0);

    return (candidate) => {
        const lostOptions = evaluateFutureOptions(candidate).lostOptions;
        if (lostOptions === 0) {
            return {
                lostOptions,
                offensiveValue: 0,
                expectedKills: 0,
                offensiveJustification: 0,
                raw: 0,
            };
        }

        const offensiveValue = evaluateExpectedDamage(candidate)
            + evaluateFinisherPressure(candidate);
        const expectedKills = livingEnemies.filter((enemy) =>
            expectedDamageToEnemy(candidate, enemy.id) >= enemy.currHp
        ).length;
        const offensiveJustification = clamp(expectedKills / 2, 0, 1);

        return {
            lostOptions,
            offensiveValue,
            expectedKills,
            offensiveJustification,
            raw: offensiveValue === 0 || offensiveJustification === 1
                ? 0
                : -offensiveValue * (1 - offensiveJustification),
        };
    };
}

/** Enumerates legal primary actions in stable public action-view order. */
export function generateSmartCandidates(context: PolicyContext): SmartCandidate[] {
    const candidates: SmartCandidate[] = [];

    for (const actionView of context.actions) {
        if (!actionView.available) continue;

        for (const info of actionView.moves) {
            if (!info.available) continue;
            candidates.push(...moveCandidates(actionView.id, info));
        }

        for (const escape of actionView.escapes) {
            if (!escape.available) continue;
            candidates.push(escapeCandidate(actionView.id, escape));
        }
    }

    // End turn is always the final, stable fallback. Stance is intentionally
    // absent until Smart can evaluate setup plus a following action.
    candidates.push({
        action: { type: "endTurn" },
        effects: [],
        targets: [],
        hits: 1,
    });
    return candidates;
}

/** Evaluates all candidates without executing actions or consuming policy RNG. */
export function evaluateSmartDecision(
    context: PolicyContext,
    scorers: readonly SmartScorer[] = smartScorers,
): SmartDecision {
    assertUniqueScorerIds(scorers);
    const board = assessSmartBoard(context);
    const preparedScorers = scorers.map((scorer) => {
        const evaluateDetailed = scorer.prepareDetailed?.(context, board);
        let evaluate: (candidate: SmartCandidate) => SmartScorerEvaluation;
        if (evaluateDetailed) {
            evaluate = evaluateDetailed;
        } else {
            const evaluateRaw = scorer.prepare(context, board);
            evaluate = (candidate) => ({ raw: evaluateRaw(candidate) });
        }
        return {
            id: scorer.id,
            weight: scorer.weight,
            evaluate,
        };
    });
    const candidates = generateSmartCandidates(context).map((candidate) => {
        const componentEntries = preparedScorers.map((scorer) => {
            const evaluation = scorer.evaluate(candidate);
            const component: SmartScoreComponent = {
                raw: evaluation.raw,
                weight: scorer.weight,
                score: evaluation.raw * scorer.weight,
                ...(evaluation.diagnostics !== undefined
                    ? { diagnostics: evaluation.diagnostics }
                    : {}),
            };
            return [scorer.id, component] as const;
        });
        const components: SmartScoreComponents = Object.fromEntries(componentEntries);
        const total = componentEntries.reduce(
            (sum, [, component]) => sum + component.score,
            0,
        );
        return {
            ...candidate,
            components,
            total,
        };
    });

    // Candidate generation always supplies endTurn.
    let selected = candidates[0];
    for (let index = 1; index < candidates.length; index += 1) {
        if (candidates[index].total > selected.total) {
            selected = candidates[index];
        }
    }

    return { board, candidates, selected };
}

export const smartPolicy: FightPolicy = {
    id: "smart",
    chooseAction(context) {
        return evaluateSmartDecision(context).selected.action;
    },
    evaluateDecision(context, chosenAction) {
        const decision = evaluateSmartDecision(context);
        return {
            // Replay evaluation is observational; chooseAction remains authoritative.
            action: chosenAction,
            diagnostics: decision,
        };
    },
};

function prepareBindingRecovery(
    context: PolicyContext,
    board: SmartBoardAssessment,
): (candidate: SmartCandidate) => BindingRecoveryBreakdown {
    const characterIds = new Set(context.state.characters.map(({ id }) => id));
    const current = currentBindingBoard(context.state.characters);
    const baseline = cloneBindingBoard(current);
    applyKnownIncoming(baseline, board, context.thresholds.max);
    const baselineDebt = totalRecoveryDebt(baseline, context.thresholds);

    return (candidate) => {
        const escaped = cloneBindingBoard(current);
        applyCandidateBindingEffects(
            escaped,
            candidate,
            characterIds,
            context.thresholds.max,
        );
        applyKnownIncoming(escaped, board, context.thresholds.max);

        const escapedDebt = totalRecoveryDebt(escaped, context.thresholds);
        const recoveryGain = baselineDebt - escapedDebt;
        const selected = candidate.action.type === "escape"
            ? {
                characterId: candidate.action.target,
                bindingId: candidate.action.binding,
            }
            : worstRelievedBinding(baseline, escaped, context.thresholds);
        const selectedProjectedValue = selected === undefined
            ? 0
            : bindingValue(baseline, selected.characterId, selected.bindingId);
        const selectedDebt = recoveryDebt(selectedProjectedValue, context.thresholds);
        const impossible = context.thresholds.thresholds.impossible;
        const debtAtImpossible = impossible === undefined
            ? 0
            : recoveryDebt(impossible, context.thresholds);
        const urgency = debtAtImpossible > 0 ? 1 + selectedDebt / debtAtImpossible : 1;

        return {
            baselineDebt,
            escapedDebt,
            recoveryGain,
            selectedProjectedValue,
            selectedDebt,
            urgency,
            raw: recoveryGain * urgency,
        };
    };
}

function prepareBindingMoveAccess(
    context: PolicyContext,
): (candidate: SmartCandidate) => BindingMoveAccessBreakdown {
    const characterIds = new Set(context.state.characters.map(({ id }) => id));
    const current = currentBindingBoard(context.state.characters);
    const currentMoves = new Map<EntityId, MoveId[]>(
        context.actions
            .filter(({ id }) => characterIds.has(id))
            .map((view) => [
                view.id,
                [...new Set(view.moves.map(({ move }) => move.id))],
            ]),
    );
    const currentRestrictions = bindingMoveTypeRestrictions(context, current);

    return (candidate) => {
        const projected = cloneBindingBoard(current);
        applyCandidateBindingEffects(
            projected,
            candidate,
            characterIds,
            context.thresholds.max,
        );
        const projectedRestrictions = bindingMoveTypeRestrictions(context, projected);

        const characters: BindingMoveAccessCharacterBreakdown[] = [];
        let gainedMoves = 0;
        let lostMoves = 0;
        for (const character of context.state.characters) {
            const before = currentRestrictions.get(character.id) ?? new Set<MoveType>();
            const after = projectedRestrictions.get(character.id) ?? new Set<MoveType>();
            const gainedMoveIds: MoveId[] = [];
            const lostMoveIds: MoveId[] = [];

            for (const moveId of currentMoves.get(character.id) ?? []) {
                const moveType = context.library.moves[moveId]?.type;
                if (moveType === undefined) continue;
                if (before.has(moveType) && !after.has(moveType)) gainedMoveIds.push(moveId);
                if (!before.has(moveType) && after.has(moveType)) lostMoveIds.push(moveId);
            }

            gainedMoves += gainedMoveIds.length;
            lostMoves += lostMoveIds.length;
            characters.push({
                characterId: character.id,
                gainedMoveIds,
                lostMoveIds,
            });
        }

        return {
            characters,
            gainedMoves,
            lostMoves,
            raw: gainedMoves - lostMoves,
        };
    };
}

function bindingMoveTypeRestrictions(
    context: PolicyContext,
    board: BindingBoard,
): Map<EntityId, Set<MoveType>> {
    return new Map(context.state.characters.map((character) => {
        const characterReference = context.library.characters[character.id];
        const passives = (characterReference?.passives ?? [])
            .map((passiveId) => context.library.passives[passiveId])
            .filter((passive) => passive !== undefined);
        const immunities = new Set(passives.flatMap((passive) => passive.immunities ?? []));
        const statusLevels = new Map<StatusId, number>();

        for (const [bindingId, value] of board.get(character.id) ?? []) {
            const level = bindingLevel(value, context.thresholds);
            for (const status of context.library.bindings[bindingId]?.status?.[level] ?? []) {
                if (immunities.has(status.id)) continue;
                const previous = statusLevels.get(status.id);
                if (previous === undefined || status.level > previous) {
                    statusLevels.set(status.id, status.level);
                }
            }
        }

        const blocked = new Set<MoveType>();
        const allowed = new Set<MoveType>();
        for (const [statusId, level] of statusLevels) {
            collectMoveTypeRules(
                context.library.statuses[statusId]?.modifiers[level],
                blocked,
                allowed,
            );
        }
        for (const passive of passives) {
            collectMoveTypeRules(passive.status, blocked, allowed);
        }
        for (const type of allowed) blocked.delete(type);
        return [character.id, blocked] as const;
    }));
}

function collectMoveTypeRules(
    reference: {
        allowedMoveTypes?: MoveType[];
        blockedMoveTypes?: MoveType[];
    } | undefined,
    blocked: Set<MoveType>,
    allowed: Set<MoveType>,
): void {
    for (const type of reference?.blockedMoveTypes ?? []) blocked.add(type);
    for (const type of reference?.allowedMoveTypes ?? []) allowed.add(type);
}

function bindingLevel(value: number, thresholds: ThresholdInfo): BindingLevel {
    const levels: readonly BindingLevel[] = [
        "impossible",
        "extreme",
        "hard",
        "medium",
        "easy",
    ];
    for (const level of levels) {
        const threshold = thresholds.thresholds[level];
        if (threshold !== undefined && value >= threshold) return level;
    }
    return "none";
}

function preparePressureSourceProgress(
    context: PolicyContext,
    board: SmartBoardAssessment,
): (candidate: SmartCandidate) => PressureSourceProgressBreakdown {
    return (candidate) => evaluatePeriodicBindingPressure(
        context,
        board.bindingPressureSources,
        candidate,
    );
}

function applyCandidateBindingEffects(
    projected: BindingBoard,
    candidate: SmartCandidate,
    characterIds: ReadonlySet<EntityId>,
    maximum: number,
): void {
    applyBindingEffects(projected, candidate.effects, characterIds, maximum);
    for (const target of candidate.targets) {
        for (let hit = 0; hit < candidate.hits; hit += 1) {
            applyBindingEffects(projected, target.effects, characterIds, maximum);
        }
    }
}

function worstRelievedBinding(
    baseline: BindingBoard,
    projected: BindingBoard,
    thresholds: ThresholdInfo,
): { characterId: EntityId; bindingId: BindingId } | undefined {
    let selected: { characterId: EntityId; bindingId: BindingId } | undefined;
    let selectedDebt = -Infinity;

    for (const [characterId, bindings] of baseline) {
        for (const [bindingId, value] of bindings) {
            if (bindingValue(projected, characterId, bindingId) >= value) continue;
            const debt = recoveryDebt(value, thresholds);
            if (debt > selectedDebt) {
                selected = { characterId, bindingId };
                selectedDebt = debt;
            }
        }
    }
    return selected;
}

function applyKnownIncoming(
    projected: BindingBoard,
    board: SmartBoardAssessment,
    maximum: number,
): void {
    for (const character of board.characters) {
        for (const binding of character.incomingBindings) {
            addBinding(
                projected,
                character.id,
                binding.bindingId,
                binding.known,
                maximum,
            );
        }
    }
}

function applyEnemyKnownIncoming(
    projected: BindingBoard,
    enemy: SmartEnemyAssessment,
    maximum: number,
): void {
    for (const target of enemy.bindingTargets) {
        for (const binding of target.bindings) {
            addBinding(
                projected,
                target.characterId,
                binding.bindingId,
                binding.known,
                maximum,
            );
        }
    }
}

function prepareFutureMoveOptions(
    context: PolicyContext,
): (candidate: SmartCandidate) => FutureMoveOptionsBreakdown {
    const characterIds = new Set(context.state.characters.map(({ id }) => id));
    const currentMoves = new Map<EntityId, Set<string>>(
        context.actions
            .filter(({ id }) => characterIds.has(id))
            .map((view) => [view.id, new Set(view.moves.map(({ move }) => move.id))]),
    );
    const activeBlockedMoves = new Map<EntityId, Set<string>>(
        context.state.characters.map((character) => [
            character.id,
            new Set(character.buffs.flatMap(({ moveList }) => moveList?.blockedMoves ?? [])),
        ]),
    );

    return (candidate) => {
        const changes = new Map<EntityId, {
            added: Set<string>;
            blocked: Set<string>;
        }>();
        collectMoveListEffects(candidate.effects, characterIds, changes);
        for (const target of candidate.targets) {
            collectMoveListEffects(target.effects, characterIds, changes);
        }

        const characters: FutureMoveOptionsCharacterBreakdown[] = [];
        let gainedOptions = 0;
        let lostOptions = 0;
        for (const [characterId, { added, blocked }] of changes) {
            const before = currentMoves.get(characterId) ?? new Set<string>();
            const after = new Set([...before, ...added]);
            const allBlocked = new Set([
                ...(activeBlockedMoves.get(characterId) ?? []),
                ...blocked,
            ]);
            const blockedProposedGainIds = [...added].filter((moveId) =>
                !before.has(moveId) && allBlocked.has(moveId)
            );
            for (const moveId of allBlocked) after.delete(moveId);

            const gainedMoveIds = [...after].filter((moveId) => !before.has(moveId));
            const lostMoveIds = [...before].filter((moveId) => !after.has(moveId));
            gainedOptions += gainedMoveIds.length;
            lostOptions += lostMoveIds.length;
            characters.push({
                characterId,
                gainedMoveIds,
                lostMoveIds,
                blockedProposedGainIds,
            });
        }

        return {
            characters,
            gainedOptions,
            lostOptions,
            raw: gainedOptions - lostOptions,
        };
    };
}

function collectMoveListEffects(
    effects: readonly Effect[],
    characterIds: ReadonlySet<EntityId>,
    changes: Map<EntityId, { added: Set<string>; blocked: Set<string> }>,
): void {
    for (const effect of effects) {
        // Removing a move-list buff cannot be reconstructed exactly from the
        // public view, so remove operations are deliberately ignored for now.
        if (effect.type !== "buff" || effect.operation !== "add"
            || effect.moveList === undefined || !characterIds.has(effect.target)) continue;

        let change = changes.get(effect.target);
        if (change === undefined) {
            change = { added: new Set(), blocked: new Set() };
            changes.set(effect.target, change);
        }
        for (const moveId of effect.moveList.addedMoves ?? []) change.added.add(moveId);
        for (const moveId of effect.moveList.blockedMoves ?? []) change.blocked.add(moveId);
    }
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function assertUniqueScorerIds(scorers: readonly SmartScorer[]): void {
    const ids = new Set<string>();
    for (const scorer of scorers) {
        if (ids.has(scorer.id)) {
            throw new Error(`Duplicate Smart scorer ID: ${scorer.id}`);
        }
        ids.add(scorer.id);
    }
}

function moveCandidates(actor: string, info: ActionInfo): SmartCandidate[] {
    const validTargets = uniqueValidTargets(info.targets);
    const targetCount = info.move.targets;
    const hits = info.move.hits ?? 1;

    if (targetCount === 0) {
        return [moveCandidate(actor, info, [], validTargets, hits)];
    }

    if (targetCount === "all") {
        return [moveCandidate(actor, info, [], validTargets, hits)];
    }

    const selectableTargets = validTargets.filter(
        (target): target is ValidTarget & { target: string } => target.target !== null,
    );
    return combinations(selectableTargets, targetCount).map((targets) =>
        moveCandidate(
            actor,
            info,
            targets.map((target) => target.target),
            targets,
            hits,
        )
    );
}

function moveCandidate(
    actor: string,
    info: ActionInfo,
    targetIds: string[],
    targets: ValidTarget[],
    hits: number,
): SmartCandidate {
    return {
        action: {
            type: "move",
            actor,
            move: info.move.id,
            targets: targetIds,
        },
        effects: info.effects,
        targets,
        hits,
    };
}

function escapeCandidate(actor: string, escape: EscapeInfo): SmartCandidate {
    return {
        action: {
            type: "escape",
            actor,
            target: escape.target,
            binding: escape.binding,
        },
        effects: escape.effects,
        targets: [],
        hits: 1,
    };
}

function uniqueValidTargets(targets: ActionInfo["targets"]): ValidTarget[] {
    const result: ValidTarget[] = [];
    const targetIds = new Set<string>();
    let hasNullTarget = false;

    for (const target of targets) {
        if (!target.valid) continue;
        if (target.target === null) {
            if (!hasNullTarget) {
                result.push(target);
                hasNullTarget = true;
            }
        } else if (!targetIds.has(target.target)) {
            result.push(target);
            targetIds.add(target.target);
        }
    }

    return result;
}

function combinations<T>(values: readonly T[], count: number): T[][] {
    if (count < 0 || count > values.length) return [];
    if (count === 0) return [[]];

    const result: T[][] = [];
    const selected: T[] = [];
    const visit = (start: number): void => {
        if (selected.length === count) {
            result.push([...selected]);
            return;
        }

        const remaining = count - selected.length;
        for (let index = start; index <= values.length - remaining; index += 1) {
            selected.push(values[index]);
            visit(index + 1);
            selected.pop();
        }
    };
    visit(0);
    return result;
}

function expectedEnemyDamage(
    candidate: SmartCandidate,
    enemyIds: ReadonlySet<string>,
): number {
    let total = damageEffects(candidate.effects, enemyIds);

    for (const target of candidate.targets) {
        let perHit = damageEffects(target.effects, enemyIds);
        if (target.target !== null && enemyIds.has(target.target)) {
            for (const band of Object.values(target.damage ?? {})) {
                if (band !== undefined) {
                    perHit += (band.chance / 100) * ((band.min + band.max) / 2);
                }
            }
        }
        total += perHit * candidate.hits;
    }

    return total;
}

function finisherPressure(
    candidate: SmartCandidate,
    livingEnemies: readonly Enemy[],
): number {
    if (candidate.action.type !== "move") return 0;

    let total = 0;
    for (const enemy of livingEnemies) {
        const damage = expectedDamageToEnemy(candidate, enemy.id);
        if (damage <= 0) continue;
        total += damage * Math.min(damage / enemy.currHp, 1);
    }
    return total;
}

function damageEffects(effects: readonly Effect[], enemyIds: ReadonlySet<string>): number {
    let total = 0;
    for (const effect of effects) {
        if (effect.type === "damage" && enemyIds.has(effect.target)) {
            total += effect.amount;
        }
    }
    return total;
}

function expectedDamageToEnemy(candidate: SmartCandidate, enemyId: EntityId): number {
    let total = damageEffectsToEnemy(candidate.effects, enemyId);

    for (const target of candidate.targets) {
        let perHit = damageEffectsToEnemy(target.effects, enemyId);
        if (target.target === enemyId) {
            for (const band of Object.values(target.damage ?? {})) {
                if (band !== undefined) {
                    perHit += (band.chance / 100) * ((band.min + band.max) / 2);
                }
            }
        }
        total += perHit * candidate.hits;
    }

    return total;
}

function damageEffectsToEnemy(effects: readonly Effect[], enemyId: EntityId): number {
    let total = 0;
    for (const effect of effects) {
        if (effect.type === "damage" && effect.target === enemyId) total += effect.amount;
    }
    return total;
}
