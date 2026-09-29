import type { Effect, EntityId, ValidTarget } from "../../engine/public/types";

const HIT_BANDS = ["miss", "graze", "hit", "crit", "none"] as const;

export interface SmartDamageCandidate {
    readonly effects: readonly Effect[];
    readonly targets: readonly ValidTarget[];
    readonly hits: number;
}

export interface SmartDamageOutcome {
    readonly damage: number;
    readonly probability: number;
}

/**
 * Exact discrete total-damage distribution derived only from public previews.
 * Missing preview probability is retained as zero previewed damage.
 */
export function damageDistribution(
    candidate: SmartDamageCandidate,
    enemyId: EntityId,
): readonly SmartDamageOutcome[] {
    let distribution = new Map<number, number>([
        [damageEffectsToEnemy(candidate.effects, enemyId), 1],
    ]);

    for (const target of candidate.targets) {
        const perHit = perHitDamageDistribution(target, enemyId);
        for (let hit = 0; hit < candidate.hits; hit += 1) {
            distribution = convolve(distribution, perHit);
        }
    }

    return [...distribution.entries()]
        .sort(([left], [right]) => left - right)
        .map(([damage, probability]) => ({ damage, probability }));
}

/** Probability, from 0 through 1, that a candidate deals at least the requested damage. */
export function probabilityDamageAtLeast(
    candidate: SmartDamageCandidate,
    enemyId: EntityId,
    requiredDamage: number,
): number {
    if (requiredDamage <= 0) return 1;
    const probability = damageDistribution(candidate, enemyId).reduce(
        (total, outcome) => total + (outcome.damage >= requiredDamage ? outcome.probability : 0),
        0,
    );
    return clamp(probability, 0, 1);
}

function perHitDamageDistribution(
    target: ValidTarget,
    enemyId: EntityId,
): ReadonlyMap<number, number> {
    const fixedDamage = damageEffectsToEnemy(target.effects, enemyId);
    if (target.target !== enemyId || target.damage === undefined) {
        return new Map([[fixedDamage, 1]]);
    }

    const previewDamage = new Map<number, number>();
    let representedProbability = 0;
    for (const band of HIT_BANDS) {
        const preview = target.damage[band];
        if (preview === undefined) continue;
        const probability = clamp(preview.chance / 100, 0, 1);
        const minimum = Math.ceil(preview.min);
        const maximum = Math.floor(preview.max);
        const valueCount = maximum - minimum + 1;
        if (probability <= 0 || valueCount <= 0) continue;

        representedProbability += probability;
        const probabilityPerValue = probability / valueCount;
        for (let damage = minimum; damage <= maximum; damage += 1) {
            addProbability(previewDamage, fixedDamage + damage, probabilityPerValue);
        }
    }

    if (representedProbability > 1) {
        for (const [damage, probability] of previewDamage) {
            previewDamage.set(damage, probability / representedProbability);
        }
    } else if (representedProbability < 1) {
        addProbability(previewDamage, fixedDamage, 1 - representedProbability);
    }

    if (previewDamage.size === 0) previewDamage.set(fixedDamage, 1);
    return previewDamage;
}

function convolve(
    left: ReadonlyMap<number, number>,
    right: ReadonlyMap<number, number>,
): Map<number, number> {
    const result = new Map<number, number>();
    for (const [leftDamage, leftProbability] of left) {
        for (const [rightDamage, rightProbability] of right) {
            addProbability(
                result,
                leftDamage + rightDamage,
                leftProbability * rightProbability,
            );
        }
    }
    return result;
}

function addProbability(
    distribution: Map<number, number>,
    damage: number,
    probability: number,
): void {
    distribution.set(damage, (distribution.get(damage) ?? 0) + probability);
}

function damageEffectsToEnemy(effects: readonly Effect[], enemyId: EntityId): number {
    let total = 0;
    for (const effect of effects) {
        if (effect.type === "damage" && effect.target === enemyId) total += effect.amount;
    }
    return total;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}
