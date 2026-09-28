import type {
    Character,
    Enemy,
    EntityId,
    HitBand,
} from "../../../engine/public/types";
import type { PolicyContext } from "../../harness";
import {
    addBinding,
    cloneBindingBoard,
    currentBindingBoard,
    totalRecoveryDebt,
} from "../smart-bindings";
import type { SmartCandidate } from "../smart";
import { expectedDamageToEnemy } from "./tempo-knowledge";

export const SUSTAINED_PRESSURE_PROGRESS_WEIGHT = 1;

export interface RainmakerBandProbabilities {
    readonly miss: number;
    readonly graze: number;
    readonly hit: number;
    readonly crit: number;
}

const RAINMAKER_ACCURACY: RainmakerBandProbabilities = {
    miss: 50,
    graze: 30,
    hit: 15,
    crit: 5,
};
const RAINMAKER_BINDING_AMOUNT = 10;
const RAINMAKER_TRACKS = [
    "latexHead",
    "latexArms",
    "latexTorso",
    "latexLegs",
] as const;
const RAINMAKER_TRACKS_BY_BAND: Readonly<Record<HitBand, number>> = {
    none: 0,
    miss: 0,
    graze: 2,
    hit: 3,
    crit: 4,
};
const DEFENSE_MODIFIER = 10;

export interface SustainedPressureCharacterBreakdown {
    readonly characterId: EntityId;
    readonly defense: number;
    readonly bandProbabilities: RainmakerBandProbabilities;
    readonly pressurePerTurn: number;
}

export interface SustainedEnemyPressure {
    readonly enemyId: EntityId;
    readonly pressurePerTurn: number;
    /** Probability that every character receives a Miss result. */
    readonly quietTurnProbability: number;
    readonly characters: readonly SustainedPressureCharacterBreakdown[];
}

export interface SustainedPressureProgressEnemyBreakdown {
    readonly enemyId: EntityId;
    readonly pressurePerTurn: number;
    readonly expectedDamage: number;
    readonly currentHp: number;
    readonly progressFraction: number;
    readonly contribution: number;
    readonly quietTurnProbability: number;
    readonly characters: readonly SustainedPressureCharacterBreakdown[];
}

export interface SustainedPressureProgressBreakdown {
    readonly enemies: readonly SustainedPressureProgressEnemyBreakdown[];
    readonly raw: number;
}

/** Forecasts one ordinary future turn for the currently modeled enemies. */
export function assessSustainedEnemyPressure(
    context: PolicyContext,
): readonly SustainedEnemyPressure[] {
    const current = currentBindingBoard(context.state.characters);
    const baselineDebt = totalRecoveryDebt(current, context.thresholds);

    return context.state.enemies.flatMap((enemy) => {
        if (enemy.currHp <= 0 || !isRainmaker(enemy)) return [];

        const characters = context.state.characters.map((character) =>
            rainmakerPressureAgainstCharacter(
                context,
                character,
                current,
                baselineDebt,
            )
        );
        return [{
            enemyId: enemy.id,
            pressurePerTurn: characters.reduce(
                (total, character) => total + character.pressurePerTurn,
                0,
            ),
            quietTurnProbability: characters.reduce(
                (probability, character) =>
                    probability * character.bandProbabilities.miss / 100,
                1,
            ),
            characters,
        }];
    });
}

/** Rewards damage progress in proportion to the enemy's forecast recurring pressure. */
export function evaluateSustainedPressureProgress(
    context: PolicyContext,
    candidate: SmartCandidate,
    pressure: readonly SustainedEnemyPressure[] = assessSustainedEnemyPressure(context),
): SustainedPressureProgressBreakdown {
    const enemiesById = new Map(
        context.state.enemies.map((enemy) => [enemy.id, enemy] as const),
    );
    const enemies = pressure.flatMap((assessment) => {
        const enemy = enemiesById.get(assessment.enemyId);
        if (enemy === undefined || enemy.currHp <= 0) return [];

        const expectedDamage = expectedDamageToEnemy(candidate, enemy.id);
        const progressFraction = clamp(expectedDamage / enemy.currHp, 0, 1);
        return [{
            enemyId: enemy.id,
            pressurePerTurn: assessment.pressurePerTurn,
            expectedDamage,
            currentHp: enemy.currHp,
            progressFraction,
            contribution: assessment.pressurePerTurn * progressFraction,
            quietTurnProbability: assessment.quietTurnProbability,
            characters: assessment.characters,
        }];
    });
    return {
        enemies,
        raw: enemies.reduce((total, enemy) => total + enemy.contribution, 0),
    };
}

function rainmakerPressureAgainstCharacter(
    context: PolicyContext,
    character: Character,
    current: ReturnType<typeof currentBindingBoard>,
    baselineDebt: number,
): SustainedPressureCharacterBreakdown {
    const defense = character.modifiers.defense ?? 0;
    const bandProbabilities = rainmakerBandProbabilities(defense);
    let pressurePerTurn = 0;

    for (const band of ["graze", "hit", "crit"] as const) {
        const probability = bandProbabilities[band] / 100;
        const trackCount = RAINMAKER_TRACKS_BY_BAND[band];
        let placementPressure = 0;

        for (let start = 0; start < RAINMAKER_TRACKS.length; start += 1) {
            const projected = cloneBindingBoard(current);
            for (let offset = 0; offset < trackCount; offset += 1) {
                addBinding(
                    projected,
                    character.id,
                    RAINMAKER_TRACKS[(start + offset) % RAINMAKER_TRACKS.length],
                    RAINMAKER_BINDING_AMOUNT,
                    context.thresholds.max,
                );
            }
            placementPressure += Math.max(
                0,
                totalRecoveryDebt(projected, context.thresholds) - baselineDebt,
            );
        }

        pressurePerTurn += probability
            * placementPressure / RAINMAKER_TRACKS.length;
    }

    return {
        characterId: character.id,
        defense,
        bandProbabilities,
        pressurePerTurn,
    };
}

/** Narrow copy of the public accuracy reshaping used by an enemy with no Hit modifier. */
export function rainmakerBandProbabilities(
    characterDefense: number,
): RainmakerBandProbabilities {
    const delta = -characterDefense * DEFENSE_MODIFIER;
    const baseCrit = RAINMAKER_ACCURACY.crit;
    const baseFullHit = RAINMAKER_ACCURACY.hit + baseCrit;
    const baseContact = RAINMAKER_ACCURACY.graze + baseFullHit;

    const crit = clamp(baseCrit + Math.min(delta, 0) * 0.1, 0, 100);
    const fullHit = Math.max(
        crit,
        clamp(baseFullHit + delta, 0, 100),
    );
    const contact = Math.max(
        fullHit,
        clamp(baseContact + delta * 0.5, 0, 100),
    );

    return {
        miss: 100 - contact,
        graze: contact - fullHit,
        hit: fullHit - crit,
        crit,
    };
}

function isRainmaker(enemy: Enemy): boolean {
    return enemy.id === "rainmaker" || /^rainmaker\d+$/.test(enemy.id);
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}
