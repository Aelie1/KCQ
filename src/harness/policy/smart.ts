import type {
    ActionInfo,
    BindingId,
    Effect,
    Enemy,
    EntityId,
    EscapeInfo,
    PlayerAction,
    ThresholdInfo,
    ValidTarget,
} from "../../engine/public/types";
import type { FightPolicy, PolicyContext } from "../harness";
import {
    assessSmartBoard,
    type SmartBoardAssessment,
} from "./smart-board";

export * from "./smart-board";

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

export interface FutureMoveOptionsCharacterBreakdown {
    readonly characterId: EntityId;
    readonly gainedMoveIds: readonly string[];
    readonly lostMoveIds: readonly string[];
}

export interface FutureMoveOptionsBreakdown {
    readonly characters: readonly FutureMoveOptionsCharacterBreakdown[];
    readonly gainedOptions: number;
    readonly lostOptions: number;
    readonly raw: number;
}

export interface ReserveSpendingBreakdown {
    readonly lostOptions: number;
    readonly offensiveValue: number;
    readonly expectedKills: number;
    readonly offensiveJustification: number;
    readonly raw: number;
}

/** Tunable Smart-policy heuristic constants; none is an engine rule. */
export const RECOVERY_DEBT_CURVE_A = 1.5;
export const BINDING_RECOVERY_WEIGHT = 0.75;
export const FINISHER_PRESSURE_WEIGHT = 1;
export const FUTURE_MOVE_OPTIONS_WEIGHT = 20;
export const RESERVE_SPENDING_WEIGHT = 1;

/** Smart 1's expected-direct-enemy-damage behavior as a reusable component. */
export const expectedDamageScorer: SmartScorer = {
    id: "expectedDamage",
    weight: 1,
    prepare(context) {
        return prepareExpectedEnemyDamage(context);
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

/** Coarsely values declarative gains and losses in future move-list membership. */
export const futureMoveOptionsScorer: SmartScorer = {
    id: "futureMoveOptions",
    weight: FUTURE_MOVE_OPTIONS_WEIGHT,
    prepare(context) {
        const evaluate = prepareFutureMoveOptions(context);
        return (candidate) => evaluate(candidate).raw;
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
    bindingRecoveryScorer,
    finisherPressureScorer,
    futureMoveOptionsScorer,
    reserveSpendingScorer,
];

/**
 * Convex estimate of the effort to recover one binding track. This is a Smart
 * policy heuristic, not a game mechanic.
 */
export function recoveryDebt(value: number, thresholds: ThresholdInfo): number {
    const impossible = thresholds.thresholds.impossible;
    const maximum = thresholds.max;
    if (impossible === undefined || impossible <= 0 || maximum <= 0) return 0;

    const clamped = clamp(value, 0, maximum);
    if (clamped <= impossible) {
        return clamped
            + RECOVERY_DEBT_CURVE_A * clamped ** 3 / impossible ** 2;
    }

    const debtAtImpossible = impossible + RECOVERY_DEBT_CURVE_A * impossible;
    const slopeAtImpossible = 1 + 3 * RECOVERY_DEBT_CURVE_A;
    return debtAtImpossible + (clamped - impossible) * slopeAtImpossible;
}

/** Exposes the scorer's formula breakdown for focused tests and diagnostics. */
export function evaluateBindingRecovery(
    context: PolicyContext,
    board: SmartBoardAssessment,
    candidate: SmartCandidate,
): BindingRecoveryBreakdown {
    return prepareBindingRecovery(context, board)(candidate);
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

function prepareExpectedEnemyDamage(
    context: PolicyContext,
): (candidate: SmartCandidate) => number {
    const enemyIds = new Set(context.state.enemies.map((enemy) => enemy.id));
    return (candidate) => expectedEnemyDamage(candidate, enemyIds);
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
    const preparedScorers = scorers.map((scorer) => ({
        id: scorer.id,
        weight: scorer.weight,
        evaluate: scorer.prepare(context, board),
    }));
    const candidates = generateSmartCandidates(context).map((candidate) => {
        const componentEntries = preparedScorers.map((scorer) => {
            const raw = scorer.evaluate(candidate);
            const component: SmartScoreComponent = {
                raw,
                weight: scorer.weight,
                score: raw * scorer.weight,
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

type BindingBoard = Map<EntityId, Map<BindingId, number>>;

function prepareBindingRecovery(
    context: PolicyContext,
    board: SmartBoardAssessment,
): (candidate: SmartCandidate) => BindingRecoveryBreakdown {
    const characterIds = new Set(context.state.characters.map(({ id }) => id));
    const current = currentBindingBoard(context);
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

function applyBindingEffects(
    projected: BindingBoard,
    effects: readonly Effect[],
    characterIds: ReadonlySet<EntityId>,
    maximum: number,
): void {
    for (const effect of effects) {
        if (effect.type !== "binding" || effect.amount === undefined
            || !characterIds.has(effect.target)) continue;
        addBinding(
            projected,
            effect.target,
            effect.binding,
            effect.amount,
            maximum,
        );
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

function currentBindingBoard(context: PolicyContext): BindingBoard {
    return new Map(context.state.characters.map((character) => [
        character.id,
        new Map(character.bindings.map((binding) => [binding.id, binding.value])),
    ]));
}

function cloneBindingBoard(board: BindingBoard): BindingBoard {
    return new Map([...board].map(([characterId, bindings]) => [
        characterId,
        new Map(bindings),
    ]));
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

function addBinding(
    board: BindingBoard,
    characterId: EntityId,
    bindingId: BindingId,
    amount: number,
    maximum: number,
): void {
    const bindings = board.get(characterId);
    if (!bindings) return;
    bindings.set(
        bindingId,
        clamp((bindings.get(bindingId) ?? 0) + amount, 0, maximum),
    );
}

function bindingValue(
    board: BindingBoard,
    characterId: EntityId,
    bindingId: BindingId,
): number {
    return board.get(characterId)?.get(bindingId) ?? 0;
}

function totalRecoveryDebt(board: BindingBoard, thresholds: ThresholdInfo): number {
    let total = 0;
    for (const bindings of board.values()) {
        for (const value of bindings.values()) total += recoveryDebt(value, thresholds);
    }
    return total;
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
            for (const moveId of blocked) after.delete(moveId);

            const gainedMoveIds = [...after].filter((moveId) => !before.has(moveId));
            const lostMoveIds = [...before].filter((moveId) => !after.has(moveId));
            gainedOptions += gainedMoveIds.length;
            lostOptions += lostMoveIds.length;
            characters.push({ characterId, gainedMoveIds, lostMoveIds });
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
