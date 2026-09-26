import type {
    ActionInfo,
    BindingId,
    Effect,
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

/** Tunable Smart-policy heuristic constants; neither is an engine rule. */
export const RECOVERY_DEBT_CURVE_A = 1.5;
export const BINDING_RECOVERY_WEIGHT = 0.75;
export const FINISHER_PRESSURE_WEIGHT = 1;

/** Smart 1's expected-direct-enemy-damage behavior as a reusable component. */
export const expectedDamageScorer: SmartScorer = {
    id: "expectedDamage",
    weight: 1,
    prepare(context) {
        const enemyIds = new Set(context.state.enemies.map((enemy) => enemy.id));
        return (candidate) => expectedEnemyDamage(candidate, enemyIds);
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

/** Rewards expected damage applied to enemies near defeat. This is a policy heuristic. */
export const finisherPressureScorer: SmartScorer = {
    id: "finisherPressure",
    weight: FINISHER_PRESSURE_WEIGHT,
    prepare(context) {
        const livingEnemies = context.state.enemies.filter(({ currHp }) => currHp > 0);
        return (candidate) => {
            if (candidate.action.type !== "move") return 0;

            let total = 0;
            for (const enemy of livingEnemies) {
                const damage = expectedDamageToEnemy(candidate, enemy.id);
                if (damage <= 0) continue;
                total += damage * Math.min(damage / enemy.currHp, 1);
            }
            return total;
        };
    },
};

/** Production scorer registration order. Later Smart cards can extend this list. */
export const smartScorers: readonly SmartScorer[] = [
    expectedDamageScorer,
    bindingRecoveryScorer,
    finisherPressureScorer,
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
        if (candidate.action.type !== "escape") {
            return emptyBindingRecovery();
        }

        const escaped = cloneBindingBoard(current);
        for (const effect of candidate.effects) {
            if (effect.type !== "binding" || effect.amount === undefined
                || !characterIds.has(effect.target)) continue;
            addBinding(
                escaped,
                effect.target,
                effect.binding,
                effect.amount,
                context.thresholds.max,
            );
        }
        applyKnownIncoming(escaped, board, context.thresholds.max);

        const escapedDebt = totalRecoveryDebt(escaped, context.thresholds);
        const recoveryGain = baselineDebt - escapedDebt;
        const selectedCurrent = bindingValue(
            current,
            candidate.action.target,
            candidate.action.binding,
        );
        const selectedIncoming = knownIncoming(
            board,
            candidate.action.target,
            candidate.action.binding,
        );
        const selectedProjectedValue = clamp(
            selectedCurrent + selectedIncoming,
            0,
            context.thresholds.max,
        );
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

function knownIncoming(
    board: SmartBoardAssessment,
    characterId: EntityId,
    bindingId: BindingId,
): number {
    return board.characters.find(({ id }) => id === characterId)
        ?.incomingBindings.find((binding) => binding.bindingId === bindingId)
        ?.known ?? 0;
}

function totalRecoveryDebt(board: BindingBoard, thresholds: ThresholdInfo): number {
    let total = 0;
    for (const bindings of board.values()) {
        for (const value of bindings.values()) total += recoveryDebt(value, thresholds);
    }
    return total;
}

function emptyBindingRecovery(): BindingRecoveryBreakdown {
    return {
        baselineDebt: 0,
        escapedDebt: 0,
        recoveryGain: 0,
        selectedProjectedValue: 0,
        selectedDebt: 0,
        urgency: 1,
        raw: 0,
    };
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
