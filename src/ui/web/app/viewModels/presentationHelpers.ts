import type { BindingLevel, ModifierId, ThresholdInfo } from "../../../../engine/public/types";

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

export function bindingLevelAtValue(value: number, info: ThresholdInfo): BindingLevel {
    const levels: BindingLevel[] = [
        "max",
        "overwhelming",
        "severe",
        "heavy",
        "moderate",
        "light",
    ];

    for (const level of levels) {
        const threshold = level === "max" ? info.max : info.thresholds[level];
        if (threshold !== undefined && value >= threshold) return level;
    }

    return "none";
}
