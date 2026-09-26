import type {
    ActionInfo,
    Effect,
    EscapeInfo,
    PlayerAction,
    ValidTarget,
} from "../../engine/public/types";
import type { FightPolicy, PolicyContext } from "../harness";

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

/**
 * The index signature lets later Smart cards add named components without
 * changing the decision/candidate architecture.
 */
export interface SmartScoreComponents {
    readonly expectedDamage: number;
    readonly [name: string]: number;
}

export interface ScoredSmartCandidate extends SmartCandidate {
    readonly components: SmartScoreComponents;
    readonly total: number;
}

export interface SmartDecision {
    readonly candidates: readonly ScoredSmartCandidate[];
    readonly selected: ScoredSmartCandidate;
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
export function evaluateSmartDecision(context: PolicyContext): SmartDecision {
    const enemyIds = new Set(context.state.enemies.map((enemy) => enemy.id));
    const candidates = generateSmartCandidates(context).map((candidate) => {
        const expectedDamage = expectedEnemyDamage(candidate, enemyIds);
        return {
            ...candidate,
            components: { expectedDamage },
            total: expectedDamage,
        };
    });

    // Candidate generation always supplies endTurn.
    let selected = candidates[0];
    for (let index = 1; index < candidates.length; index += 1) {
        if (candidates[index].total > selected.total) {
            selected = candidates[index];
        }
    }

    return { candidates, selected };
}

export const smartPolicy: FightPolicy = {
    id: "smart",
    chooseAction(context) {
        return evaluateSmartDecision(context).selected.action;
    },
    evaluateDecision(context) {
        const decision = evaluateSmartDecision(context);
        return {
            action: decision.selected.action,
            diagnostics: decision,
        };
    },
};

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
