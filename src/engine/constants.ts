import { HitBand, BindingLevel } from "./types";

export const BINDING_MODIFIER = 0.1;
export const EFFECT_MODIFIER = 0.125;
export const DEFENSE_MODIFIER = 10;
export const HIT_MODIFIER = 10;
export const SPREAD_MODIFIER = 0.1;

export const thresholds: Record<BindingLevel, number> = {
    none: 0,
    easy: 10,
    medium: 20,
    hard: 30,
    extreme: 50,
    impossible: 80,
    max: 100
};

export const effectivenessRange: Record<HitBand, [number, number]> = {
    miss: [0, 0],
    graze: [0.20, 0.50],
    hit: [0.80, 1.00],
    crit: [1.50, 2.00],
    none: [0, 0],
};