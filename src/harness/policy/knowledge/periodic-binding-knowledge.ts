import type { BindingId, Effect, EntityId } from "../../../engine/public/types";
import type { PolicyContext } from "../../harness";
import {
    addBinding,
    bindingValue,
    cloneBindingBoard,
    currentBindingBoard,
    totalRecoveryDebt,
} from "../smart-bindings";
import type { SmartCandidate } from "../smart";

/** An active binding whose public tick effects can add recurring recovery debt. */
export interface SmartBindingPressureSource {
    readonly characterId: EntityId;
    readonly bindingId: BindingId;
    readonly sourceValue: number;
    readonly tickPressure: number;
}

export interface PeriodicBindingSourceBreakdown {
    readonly characterId: EntityId;
    readonly bindingId: BindingId;
    readonly currentValue: number;
    readonly projectedValue: number;
    readonly removed: number;
    readonly progressFraction: number;
    readonly tickPressure: number;
    readonly contribution: number;
}

export interface PeriodicBindingPressureBreakdown {
    readonly sources: readonly PeriodicBindingSourceBreakdown[];
    readonly raw: number;
}

/**
 * Projects exactly one future tick from each source's public tickEffects.
 * Only positive, numeric binding effects are supported: harmless, restorative,
 * unknown, and non-binding effects are deliberately ignored rather than guessed.
 */
export function assessPeriodicBindingPressureSources(
    context: Pick<PolicyContext, "state" | "thresholds">,
): SmartBindingPressureSource[] {
    const characterIds = new Set(context.state.characters.map(({ id }) => id));
    const current = currentBindingBoard(context.state.characters);
    const beforeDebt = totalRecoveryDebt(current, context.thresholds);
    const sources: SmartBindingPressureSource[] = [];

    for (const character of context.state.characters) {
        for (const binding of character.bindings) {
            if (binding.tickEffects.length === 0) continue;
            const afterTick = cloneBindingBoard(current);
            applyHarmfulTickEffects(
                afterTick,
                binding.tickEffects,
                characterIds,
                context.thresholds.max,
            );
            const afterDebt = totalRecoveryDebt(afterTick, context.thresholds);
            sources.push({
                characterId: character.id,
                bindingId: binding.id,
                sourceValue: binding.value,
                tickPressure: Math.max(0, afterDebt - beforeDebt),
            });
        }
    }
    return sources;
}

/** Values only removal of the actual ticking source, not nearby bindings. */
export function evaluatePeriodicBindingPressure(
    context: PolicyContext,
    sources: readonly SmartBindingPressureSource[],
    candidate: SmartCandidate,
): PeriodicBindingPressureBreakdown {
    const characterIds = new Set(context.state.characters.map(({ id }) => id));
    const projected = currentBindingBoard(context.state.characters);
    applyCandidateBindingEffects(
        projected,
        candidate,
        characterIds,
        context.thresholds.max,
    );

    const breakdown = sources.map((source) => {
        const currentValue = source.sourceValue;
        const projectedValue = bindingValue(
            projected,
            source.characterId,
            source.bindingId,
        );
        const removed = Math.max(0, currentValue - projectedValue);
        const progressFraction = currentValue > 0 ? removed / currentValue : 0;
        const contribution = source.tickPressure * progressFraction;
        return {
            characterId: source.characterId,
            bindingId: source.bindingId,
            currentValue,
            projectedValue,
            removed,
            progressFraction,
            tickPressure: source.tickPressure,
            contribution,
        };
    });

    return {
        sources: breakdown,
        raw: breakdown.reduce((total, source) => total + source.contribution, 0),
    };
}

function applyHarmfulTickEffects(
    projected: ReturnType<typeof currentBindingBoard>,
    effects: readonly Effect[],
    characterIds: ReadonlySet<EntityId>,
    maximum: number,
): void {
    for (const effect of effects) {
        if (effect.type !== "binding" || effect.amount === undefined || effect.amount <= 0
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

function applyCandidateBindingEffects(
    projected: ReturnType<typeof currentBindingBoard>,
    candidate: SmartCandidate,
    characterIds: ReadonlySet<EntityId>,
    maximum: number,
): void {
    applyEffects(projected, candidate.effects, characterIds, maximum);
    for (const target of candidate.targets) {
        for (let hit = 0; hit < candidate.hits; hit += 1) {
            applyEffects(projected, target.effects, characterIds, maximum);
        }
    }
}

function applyEffects(
    projected: ReturnType<typeof currentBindingBoard>,
    effects: readonly Effect[],
    characterIds: ReadonlySet<EntityId>,
    maximum: number,
): void {
    for (const effect of effects) {
        if (effect.type !== "binding" || effect.amount === undefined
            || !characterIds.has(effect.target)) continue;
        addBinding(projected, effect.target, effect.binding, effect.amount, maximum);
    }
}
