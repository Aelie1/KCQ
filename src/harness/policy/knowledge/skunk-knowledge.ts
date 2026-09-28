import type { AccuracyProfile, EntityId, ValidTarget } from "../../../engine/public/types";
import type { PolicyContext } from "../../harness";
import type { SmartCandidate } from "../smart";
import type { KitKnowledgeRuleDiagnostic } from "./kit-knowledge";

export const POUNCE_REMOVAL_VALUE = 25;
export const POUNCE_CLEAR_BONUS = 40;
export const THROW_OFF_SEVERITY_VALUE = 20;
export const THROW_OFF_LOW_RESERVE_PENALTY = -80;
export const THROW_OFF_MODERATE_RESERVE_PENALTY = -70;
export const THROW_OFF_HIGH_RESERVE_PENALTY = -30;

const POUNCE = "pounce";
const THROW_OFF = "throwOff";

export interface PounceRelationship {
    readonly characterId: EntityId;
    readonly enemyId: EntityId;
    readonly level: number;
}

/** Reads the linked public Pounce buffs and the source-side hit modifier. */
export function detectPounceRelationships(context: PolicyContext): PounceRelationship[] {
    const relationships: PounceRelationship[] = [];
    for (const character of context.state.characters) {
        for (const buff of character.buffs) {
            if (buff.id !== POUNCE || buff.linkedEntity === undefined) continue;
            const enemy = context.state.enemies.find(({ id, currHp }) =>
                id === buff.linkedEntity && currHp > 0
            );
            const sourceBuff = enemy?.buffs.find((value) =>
                value.id === POUNCE && value.linkedEntity === character.id
            );
            const hitValue = sourceBuff?.modifiers?.hit;
            if (enemy === undefined || hitValue === undefined || hitValue <= 0) continue;
            relationships.push({
                characterId: character.id,
                enemyId: enemy.id,
                level: hitValue / 2,
            });
        }
    }
    return relationships;
}

export function evaluateSkunkKnowledge(
    context: PolicyContext,
    candidate: SmartCandidate,
): KitKnowledgeRuleDiagnostic[] {
    const relationships = detectPounceRelationships(context);
    if (relationships.length === 0 || candidate.action.type !== "move") return [];
    const action = candidate.action;

    const rules: KitKnowledgeRuleDiagnostic[] = [];
    let totalRemoval = 0;
    let clearedRelationships = 0;
    for (const relationship of relationships) {
        const target = candidate.targets.find(({ target }) => target === relationship.enemyId);
        if (target === undefined || !candidateDamagesEnemy(candidate, target, relationship.enemyId)) {
            continue;
        }
        const expectedSuccessfulHits = candidate.hits * nonMissProbability(target.accuracy, target);
        const expectedRemoval = Math.min(relationship.level, expectedSuccessfulHits);
        if (expectedRemoval <= 0) continue;
        totalRemoval += expectedRemoval;
        if (expectedSuccessfulHits >= relationship.level) clearedRelationships += 1;
    }

    if (totalRemoval > 0) {
        rules.push({
            id: "skunk.pounce-source-removal",
            adjustment: totalRemoval * POUNCE_REMOVAL_VALUE,
            reason: `Expected damaging hits remove ${format(totalRemoval)} Pounce level(s) from linked source(s).`,
        });
    }
    if (clearedRelationships > 0) {
        rules.push({
            id: "skunk.pounce-clear",
            adjustment: clearedRelationships * POUNCE_CLEAR_BONUS,
            reason: `Expected successful hits can clear ${clearedRelationships} active Pounce relationship(s).`,
        });
    }

    if (action.move === THROW_OFF) {
        const relationship = relationships.find(({ characterId }) =>
            characterId === action.actor
        );
        if (relationship !== undefined) {
            const bestAttackRemoval = bestAvailableSourceAttackRemoval(context, relationship);
            const practicalThreshold = Math.min(relationship.level, 1.5);
            const practicalSourceAttack = bestAttackRemoval >= practicalThreshold;
            const reservePenalty = practicalSourceAttack
                ? throwOffReservePenalty(relationship.level)
                : 0;
            rules.push({
                id: "skunk.throw-off-severity",
                adjustment: relationship.level * THROW_OFF_SEVERITY_VALUE,
                reason: `Throw Off becomes more acceptable at Pounce level ${format(relationship.level)}.`,
            });
            if (reservePenalty !== 0) {
                rules.push({
                    id: "skunk.throw-off-reserve",
                    adjustment: reservePenalty,
                    reason: `A practical source attack can remove ${format(bestAttackRemoval)} expected Pounce level(s).`,
                });
            }
        }
    }

    return rules;
}

function bestAvailableSourceAttackRemoval(
    context: PolicyContext,
    relationship: PounceRelationship,
): number {
    let best = 0;
    for (const action of context.actions) {
        if (!action.available) continue;
        for (const info of action.moves) {
            if (!info.available) continue;
            const target = info.targets.find((value): value is ValidTarget =>
                value.valid && value.target === relationship.enemyId
            );
            if (target === undefined || !previewHasDamage(target, relationship.enemyId)) continue;
            const hits = info.move.hits ?? 1;
            best = Math.max(
                best,
                Math.min(
                    relationship.level,
                    hits * nonMissProbability(target.accuracy, target),
                ),
            );
        }
    }
    return best;
}

function candidateDamagesEnemy(
    candidate: SmartCandidate,
    target: ValidTarget,
    enemyId: EntityId,
): boolean {
    if (previewHasDamage(target, enemyId)) return true;
    return candidate.effects.some((effect) =>
        effect.type === "damage" && effect.target === enemyId && effect.amount > 0
    );
}

function previewHasDamage(target: ValidTarget, enemyId: EntityId): boolean {
    if (target.target !== enemyId) return false;
    if (Object.values(target.damage ?? {}).some((band) =>
        band !== undefined && band.chance > 0 && band.max > 0
    )) return true;
    return target.effects.some((effect) =>
        effect.type === "damage" && effect.target === enemyId && effect.amount > 0
    );
}

function nonMissProbability(
    accuracy: AccuracyProfile | undefined,
    target: ValidTarget,
): number {
    if (accuracy !== undefined) {
        return clamp(
            ((accuracy.graze ?? 0) + (accuracy.hit ?? 0) + (accuracy.crit ?? 0)) / 100,
            0,
            1,
        );
    }
    return clamp(
        Object.entries(target.damage ?? {}).reduce(
            (total, [band, value]) => total
                + (band !== "miss" && value !== undefined && value.max > 0 ? value.chance : 0),
            0,
        ) / 100,
        0,
        1,
    );
}

function throwOffReservePenalty(level: number): number {
    if (level < 2) return THROW_OFF_LOW_RESERVE_PENALTY;
    if (level < 3) return THROW_OFF_MODERATE_RESERVE_PENALTY;
    if (level < 4) return THROW_OFF_HIGH_RESERVE_PENALTY;
    return 0;
}

function format(value: number): string {
    return Number(value.toFixed(2)).toString();
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}
