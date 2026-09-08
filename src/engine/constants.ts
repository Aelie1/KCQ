import { AccuracyResult, BindingLevel } from "./types";

export const BINDING_MAX = 100;

export const bindingThresholds: Record<BindingLevel, number> = {
    none: 0,
    easy: 10,
    medium: 20,
    hard: 30,
    extreme: 50,
    impossible: 80
};

export const effectivenessRange: Record<AccuracyResult, [number, number]> = {
    miss: [0, 0],
    graze: [0.20, 0.50],
    hit: [0.80, 1.00],
    crit: [1.50, 2.00],
};