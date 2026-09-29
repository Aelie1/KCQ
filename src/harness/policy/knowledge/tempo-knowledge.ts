import type { Enemy, EntityId } from "../../../engine/public/types";
import type { PolicyContext } from "../../harness";
import { firstKnownBindingApplication, type SmartCandidate } from "../smart";
import {
    addBinding,
    applyBindingEffects,
    cloneBindingBoard,
    currentBindingBoard,
    totalRecoveryDebt,
} from "../smart-bindings";
import type { SmartBoardAssessment, SmartEnemyAssessment } from "../smart-board";
import type { KitKnowledgeRuleDiagnostic } from "./kit-knowledge";

export const TEMPO_KNOWLEDGE_WEIGHT = 1;
export const BREATHING_ROOM_RECOVERY_VALUE = 1;
export const PRESSURE_REMOVAL_VALUE = 2;
export const QUEEN_PHASE_PUSH_PENALTY = 180;
export const QUEEN_ADD_CLEAR_PENALTY = 1_000;

const ENEMY_QUIET_PRESSURE = 35;
const ENEMY_HIGH_PRESSURE = 100;
const PARTY_QUIET_PRESSURE = 50;
const PARTY_HIGH_PRESSURE = 300;
const COMMITTED_DEBT_PRESSURE_SCALE = 0.25;
const MAX_COMMITTED_DEBT_PRESSURE = 60;
const INTENTION_PRESSURE = 8;
const TARGETED_CHARACTER_PRESSURE = 2;
const LINKED_CAPTOR_PRESSURE = 12;
const UNKNOWN_BINDING_PRESSURE = 4;
export const TRAP_PRESSURE_SCALE = 0.25;
const QUEEN_REINFORCEMENT_RATIOS = [0.8, 2 / 3, 0.6, 0.4, 1 / 3, 0.2] as const;

export interface EnemyPressureBreakdown {
    readonly enemyId: EntityId;
    readonly rank: Enemy["rank"];
    readonly baselinePressure: number;
    readonly intentionPressure: number;
    readonly committedBindingPressure: number;
    readonly targetingPressure: number;
    readonly linkedCaptorPressure: number;
    readonly unknownBindingPressure: number;
    readonly trapPressure: number;
    readonly total: number;
}

export interface SmartPressureAssessment {
    readonly currentPartyPressure: number;
    readonly projectedPartyPressure: number;
    readonly enemyPressure: number;
    readonly enemies: readonly EnemyPressureBreakdown[];
}

export interface TempoKnowledgeBreakdown {
    readonly pressure: SmartPressureAssessment;
    readonly rules: readonly KitKnowledgeRuleDiagnostic[];
    readonly raw: number;
}

/** Public, inspectable approximation of current party and enemy-board pressure. */
export function assessSmartPressure(
    context: PolicyContext,
    board: SmartBoardAssessment,
): SmartPressureAssessment {
    const current = currentBindingBoard(context.state.characters);
    const currentPartyPressure = totalRecoveryDebt(current, context.thresholds);
    const projected = cloneBindingBoard(current);
    for (const character of board.characters) {
        for (const binding of character.incomingBindings) {
            addBinding(
                projected,
                character.id,
                binding.bindingId,
                binding.known,
                context.thresholds.max,
            );
        }
    }
    const projectedPartyPressure = totalRecoveryDebt(projected, context.thresholds);
    const assessments = new Map(board.enemies.map((enemy) => [enemy.id, enemy] as const));
    const characterIds = new Set(context.state.characters.map(({ id }) => id));
    const enemies = context.state.enemies.flatMap((enemy) => {
        if (enemy.currHp <= 0) return [];
        const assessment = assessments.get(enemy.id);
        if (assessment === undefined) return [];
        return [enemyPressureBreakdown(
            context,
            enemy,
            assessment,
            currentPartyPressure,
            current,
            characterIds,
        )];
    });
    return {
        currentPartyPressure,
        projectedPartyPressure,
        enemyPressure: enemies.reduce((total, enemy) => total + enemy.total, 0),
        enemies,
    };
}

export function evaluateTempoKnowledge(
    context: PolicyContext,
    board: SmartBoardAssessment,
    candidate: SmartCandidate,
    pressure: SmartPressureAssessment = assessSmartPressure(context, board),
): TempoKnowledgeBreakdown {
    const rules: KitKnowledgeRuleDiagnostic[] = [];
    const recoveryGain = candidateRecoveryGain(context, candidate, pressure.currentPartyPressure);
    const partyNeed = scaleAboveQuiet(
        pressure.currentPartyPressure,
        PARTY_QUIET_PRESSURE,
        PARTY_HIGH_PRESSURE,
    );
    const breathingRoom = 1 - scaleAboveQuiet(
        pressure.enemyPressure,
        ENEMY_QUIET_PRESSURE,
        ENEMY_HIGH_PRESSURE,
    );
    if (recoveryGain > 0 && partyNeed > 0 && breathingRoom > 0) {
        const adjustment = recoveryGain * partyNeed * breathingRoom
            * BREATHING_ROOM_RECOVERY_VALUE;
        rules.push({
            id: "tempo.breathing-room-recovery",
            adjustment,
            reason: "A quiet enemy board makes current party recovery debt safer to repair.",
        });
    }

    const boardDanger = clamp(pressure.enemyPressure / ENEMY_HIGH_PRESSURE, 0, 1);
    if (boardDanger > 0) {
        let removedPressure = 0;
        for (const enemy of context.state.enemies) {
            if (enemy.currHp <= 0) continue;
            if (expectedDamageToEnemy(candidate, enemy.id) < enemy.currHp) continue;
            removedPressure += pressure.enemies.find(({ enemyId }) => enemyId === enemy.id)?.total ?? 0;
        }
        if (removedPressure > 0) {
            rules.push({
                id: "tempo.remove-enemy-pressure",
                adjustment: removedPressure * boardDanger * PRESSURE_REMOVAL_VALUE,
                reason: "An expected defeat removes active enemy-board pressure.",
            });
        }
    }

    const queenPush = queenPhasePush(context, candidate);
    if (!queenPush.expectedLethal && queenPush.crossings > 0) {
        const partyRisk = scaleAboveQuiet(
            pressure.currentPartyPressure,
            PARTY_QUIET_PRESSURE,
            PARTY_HIGH_PRESSURE,
        );
        const enemyRisk = scaleAboveQuiet(
            pressure.enemyPressure,
            ENEMY_QUIET_PRESSURE,
            ENEMY_HIGH_PRESSURE,
        );
        const readinessRisk = Math.max(partyRisk, enemyRisk);
        if (readinessRisk > 0) {
            rules.push({
                id: "tempo.queen-phase-push",
                adjustment: -queenPush.crossings * readinessRisk * QUEEN_PHASE_PUSH_PENALTY,
                reason: `Expected damage crosses ${queenPush.crossings} Queen reinforcement threshold(s) before the board is ready.`,
            });
        }
    }

    rules.push(...queenAddClearRules(context, candidate));

    return {
        pressure,
        rules,
        raw: rules.reduce((total, rule) => total + rule.adjustment, 0),
    };
}

interface QueenAddClearDetails {
    readonly queenId: EntityId;
    readonly queenHp: number;
    readonly queenMaxHp: number;
    readonly livingAddCount: number;
    readonly remainingReinforcementThresholds: readonly number[];
    readonly expectedLethalBypassed: boolean;
    readonly adjustment: number;
}

function queenAddClearRules(
    context: PolicyContext,
    candidate: SmartCandidate,
): KitKnowledgeRuleDiagnostic[] {
    const livingEnemies = context.state.enemies.filter(({ currHp }) => currHp > 0);
    const rules: KitKnowledgeRuleDiagnostic[] = [];
    for (const queen of livingEnemies.filter(({ id }) => isQueenId(id))) {
        const expectedDamage = expectedDamageToEnemy(candidate, queen.id);
        if (expectedDamage <= 0) continue;

        const livingAddCount = livingEnemies.filter(({ id }) => id !== queen.id).length;
        const remainingReinforcementThresholds = QUEEN_REINFORCEMENT_RATIOS
            .map((ratio) => queen.maxHp * ratio)
            .filter((threshold) => queen.currHp > threshold);
        if (livingAddCount === 0 || remainingReinforcementThresholds.length === 0) continue;

        const expectedLethalBypassed = expectedDamage >= queen.currHp;
        const adjustment = expectedLethalBypassed ? 0 : -QUEEN_ADD_CLEAR_PENALTY;
        rules.push({
            id: "tempo.queen-clear-adds",
            adjustment,
            reason: expectedLethalBypassed
                ? "Expected lethal Queen damage bypasses the add-clear reserve."
                : "Clear living adds before damaging the Queen while a reinforcement threshold remains.",
            details: {
                queenId: queen.id,
                queenHp: queen.currHp,
                queenMaxHp: queen.maxHp,
                livingAddCount,
                remainingReinforcementThresholds,
                expectedLethalBypassed,
                adjustment,
            } satisfies QueenAddClearDetails,
        });
    }
    return rules;
}

function enemyPressureBreakdown(
    context: PolicyContext,
    enemy: Enemy,
    assessment: SmartEnemyAssessment,
    currentPartyPressure: number,
    current: ReturnType<typeof currentBindingBoard>,
    characterIds: ReadonlySet<EntityId>,
): EnemyPressureBreakdown {
    const baselinePressure = enemy.rank === "minion" ? 6 : enemy.rank === "boss" ? 8 : 10;
    const intentionPressure = enemy.intentions.length * INTENTION_PRESSURE;
    const projected = cloneBindingBoard(current);
    for (const target of assessment.bindingTargets) {
        for (const binding of target.bindings) {
            addBinding(
                projected,
                target.characterId,
                binding.bindingId,
                binding.known,
                context.thresholds.max,
            );
        }
    }
    const committedDebt = Math.max(
        0,
        totalRecoveryDebt(projected, context.thresholds) - currentPartyPressure,
    );
    const committedBindingPressure = Math.min(
        MAX_COMMITTED_DEBT_PRESSURE,
        committedDebt * COMMITTED_DEBT_PRESSURE_SCALE,
    );
    const targetingPressure = assessment.targetedCharacterIds.length
        * TARGETED_CHARACTER_PRESSURE;
    const linkedCaptorPressure = enemy.buffs.filter(({ linkedEntity }) =>
        linkedEntity !== undefined && characterIds.has(linkedEntity)
    ).length * LINKED_CAPTOR_PRESSURE;
    const unknownBindingPressure = assessment.unknownIncomingBindingEffects
        * UNKNOWN_BINDING_PRESSURE;
    const trapPressure = assessment.totalIncomingTrapAmount * TRAP_PRESSURE_SCALE;
    const total = baselinePressure + intentionPressure + committedBindingPressure
        + targetingPressure + linkedCaptorPressure + unknownBindingPressure + trapPressure;
    return {
        enemyId: enemy.id,
        rank: enemy.rank,
        baselinePressure,
        intentionPressure,
        committedBindingPressure,
        targetingPressure,
        linkedCaptorPressure,
        unknownBindingPressure,
        trapPressure,
        total,
    };
}

function candidateRecoveryGain(
    context: PolicyContext,
    candidate: SmartCandidate,
    currentPartyPressure: number,
): number {
    const characterIds = new Set(context.state.characters.map(({ id }) => id));
    const projected = currentBindingBoard(context.state.characters);
    applyBindingEffects(projected, candidate.effects, characterIds, context.thresholds.max);
    for (const target of candidate.targets) {
        for (let hit = 0; hit < candidate.hits; hit += 1) {
            applyBindingEffects(projected, target.effects, characterIds, context.thresholds.max);
        }
    }
    return Math.max(
        0,
        currentPartyPressure - totalRecoveryDebt(projected, context.thresholds),
    );
}

function expectedQueenDamage(
    context: PolicyContext,
    candidate: SmartCandidate,
    queenId: EntityId,
): number {
    let damage = expectedDamageToEnemy(candidate, queenId);

    if (
        candidate.action.type !== "move"
        || candidate.action.actor !== "ko"
        || (candidate.action.move !== "reflect"
            && candidate.action.move !== "fairyReflect")
    ) {
        return damage;
    }

    const application = firstKnownBindingApplication(context, "ko");
    if (application?.enemyId === queenId) {
        damage += application.amount;
    }

    return damage;
}


function queenPhasePush(
    context: PolicyContext,
    candidate: SmartCandidate,
): { crossings: number; expectedLethal: boolean } {
    let crossings = 0;
    let expectedLethal = false;
    for (const enemy of context.state.enemies) {
        if (enemy.currHp <= 0 || !isQueenId(enemy.id)) continue;
        const damage = expectedQueenDamage(context, candidate, enemy.id);
        if (damage <= 0) continue;
        const projectedHp = Math.max(0, enemy.currHp - damage);
        if (projectedHp === 0) {
            expectedLethal = true;
            continue;
        }
        for (const ratio of QUEEN_REINFORCEMENT_RATIOS) {
            const threshold = enemy.maxHp * ratio;
            if (enemy.currHp > threshold && projectedHp <= threshold) crossings += 1;
        }
    }
    return { crossings, expectedLethal };
}

export function expectedDamageToEnemy(
    candidate: SmartCandidate,
    enemyId: EntityId,
): number {
    let total = damageEffectsToEnemy(candidate.effects, enemyId);
    for (const target of candidate.targets) {
        let perHit = damageEffectsToEnemy(target.effects, enemyId);
        if (target.target === enemyId) {
            for (const band of Object.values(target.damage ?? {})) {
                if (band !== undefined) {
                    perHit += (band.chance / 100) * ((band.min + band.max) / 2);
                }
            }
        }
        total += perHit * candidate.hits;
    }
    return total;
}

function damageEffectsToEnemy(
    effects: SmartCandidate["effects"],
    enemyId: EntityId,
): number {
    let total = 0;
    for (const effect of effects) {
        if (effect.type === "damage" && effect.target === enemyId) total += effect.amount;
    }
    return total;
}

function isQueenId(id: EntityId): boolean {
    return id === "queen" || /^queen\d+$/.test(id);
}

function scaleAboveQuiet(value: number, quiet: number, high: number): number {
    return clamp((value - quiet) / (high - quiet), 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}
