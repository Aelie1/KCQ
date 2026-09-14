import { HitBand } from "../public/types";

export const BINDING_MODIFIER = 0.1;
export const EFFECTIVENESS_MODIFIER = 0.125;
export const DEFENSE_MODIFIER = 10;
export const HIT_MODIFIER = 10;
export const WILLPOWER_MODIFIER = 10;
export const TRAP_MODIFIER = 5;
export const TRAP_MAX = 100;

export const effectivenessRange: Record<HitBand, [number, number]> = {
    miss: [0, 0],
    graze: [0.20, 0.50],
    hit: [0.80, 1.00],
    crit: [1.50, 2.00],
    none: [0, 0],
};
