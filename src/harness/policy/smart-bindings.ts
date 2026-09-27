import type {
    BindingId,
    Character,
    Effect,
    EntityId,
    ThresholdInfo,
} from "../../engine/public/types";

export type BindingBoard = Map<EntityId, Map<BindingId, number>>;

/** Tunable Smart-policy curve constant; this is not an engine rule. */
export const RECOVERY_DEBT_CURVE_A = 1.5;

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

export function currentBindingBoard(characters: readonly Character[]): BindingBoard {
    return new Map(characters.map((character) => [
        character.id,
        new Map(character.bindings.map((binding) => [binding.id, binding.value])),
    ]));
}

export function cloneBindingBoard(board: BindingBoard): BindingBoard {
    return new Map([...board].map(([characterId, bindings]) => [
        characterId,
        new Map(bindings),
    ]));
}

/** Applies only public, numeric binding effects, in order and with per-effect bounds. */
export function applyBindingEffects(
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

export function addBinding(
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

export function bindingValue(
    board: BindingBoard,
    characterId: EntityId,
    bindingId: BindingId,
): number {
    return board.get(characterId)?.get(bindingId) ?? 0;
}

export function totalRecoveryDebt(board: BindingBoard, thresholds: ThresholdInfo): number {
    let total = 0;
    for (const bindings of board.values()) {
        for (const value of bindings.values()) total += recoveryDebt(value, thresholds);
    }
    return total;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}
