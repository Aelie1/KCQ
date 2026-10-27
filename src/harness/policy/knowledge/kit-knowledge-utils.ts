import type { Buff, Effect, Enemy, Intention, ValidTarget } from "../../../engine/public/types";
import type { PolicyContext } from "../../harness";
import { smartEnemyContext } from "../smart-enemies";
import type { SmartCandidate } from "../smart";
import { addBinding, cloneBindingBoard, currentBindingBoard, totalRecoveryDebt } from "../smart-bindings";
import { TRAP_PRESSURE_SCALE } from "./tempo-knowledge";

export function candidateEffects(candidate: SmartCandidate): readonly Effect[] {
    return [...candidate.effects, ...candidate.targets.flatMap(({ effects }) => effects)];
}

/** Misses and resolved intentions have no committed numeric pressure. */
export function committedEffects(intention: Intention): readonly Effect[] {
    return intention.resolved ? [] : [
        ...intention.targets.filter(({ band }) => band !== "miss").flatMap(({ effects }) => effects),
        ...intention.effects,
    ];
}

/** Compare full party projections so overlapping tracks and capped bindings are respected. */
export function mitigatedPressure(
    context: PolicyContext,
    fraction: (enemy: Enemy, intention: Intention) => number,
    includeEffect: (effect: Effect) => boolean = () => true,
): number {
    context = smartEnemyContext(context);
    const baseline = currentBindingBoard(context.state.characters);
    const mitigated = cloneBindingBoard(baseline);
    let preventedTraps = 0;
    for (const enemy of context.state.enemies) {
        if (enemy.currHp <= 0) continue;
        for (const intention of enemy.intentions) {
            const reduction = Math.max(0, Math.min(1, fraction(enemy, intention)));
            for (const effect of committedEffects(intention)) {
                if (!includeEffect(effect)) continue;
                if (effect.type === "binding" && (effect.amount ?? 0) > 0) {
                    addBinding(baseline, effect.target, effect.binding, effect.amount!, context.thresholds.max);
                    addBinding(mitigated, effect.target, effect.binding,
                        effect.amount! * (1 - reduction), context.thresholds.max);
                } else if (effect.type === "trap" && effect.amount > 0) {
                    preventedTraps += effect.amount * TRAP_PRESSURE_SCALE * reduction;
                }
            }
        }
    }
    return Math.max(0, totalRecoveryDebt(baseline, context.thresholds)
        - totalRecoveryDebt(mitigated, context.thresholds)) + preventedTraps;
}

/** Buff effects on damage previews are conditional on a non-miss, once per target. */
export function applicationChance(preview: ValidTarget): number {
    return preview.accuracy === undefined ? 1 : 1 - (preview.accuracy.miss ?? 0) / 100;
}

/** Same-ID buffs replace, rather than stack. Only credit new duration/modifiers. */
export function incrementalDuration(buff: Buff, existing: readonly Buff[]): number {
    const previous = existing.find(({ id }) => id === buff.id);
    if (previous === undefined) return buff.duration ?? 1;
    const equivalent = Object.entries(buff.modifiers ?? {}).every(([key, value]) =>
        previous.modifiers?.[key as keyof NonNullable<Buff["modifiers"]>] === value);
    return equivalent ? Math.max(0, (buff.duration ?? 1) - (previous.duration ?? 1)) : buff.duration ?? 1;
}

/** Estimate public follow-up offense, excluding the actor's already-spent action. */
export function followUpDamage(context: PolicyContext, actorId: string, enemyId: string): number {
    context = smartEnemyContext(context);
    if (!context.state.enemies.some(({ id }) => id === enemyId)) return 0;
    let total = 0;
    for (const view of context.actions) {
        const character = context.state.characters.find(({ id }) => id === view.id);
        if (view.id === actorId || character?.acted !== false || !view.available) continue;
        let best = 0;
        for (const info of view.moves) {
            if (!info.available) continue;
            const target = info.targets.find((target) => target.valid && target.target === enemyId);
            if (target?.valid !== true) continue;
            best = Math.max(best, previewDamage(target, info.move.hits ?? 1));
        }
        total += best;
    }
    return total;
}

/** A damaging move's public preview already includes passives (including Thrillseeker). */
export function previewDamage(preview: ValidTarget, hits: number): number {
    return Object.values(preview.damage ?? {}).reduce((sum, band) =>
        sum + (band === undefined ? 0 : band.chance / 100 * (band.min + band.max) / 2), 0) * hits;
}
