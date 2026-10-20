import type { BindingLevel, Buff, ModifierId, ThresholdInfo } from "../../../../engine/public/types";

const HIGHER_IS_HARMFUL = new Set<ModifierId>([
    "vulnerability",
    "spread",
]);

export function formatSignedNumber(value: number): string {
    return value >= 0 ? `+${value}` : String(value);
}

export function isHarmfulModifierChange(modifier: ModifierId, value: number): boolean | undefined {
    if (value === 0) return undefined;
    return HIGHER_IS_HARMFUL.has(modifier) ? value > 0 : value < 0;
}

/** Use the same effect classification on previews and overview duration indicators. */
export function isDebuff(buff: Buff): boolean {
    const classifications = (Object.entries(buff.modifiers ?? {}) as [ModifierId, number][])
        .map(([modifier, value]) => isHarmfulModifierChange(modifier, value));
    return (buff.moveList?.blockedMoves?.length ?? 0) > 0 || (buff.statuses?.length ?? 0) > 0
        || (classifications.length > 0 && classifications.every(value => value === true));
}

// Descending severity order, shared by threshold lookup and combat reactions.
export const BINDING_LEVELS: readonly BindingLevel[] = [
    "max",
    "overwhelming",
    "severe",
    "heavy",
    "moderate",
    "light",
    "none",
];

export function bindingLevelAtValue(value: number, info: ThresholdInfo): BindingLevel {
    for (const level of BINDING_LEVELS) {
        if (level === "none") continue;
        const threshold = level === "max" ? info.max : info.thresholds[level];
        if (threshold !== undefined && value >= threshold) return level;
    }

    return "none";
}
