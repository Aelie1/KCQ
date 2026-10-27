import { getBindingPotency, thresholds } from "../protected/mechanics";
import { REGEN_MODIFIER } from "../private/constants";
import { ThresholdInfo } from "./types";

export function getThresholds(): ThresholdInfo {
    return {
        thresholds: {
            light: thresholds.light,
            moderate: thresholds.moderate,
            heavy: thresholds.heavy,
            severe: thresholds.severe,
            overwhelming: thresholds.overwhelming
        },
        max: thresholds.max
    }
}

export function getBindingProgress(base: number, amount: number): number {
    return getBindingPotency(base, amount);
}

/** Healing from one tick of the combined active regeneration modifier. */
export function getRegenerationHealing(regeneration: number): number {
    return regeneration * REGEN_MODIFIER;
}
