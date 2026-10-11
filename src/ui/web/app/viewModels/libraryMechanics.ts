import type { MoveReference } from "../../../../engine/public/library";
import type { AccuracyProfile, HitBand } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import type { DamageProfileViewModel } from "./effectPreviews";

/** Static reference rules, checked against the engine in library.test.ts.
 * No engine internals, runtime state, difficulty, or target defenses enter this projection. */
export const LIBRARY_EFFECTIVENESS: Record<Exclude<HitBand, "none">, readonly [number, number]> = {
    miss: [0, 0], graze: [0.2, 0.5], hit: [0.8, 1], crit: [1.5, 2],
};
export const LIBRARY_HIT_STEP = 10;
export const LIBRARY_POTENCY_STEP = 0.1;

/** Include bonuses intrinsic to the move, with all actor/target modifiers neutral. */
export function libraryAccuracy(move: MoveReference, player = true): AccuracyProfile | undefined {
    const base = move.accuracy;
    if (!base) return undefined;
    const typeHit = player && move.type !== "none" ? move.modifiers?.[("hit" + move.type) as "hitarms" | "hitmouth" | "hitlegs"] ?? 0 : 0;
    const delta = LIBRARY_HIT_STEP * (move.check === "willpower" ? move.modifiers?.willpower ?? 0 : (move.modifiers?.hit ?? 0) + typeHit);
    const clamp = (value: number) => Math.max(0, Math.min(100, value));
    let crit = base.crit === undefined ? 0 : clamp(base.crit + (player ? delta : Math.min(delta, 0)) * 0.1);
    let fullHit = Math.max(crit, clamp((base.hit ?? 0) + (base.crit ?? 0) + delta));
    let contact = Math.max(fullHit, clamp((base.graze ?? 0) + (base.hit ?? 0) + (base.crit ?? 0) + delta * 0.5));
    if (base.hit === undefined) fullHit = crit;
    if (base.graze === undefined) contact = fullHit;
    if (base.miss === undefined) {
        contact = 100;
        if (base.graze === undefined) {
            fullHit = 100;
            if (base.hit === undefined) crit = 100;
        }
    }
    return {
        ...(base.miss === undefined ? {} : { miss: 100 - contact }),
        ...(base.graze === undefined ? {} : { graze: contact - fullHit }),
        ...(base.hit === undefined ? {} : { hit: fullHit - crit }),
        ...(base.crit === undefined ? {} : { crit }),
    };
}

/** Per-hit, multiplied-out baseline amounts; the game rounds each application up. */
export function libraryDamageProfile(move: MoveReference, p: Presentation, player = true): DamageProfileViewModel | undefined {
    if (move.baseDamage === undefined || !move.accuracy) return undefined;
    const accuracy = libraryAccuracy(move, player)!;
    const multiplier = 1 + (move.modifiers?.potency ?? 0) * LIBRARY_POTENCY_STEP;
    return {
        kind: "damage-profile", label: p.ui("targeting.effectDamage"), tone: "danger",
        bands: (Object.entries(LIBRARY_EFFECTIVENESS) as [Exclude<HitBand, "none">, readonly [number, number]][]).map(([band, range]) => {
            const chance = accuracy[band] ?? 0;
            const min = chance === 0 ? 0 : Math.ceil(range[0] * move.baseDamage! * multiplier);
            const max = chance === 0 ? 0 : Math.ceil(range[1] * move.baseDamage! * multiplier);
            return { band, chance, min, max, label: p.hitBand(band),
                chanceLabel: p.ui("targeting.chance", { band: p.hitBand(band), chance: Math.round(chance * 10) / 10 }),
                rangeLabel: p.ui("targeting.damageRange", { min, max }), zero: chance === 0, emphasized: false };
        }),
    };
}
