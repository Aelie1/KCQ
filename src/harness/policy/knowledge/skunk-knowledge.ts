import type {
    AccuracyProfile,
    BindingId,
    Character,
    EntityId,
    HitBand,
    Intention,
    ValidTarget,
} from "../../../engine/public/types";
import type { PolicyContext } from "../../harness";
import type { SmartCandidate } from "../smart";
import {
    addBinding,
    applyBindingEffects,
    bindingValue,
    cloneBindingBoard,
    currentBindingBoard,
    totalRecoveryDebt,
} from "../smart-bindings";
import type { KitKnowledgeRuleDiagnostic } from "./kit-knowledge";

export const POUNCE_REMOVAL_VALUE = 25;
export const POUNCE_CLEAR_BONUS = 40;
export const DIRECT_POUNCE_ATTENTION_FULL_LEVEL = 4;
export const DIRECT_POUNCE_ATTENTION_START_LEVEL = 2;
export const THROW_OFF_SEVERITY_VALUE = 20;
export const THROW_OFF_LOW_RESERVE_PENALTY = -80;
export const THROW_OFF_MODERATE_RESERVE_PENALTY = -70;
export const THROW_OFF_HIGH_RESERVE_PENALTY = -30;
export const FAIRY_COMMITTED_HEAL_MULTIPLIER = 1.5;
export const BARRIER_WAITING_PENALTY = 15;
export const SKUNK_REGENERATION_EXPOSURE_WEIGHT = 1;
export const PUDDLE_CREATION_STOCK_CUTOFF = 75;
export const PUDDLE_CREATION_PROBABILITY_DENOMINATOR = 100;
export const PUDDLE_CREATION_MAX_PROBABILITY = 0.75;

const POUNCE = "pounce";
const THROW_OFF = "throwOff";
const HEALING_MAGIC = "healingMagic";
const BARRIER_MAGIC = "barrierMagic";
const LATEX_EXPLOSION = "latexExplosion";
const LATEX_PUDDLE = "latexPuddle";
const TRAP_PUDDLE = "trapPuddle";
const FAIRY_HEAL_RATIO = 0.25;
const SKUNK_EXPLOSION_RATIO = 0.2;
const MIN_EXPLOSION_CLEANUP_ACTORS = 2;
const FAIRY_PATTERN = /^fairy(?:\d+)?$/;
const SKUNK_PATTERN = /^skunk(?:\d+)?$/;
const SKUNKETTE_PATTERN = /^skunkette(?:\d+|[A-Z].*)?$/;
const REGENERABLE_LATEX_BINDINGS = new Set<BindingId>([
    "latexHead",
    "latexArms",
    "latexTorso",
    "latexLegs",
]);

export interface RegenerationBindingLiability {
    readonly bindingId: BindingId;
    readonly current: number;
    readonly peak: number;
    readonly recoverableGap: number;
}

export interface RegenerationCharacterLiability {
    readonly characterId: EntityId;
    readonly liability: number;
    readonly bindings: readonly RegenerationBindingLiability[];
}

export interface RegenerationSkunkProgress {
    readonly enemyId: EntityId;
    readonly currentHp: number;
    readonly expectedDamage: number;
    readonly progressFraction: number;
    readonly contribution: number;
}

export interface SkunkRegenerationKnowledgeBreakdown {
    readonly characterLiabilitiesBefore: readonly RegenerationCharacterLiability[];
    readonly characterLiabilitiesAfter: readonly RegenerationCharacterLiability[];
    readonly beforeExposure: number;
    readonly afterExposure: number;
    readonly livingSkunkCount: number;
    readonly recoveryAdjustment: number;
    readonly skunks: readonly RegenerationSkunkProgress[];
    readonly offensiveAdjustment: number;
    readonly rawAdjustment: number;
}

export interface FuturePuddleSkunkProgress {
    readonly enemyId: EntityId;
    readonly currentHp: number;
    readonly expectedDamage: number;
    readonly progressFraction: number;
    readonly contribution: number;
}

export interface FuturePuddlePressureBreakdown {
    readonly puddleAmount: number;
    readonly creationProbability: number;
    readonly livingSkunkCount: number;
    readonly puddleBaseAmount: number;
    readonly pressurePerSkunk: number;
    readonly totalProducerPressure: number;
    readonly skunks: readonly FuturePuddleSkunkProgress[];
    readonly contribution: number;
    readonly rawAdjustment: number;
}

interface AttackState {
    readonly barrier: number;
    readonly damage: number;
    readonly probability: number;
    readonly blockedHits: number;
}

interface AttackProjection {
    readonly rawExpectedDamage: number;
    readonly postBarrierExpectedDamage: number;
    readonly expectedBlockedHits: number;
    readonly lethalProbability: number;
    readonly states: readonly AttackState[];
}

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
    const rules: KitKnowledgeRuleDiagnostic[] = [
        //...evaluateRegenerationLiabilityRules(context, candidate),
        //...evaluateFuturePuddleRules(context, candidate),
        ...evaluateFairyHealingKnowledge(context, candidate),
        ...evaluateBarrierKnowledge(context, candidate),
        ...evaluateExplosionKnowledge(context, candidate),
    ];
    const relationships = detectPounceRelationships(context);
    if (relationships.length === 0 || candidate.action.type !== "move") return rules;
    const action = candidate.action;

    let totalRemoval = 0;
    let removalAdjustment = 0;
    let clearedRelationships = 0;
    let clearAdjustment = 0;
    const opportunities: Array<{
        characterId: EntityId;
        enemyId: EntityId;
        level: number;
        expectedRemoval: number;
        incidental: boolean;
        attentionScale: number;
    }> = [];
    for (const relationship of relationships) {
        const target = candidate.targets.find(({ target }) => target === relationship.enemyId);
        if (target === undefined || !candidateDamagesEnemy(candidate, target, relationship.enemyId)) {
            continue;
        }
        const expectedSuccessfulHits = candidate.hits * nonMissProbability(target.accuracy, target);
        const expectedRemoval = Math.min(relationship.level, expectedSuccessfulHits);
        if (expectedRemoval <= 0) continue;
        const incidental = context.state.enemies.some(({ id, currHp }) =>
            currHp > 0
            && id !== relationship.enemyId
            && expectedDamageToEnemy(candidate, id) > 0
        );
        const attentionScale = 1;
        totalRemoval += expectedRemoval;
        removalAdjustment += expectedRemoval * POUNCE_REMOVAL_VALUE * attentionScale;
        const clears = expectedSuccessfulHits >= relationship.level;
        if (clears) {
            clearedRelationships += 1;
            clearAdjustment += POUNCE_CLEAR_BONUS * attentionScale;
        }
        opportunities.push({
            characterId: relationship.characterId,
            enemyId: relationship.enemyId,
            level: relationship.level,
            expectedRemoval,
            incidental,
            attentionScale,
        });
    }

    if (totalRemoval > 0) {
        rules.push({
            id: "skunk.pounce-source-removal",
            adjustment: removalAdjustment,
            reason: `Expected damaging hits remove ${format(totalRemoval)} Pounce level(s) from linked source(s).`,
            details: { opportunities },
        });
    }
    if (clearedRelationships > 0) {
        rules.push({
            id: "skunk.pounce-clear",
            adjustment: clearAdjustment,
            reason: `Expected successful hits can clear ${clearedRelationships} active Pounce relationship(s).`,
            details: { opportunities },
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

/** Models only the extra consequence created by Skunk Latex Regeneration. */
export function evaluateSkunkRegenerationLiability(
    context: PolicyContext,
    candidate: SmartCandidate,
): SkunkRegenerationKnowledgeBreakdown {
    const livingSkunks = context.state.enemies.filter((enemy) =>
        enemy.currHp > 0 && isSkunk(enemy.id)
    );
    const current = currentBindingBoard(context.state.characters);
    const projected = cloneBindingBoard(current);
    const characterIds = new Set(context.state.characters.map(({ id }) => id));
    applyCandidateBindingEffects(
        projected,
        candidate,
        characterIds,
        context.thresholds.max,
    );

    const characterLiabilitiesBefore = regenerationCharacterLiabilities(
        context.state.characters,
        current,
    );
    const characterLiabilitiesAfter = regenerationCharacterLiabilities(
        context.state.characters,
        projected,
    );
    const beforeExposure = maximumLiability(characterLiabilitiesBefore);
    const afterExposure = maximumLiability(characterLiabilitiesAfter);

    const recoveryAdjustment = livingSkunks.length === 0
        ? 0
        : characterLiabilitiesBefore.reduce(
            (total, character) => total + character.bindings.reduce(
                (characterTotal, binding) => {
                    // Only reward finishing a track that already had
                    // Regeneration exposure before this action.
                    if (binding.recoverableGap <= 0) return characterTotal;

                    const afterValue = bindingValue(
                        projected,
                        character.characterId,
                        binding.bindingId,
                    );

                    if (afterValue > 0) return characterTotal;

                    return characterTotal
                        + binding.recoverableGap * SKUNK_REGENERATION_EXPOSURE_WEIGHT;
                },
                0,
            ),
            0,
        );
    const skunks = livingSkunks.map((enemy) => {
        const expectedDamage = expectedDamageToEnemy(candidate, enemy.id);
        const progressFraction = clamp(expectedDamage / enemy.currHp, 0, 1);
        return {
            enemyId: enemy.id,
            currentHp: enemy.currHp,
            expectedDamage,
            progressFraction,
            contribution: beforeExposure * progressFraction
                * SKUNK_REGENERATION_EXPOSURE_WEIGHT,
        };
    });
    const offensiveAdjustment = skunks.reduce(
        (total, skunk) => total + skunk.contribution,
        0,
    );
    return {
        characterLiabilitiesBefore,
        characterLiabilitiesAfter,
        beforeExposure,
        afterExposure,
        livingSkunkCount: livingSkunks.length,
        recoveryAdjustment,
        skunks,
        offensiveAdjustment,
        rawAdjustment: recoveryAdjustment + offensiveAdjustment,
    };
}

/** Models removal progress against living future puddle producers. */
export function evaluateFuturePuddlePressure(
    context: PolicyContext,
    candidate: SmartCandidate,
): FuturePuddlePressureBreakdown {
    const puddleAmount = Math.max(
        0,
        context.state.traps.find(({ id }) => id === TRAP_PUDDLE)?.amount ?? 0,
    );
    const creationProbability = clamp(
        (PUDDLE_CREATION_STOCK_CUTOFF - puddleAmount)
        / PUDDLE_CREATION_PROBABILITY_DENOMINATOR,
        0,
        PUDDLE_CREATION_MAX_PROBABILITY,
    );
    // The base amount is public content data. Accuracy-band effectiveness is
    // intentionally not reconstructed here, so this is a one-opportunity estimate.
    const puddleBaseAmount = Math.max(
        0,
        context.library.moves[LATEX_PUDDLE]?.baseDamage ?? 0,
    );
    const pressurePerSkunk = creationProbability * puddleBaseAmount;
    const livingSkunks = context.state.enemies.filter((enemy) =>
        enemy.currHp > 0 && isSkunk(enemy.id)
    );
    const skunks = livingSkunks.map((enemy) => {
        const expectedDamage = expectedDamageToEnemy(candidate, enemy.id);
        const progressFraction = clamp(expectedDamage / enemy.currHp, 0, 1);
        return {
            enemyId: enemy.id,
            currentHp: enemy.currHp,
            expectedDamage,
            progressFraction,
            contribution: pressurePerSkunk * progressFraction,
        };
    });
    const contribution = skunks.reduce(
        (total, skunk) => total + skunk.contribution,
        0,
    );
    return {
        puddleAmount,
        creationProbability,
        livingSkunkCount: livingSkunks.length,
        puddleBaseAmount,
        pressurePerSkunk,
        totalProducerPressure: pressurePerSkunk * livingSkunks.length,
        skunks,
        contribution,
        rawAdjustment: contribution,
    };
}

function evaluateRegenerationLiabilityRules(
    context: PolicyContext,
    candidate: SmartCandidate,
): KitKnowledgeRuleDiagnostic[] {
    const details = evaluateSkunkRegenerationLiability(context, candidate);
    if (details.livingSkunkCount === 0) return [];

    const rules: KitKnowledgeRuleDiagnostic[] = [];
    if (details.recoveryAdjustment > 0) {
        rules.push({
            id: "skunk.regeneration-track-clear",
            adjustment: details.recoveryAdjustment,
            reason: `Candidate completely clears an already-exposed Latex track while ${details.livingSkunkCount} Skunk(s) remain alive.`,
            details: {
                characterLiabilitiesBefore: details.characterLiabilitiesBefore,
                characterLiabilitiesAfter: details.characterLiabilitiesAfter,
                beforeExposure: details.beforeExposure,
                afterExposure: details.afterExposure,
                livingSkunkCount: details.livingSkunkCount,
                rawAdjustment: details.recoveryAdjustment,
            },
        });
    }
    if (details.offensiveAdjustment > 0) {
        rules.push({
            id: "skunk.regeneration-source-progress",
            adjustment: details.offensiveAdjustment,
            reason: `Expected damage makes ${format(details.offensiveAdjustment)} progress against active Regeneration exposure.`,
            details: {
                characterLiabilities: details.characterLiabilitiesBefore,
                selectedExposure: details.beforeExposure,
                livingSkunkCount: details.livingSkunkCount,
                skunks: details.skunks,
                rawAdjustment: details.offensiveAdjustment,
            },
        });
    }
    return rules;
}

function evaluateFuturePuddleRules(
    context: PolicyContext,
    candidate: SmartCandidate,
): KitKnowledgeRuleDiagnostic[] {
    const details = evaluateFuturePuddlePressure(context, candidate);
    if (details.contribution <= 0) return [];
    return [{
        id: "skunk.future-puddle-source-progress",
        adjustment: details.contribution,
        reason: `Expected Skunk damage removes ${format(details.contribution)} future puddle-production pressure.`,
        details,
    }];
}

function regenerationCharacterLiabilities(
    characters: readonly Character[],
    board: ReturnType<typeof currentBindingBoard>,
): RegenerationCharacterLiability[] {
    return characters.map((character) => {
        const bindings = character.bindings.flatMap((binding) => {
            if (!REGENERABLE_LATEX_BINDINGS.has(binding.id)) return [];
            const current = bindingValue(board, character.id, binding.id);
            const peak = binding.data.peak;
            if (current <= 0 || !Number.isFinite(peak)) return [];
            const recoverableGap = Math.max(0, peak - current);
            return [{ bindingId: binding.id, current, peak, recoverableGap }];
        });
        return {
            characterId: character.id,
            liability: bindings.reduce(
                (total, binding) => total + binding.recoverableGap,
                0,
            ),
            bindings,
        };
    });
}

function maximumLiability(
    characters: readonly RegenerationCharacterLiability[],
): number {
    return characters.reduce(
        (maximum, character) => Math.max(maximum, character.liability),
        0,
    );
}

function applyCandidateBindingEffects(
    projected: ReturnType<typeof currentBindingBoard>,
    candidate: SmartCandidate,
    characterIds: ReadonlySet<EntityId>,
    maximum: number,
): void {
    applyBindingEffects(projected, candidate.effects, characterIds, maximum);
    for (const target of candidate.targets) {
        for (let hit = 0; hit < candidate.hits; hit += 1) {
            applyBindingEffects(projected, target.effects, characterIds, maximum);
        }
    }
}

function evaluateFairyHealingKnowledge(
    context: PolicyContext,
    candidate: SmartCandidate,
): KitKnowledgeRuleDiagnostic[] {
    if (candidate.action.type !== "move") return [];
    const damagedHealableAllies = context.state.enemies.filter((enemy) =>
        isFairyHealTarget(enemy.id) && enemy.currHp > 0 && enemy.currHp < enemy.maxHp
    );
    const potentialHealing = damagedHealableAllies.reduce(
        (total, enemy) => total + Math.min(
            enemy.maxHp - enemy.currHp,
            enemy.maxHp * FAIRY_HEAL_RATIO,
        ),
        0,
    );
    const rules: KitKnowledgeRuleDiagnostic[] = [];
    const livingFairies = context.state.enemies.filter((enemy) =>
        isFairy(enemy.id) && enemy.currHp > 0
    );

    if (livingFairies.length > 0 && potentialHealing > 0) {
        const targets = damagedHealableAllies.flatMap((enemy) => {
            const expectedDamage = expectedDamageToEnemy(candidate, enemy.id);
            if (expectedDamage <= 0) return [];
            const investedDamage = enemy.maxHp - enemy.currHp;
            const healingExposure = Math.min(
                investedDamage,
                enemy.maxHp * FAIRY_HEAL_RATIO * livingFairies.length,
            );
            const completionProgress = clamp(expectedDamage / enemy.currHp, 0, 1);
            const contribution = healingExposure * completionProgress;
            return contribution > 0
                ? [{
                    enemyId: enemy.id,
                    investedDamage,
                    healingExposure,
                    expectedDamage,
                    completionProgress,
                    contribution,
                }]
                : [];
        });
        const adjustment = targets.reduce((total, target) => total + target.contribution, 0);
        if (adjustment > 0) {
            rules.push({
                id: "skunk.fairy-focus-continuity",
                adjustment,
                reason: "Preserve meaningful damage already invested in healable enemies while a Fairy can erase that progress.",
                details: {
                    fairyIds: livingFairies.map(({ id }) => id),
                    targets,
                },
            });
        }
    }

    for (const fairy of livingFairies) {
        const committed = fairy.intentions.filter(({ move }) => move === HEALING_MAGIC);
        const committedHealing = committed.reduce(
            (total, intention) => total + usefulCommittedHealing(context, intention),
            0,
        );
        const healingPressure = committed.length > 0
            ? committedHealing * FAIRY_COMMITTED_HEAL_MULTIPLIER
            : potentialHealing;
        if (healingPressure <= 0) continue;

        const damageToFairy = expectedDamageToEnemy(candidate, fairy.id);
        const fairyRemovalProgress = clamp(damageToFairy / fairy.currHp, 0, 1);
        let preventionFraction = fairyRemovalProgress;
        let invalidatedRecipient: EntityId | undefined;

        // Healing Magic returns before producing any primary or critical healing
        // when its selected target has disappeared from public state.
        for (const intention of committed) {
            const recipient = intention.targets[0]?.target;
            const target = context.state.enemies.find(({ id }) => id === recipient);
            if (target !== undefined
                && expectedDamageToEnemy(candidate, target.id) >= target.currHp) {
                preventionFraction = 1;
                invalidatedRecipient = target.id;
                break;
            }
        }

        if (preventionFraction <= 0) continue;
        const adjustment = healingPressure * preventionFraction;
        rules.push({
            id: committed.length > 0
                ? "skunk.fairy-committed-heal-prevention"
                : "skunk.fairy-healing-support",
            adjustment,
            reason: invalidatedRecipient !== undefined
                ? `Defeating intended recipient ${invalidatedRecipient} invalidates ${format(committedHealing)} useful committed healing.`
                : `${fairy.id} can provide ${format(healingPressure)} useful${committed.length > 0 ? " immediate" : ""} healing pressure.`,
            details: {
                fairyId: fairy.id,
                usefulHealing: committed.length > 0 ? committedHealing : potentialHealing,
                committed: committed.length > 0,
                fairyRemovalProgress,
                invalidatedRecipient,
            },
        });
    }
    return rules;
}

function evaluateBarrierKnowledge(
    context: PolicyContext,
    candidate: SmartCandidate,
): KitKnowledgeRuleDiagnostic[] {
    if (candidate.action.type !== "move") return [];
    const rules: KitKnowledgeRuleDiagnostic[] = [];
    for (const target of candidate.targets) {
        if (target.target === null) continue;
        const enemy = context.state.enemies.find(({ id }) => id === target.target);
        const duration = enemy?.buffs.find(({ id }) => id === BARRIER_MAGIC)?.duration ?? 0;
        if (enemy === undefined || duration <= 0) continue;

        const projection = projectAttack(candidate, target, duration, enemy.currHp);
        if (projection.rawExpectedDamage <= 0) continue;
        const rawFinisher = finisherValue(projection.rawExpectedDamage, enemy.currHp);
        const survivingFinisher = finisherValue(
            projection.postBarrierExpectedDamage,
            enemy.currHp,
        );
        const blockedFraction = clamp(
            1 - projection.postBarrierExpectedDamage / projection.rawExpectedDamage,
            0,
            1,
        );
        // Barrier naturally decays. Consuming it is not progress, and spending a
        // whole action mostly doing so carries a small waiting-opportunity cost.
        const waitingPenalty = BARRIER_WAITING_PENALTY * blockedFraction / duration;
        const adjustment = projection.postBarrierExpectedDamage
            - projection.rawExpectedDamage
            + survivingFinisher
            - rawFinisher
            - waitingPenalty;
        rules.push({
            id: "skunk.fairy-barrier-adjusted-offense",
            adjustment,
            reason: `${enemy.id} Barrier ${duration} blocks ${format(projection.expectedBlockedHits)} expected hit(s), leaving ${format(projection.postBarrierExpectedDamage)} expected offense after Barrier.`,
            details: {
                targetId: enemy.id,
                barrierDuration: duration,
                candidateHits: candidate.hits,
                expectedSuccessfulHits: formatNumber(candidate.hits * expectedSuccessfulHits(target)),
                expectedBlockedHits: formatNumber(projection.expectedBlockedHits),
                rawExpectedDamage: formatNumber(projection.rawExpectedDamage),
                postBarrierExpectedDamage: formatNumber(projection.postBarrierExpectedDamage),
                lethalProbability: formatNumber(projection.lethalProbability),
                waitingPenalty: formatNumber(waitingPenalty),
            },
        });
    }
    return rules;
}

function evaluateExplosionKnowledge(
    context: PolicyContext,
    candidate: SmartCandidate,
): KitKnowledgeRuleDiagnostic[] {
    if (candidate.action.type !== "move") return [];
    const rules: KitKnowledgeRuleDiagnostic[] = [];
    for (const target of candidate.targets) {
        if (target.target === null || !isSkunk(target.target)) continue;
        const enemy = context.state.enemies.find(({ id }) => id === target.target);
        if (enemy === undefined || enemy.currHp <= 0) continue;
        const barrierDuration = enemy.buffs.find(({ id }) => id === BARRIER_MAGIC)?.duration ?? 0;
        const projection = projectAttack(candidate, target, barrierDuration, enemy.currHp);
        if (projection.rawExpectedDamage <= 0) continue;

        const threshold = enemy.maxHp * SKUNK_EXPLOSION_RATIO;
        const alreadyLow = enemy.currHp < threshold;
        const lethalProbability = projection.states.reduce(
            (total, state) => total + (state.damage >= enemy.currHp ? state.probability : 0),
            0,
        );
        let crossingProbability = 0;
        let coveredCrossingProbability = 0;
        let uncoveredCrossingProbability = 0;
        let weightedRemainingPartyDamageEV = 0;

        const remainingPartyDamageActors = countRemainingPartyDamageActors(
            context,
            candidate.action.actor,
            enemy.id,
        );

        if (!alreadyLow) {
            for (const state of projection.states) {
                const remaining = enemy.currHp - state.damage;
                if (remaining <= 0 || remaining >= threshold) continue;

                crossingProbability += state.probability;
                const remainingPartyDamageEV = expectedRemainingPartyDamage(
                    context,
                    candidate.action.actor,
                    enemy.id,
                    state.barrier,
                );
                weightedRemainingPartyDamageEV += remainingPartyDamageEV * state.probability;
                if (
                    remainingPartyDamageActors >= MIN_EXPLOSION_CLEANUP_ACTORS
                    && remainingPartyDamageEV >= remaining
                ) {
                    coveredCrossingProbability += state.probability;
                } else {
                    uncoveredCrossingProbability += state.probability;
                }
            }
        }
        const remainingPartyDamageEV = crossingProbability > 0
            ? weightedRemainingPartyDamageEV / crossingProbability
            : 0;
        const pressure = explosionRecoveryPressure(context, candidate.action.actor);

        if (alreadyLow) {
            const alreadyCommitted = enemy.intentions.some(({ move }) => move === LATEX_EXPLOSION);
            const adjustment = alreadyCommitted ? 0 : pressure * lethalProbability;
            rules.push({
                id: lethalProbability > 0
                    ? "skunk.explosion-imminent-lethal-removal"
                    : "skunk.explosion-imminent-unresolved",
                adjustment,
                reason: lethalProbability > 0
                    ? `${enemy.id} is already below ${format(threshold)} HP; lethal removal probability is ${format(lethalProbability * 100)}%.`
                    : `${enemy.id} is already below ${format(threshold)} HP and this attack does not remove the imminent Explosion.`,
                details: {
                    targetId: enemy.id,
                    currentHp: enemy.currHp,
                    threshold,
                    crossingProbability: 0,
                    lethalProbability: formatNumber(lethalProbability),
                    safeLethal: lethalProbability > 0,
                    alreadyCommitted,
                },
            });
            continue;
        }

        if (uncoveredCrossingProbability > 0) {
            const otherLivingEnemies = context.state.enemies.filter(
                other => other.id !== enemy.id && other.currHp > 0
            ).length;
            const boardFactor = Math.min(1, otherLivingEnemies / 3);

            const spentActors = context.actions.filter(
                ({ available, reason }) =>
                    !available && reason === "actorAlreadyActed"
            ).length;

            const lateTurnFactor = spentActors > 0 ? 100 : 1;

            const adjustment =
                -pressure
                * uncoveredCrossingProbability
                * boardFactor
                * lateTurnFactor;

            rules.push({
                id: otherLivingEnemies === 0
                    ? "skunk.explosion-last-enemy-no-penalty"
                    : "skunk.explosion-nonlethal-threshold-risk",
                adjustment,
                reason: otherLivingEnemies === 0
                    ? `${enemy.id} is the last living enemy; crossing its ${format(threshold)} HP Explosion threshold is unavoidable progress toward ending the encounter.`
                    : `${enemy.id} has a ${format(crossingProbability * 100)}% midpoint-band chance to cross its ${format(threshold)} HP Explosion threshold; ${format(uncoveredCrossingProbability * 100)}% remains uncovered by ${format(remainingPartyDamageEV)} expected follow-up damage from the unacted party. Explosion risk is scaled to ${format(boardFactor * 100)}% with ${otherLivingEnemies} other living enem${otherLivingEnemies === 1 ? "y" : "ies"} on the board.`,
                details: {
                    targetId: enemy.id,
                    currentHp: enemy.currHp,
                    threshold,
                    crossingProbability: formatNumber(crossingProbability),
                    coveredCrossingProbability: formatNumber(coveredCrossingProbability),
                    uncoveredCrossingProbability: formatNumber(uncoveredCrossingProbability),
                    remainingPartyDamageEV: formatNumber(remainingPartyDamageEV),
                    remainingPartyDamageActors,
                    lethalProbability: formatNumber(lethalProbability),
                    safeLethal: false,
                    otherLivingEnemies,
                    spentActors,
                    lateTurnFactor: formatNumber(lateTurnFactor),
                    boardFactor: formatNumber(boardFactor),
                    approximation: "Public damage-band midpoints with ordered independent hits; reactions are harmless if later hits defeat the Skunk.",
                },
            });
        } else if (crossingProbability > 0) {
            rules.push({
                id: "skunk.explosion-covered-threshold-crossing",
                adjustment: 0,
                reason: `${enemy.id} can cross below ${format(threshold)} HP, but the unacted party has ${format(remainingPartyDamageEV)} expected follow-up damage to finish it this player phase.`,
                details: {
                    targetId: enemy.id,
                    currentHp: enemy.currHp,
                    threshold,
                    crossingProbability: formatNumber(crossingProbability),
                    coveredCrossingProbability: formatNumber(coveredCrossingProbability),
                    uncoveredCrossingProbability: 0,
                    remainingPartyDamageEV: formatNumber(remainingPartyDamageEV),
                    lethalProbability: formatNumber(lethalProbability),
                    safeLethal: false,
                },
            });
        } else if (lethalProbability > 0) {
            rules.push({
                id: "skunk.explosion-safe-lethal",
                adjustment: 0,
                reason: `${enemy.id} can be removed without a surviving below-threshold outcome in the midpoint-band projection.`,
                details: {
                    targetId: enemy.id,
                    currentHp: enemy.currHp,
                    threshold,
                    crossingProbability: 0,
                    lethalProbability: formatNumber(lethalProbability),
                    safeLethal: true,
                },
            });
        }
    }
    return rules;
}

function countRemainingPartyDamageActors(
    context: PolicyContext,
    currentActorId: EntityId,
    enemyId: EntityId,
): number {
    return context.actions.filter((action) =>
        action.available
        && action.id !== currentActorId
        && action.moves.some((info) =>
            info.available
            && info.targets.some((target) =>
                target.valid
                && target.target === enemyId
                && previewHasDamage(target, enemyId)
            )
        )
    ).length;
}

/**
 * Estimates damage still available against one target this player phase.
 * Each other currently-available actor contributes only their best damaging move,
 * so alternate moves on one character are not incorrectly added together.
 *
 * Barrier is evaluated from the post-candidate state supplied by the crossing
 * projection. Reusing that same remaining Barrier for each actor is deliberately
 * conservative; this helper never invents extra shield-clearing progress.
 */
function expectedRemainingPartyDamage(
    context: PolicyContext,
    currentActorId: EntityId,
    enemyId: EntityId,
    barrierDuration: number,
): number {
    const enemy = context.state.enemies.find(({ id, currHp }) =>
        id === enemyId && currHp > 0
    );
    if (enemy === undefined) return 0;

    let total = 0;
    for (const action of context.actions) {
        if (!action.available || action.id === currentActorId) continue;

        let best = 0;
        for (const info of action.moves) {
            if (!info.available) continue;
            const target = info.targets.find((value): value is ValidTarget =>
                value.valid && value.target === enemyId
            );
            if (target === undefined || !previewHasDamage(target, enemyId)) continue;

            const followUp: SmartCandidate = {
                action: {
                    type: "move",
                    actor: action.id,
                    move: info.move.id,
                    targets: [enemyId],
                },
                effects: info.effects,
                targets: [target],
                hits: info.move.hits ?? 1,
            };
            best = Math.max(
                best,
                projectAttack(
                    followUp,
                    target,
                    barrierDuration,
                    enemy.currHp,
                ).postBarrierExpectedDamage,
            );
        }
        total += best;
    }
    return total;
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

function usefulCommittedHealing(context: PolicyContext, intention: Intention): number {
    const missingHp = new Map(context.state.enemies.map((enemy) => [
        enemy.id,
        Math.max(0, enemy.maxHp - enemy.currHp),
    ]));
    const healingByTarget = new Map<EntityId, number>();
    for (const effect of [
        ...intention.effects,
        ...intention.targets.flatMap(({ effects }) => effects),
    ]) {
        if (effect.type !== "damage" || effect.amount >= 0) continue;
        healingByTarget.set(
            effect.target,
            (healingByTarget.get(effect.target) ?? 0) - effect.amount,
        );
    }
    let useful = 0;
    for (const [targetId, amount] of healingByTarget) {
        useful += Math.min(missingHp.get(targetId) ?? 0, amount);
    }
    return useful;
}

function projectAttack(
    candidate: SmartCandidate,
    target: ValidTarget,
    barrierDuration: number,
    targetHp: number,
): AttackProjection {
    if (target.target === null) {
        return {
            rawExpectedDamage: 0,
            postBarrierExpectedDamage: 0,
            expectedBlockedHits: 0,
            lethalProbability: 0,
            states: [],
        };
    }
    const targetId = target.target;
    const outcomes = damageOutcomes(target);
    let states: AttackState[] = [{
        barrier: barrierDuration,
        damage: 0,
        probability: 1,
        blockedHits: 0,
    }];
    for (let hit = 0; hit < candidate.hits; hit += 1) {
        const next: AttackState[] = [];
        for (const state of states) {
            for (const outcome of outcomes) {
                if (outcome.probability <= 0) continue;
                const blocked = outcome.damage > 0 && state.barrier > 0;
                next.push({
                    barrier: state.barrier - (blocked ? 1 : 0),
                    damage: state.damage + (blocked ? 0 : outcome.damage),
                    probability: state.probability * outcome.probability,
                    blockedHits: state.blockedHits + (blocked ? 1 : 0),
                });
            }
        }
        states = coalesceStates(next);
    }

    const onceDamage = damageEffectsToEnemy(candidate.effects, targetId);
    if (onceDamage > 0) {
        states = states.map((state) => {
            const blocked = state.barrier > 0;
            return {
                barrier: state.barrier - (blocked ? 1 : 0),
                damage: state.damage + (blocked ? 0 : onceDamage),
                probability: state.probability,
                blockedHits: state.blockedHits + (blocked ? 1 : 0),
            };
        });
    }

    const rawExpectedDamage = expectedDamageToEnemy(candidate, targetId);
    const postBarrierExpectedDamage = states.reduce(
        (total, state) => total + state.damage * state.probability,
        0,
    );
    const expectedBlockedHits = states.reduce(
        (total, state) => total + state.blockedHits * state.probability,
        0,
    );
    const lethalProbability = states.reduce(
        (total, state) => total + (state.damage >= targetHp ? state.probability : 0),
        0,
    );
    return {
        rawExpectedDamage,
        postBarrierExpectedDamage,
        expectedBlockedHits,
        lethalProbability,
        states,
    };
}

function damageOutcomes(target: ValidTarget): Array<{ probability: number; damage: number }> {
    const fixedDamage = damageEffectsToEnemy(target.effects, target.target);
    const outcomes: Array<{ probability: number; damage: number }> = [];
    let representedProbability = 0;
    for (const band of ["miss", "graze", "hit", "crit", "none"] as const) {
        const preview = target.damage?.[band];
        if (preview === undefined) continue;
        const probability = clamp(preview.chance / 100, 0, 1);
        representedProbability += probability;
        outcomes.push({
            probability,
            damage: Math.max(0, fixedDamage + (preview.min + preview.max) / 2),
        });
    }
    if (outcomes.length > 0) {
        if (representedProbability < 1) {
            outcomes.push({ probability: 1 - representedProbability, damage: 0 });
        }
        return outcomes;
    }

    if (fixedDamage <= 0) return [{ probability: 1, damage: 0 }];
    if (target.accuracy !== undefined) {
        const success = nonMissProbability(target.accuracy, target);
        return [
            { probability: 1 - success, damage: 0 },
            { probability: success, damage: fixedDamage },
        ];
    }
    return [{ probability: 1, damage: fixedDamage }];
}

function coalesceStates(states: readonly AttackState[]): AttackState[] {
    const combined = new Map<string, AttackState>();
    for (const state of states) {
        const damage = Number(state.damage.toFixed(4));
        const key = `${state.barrier}|${damage}|${state.blockedHits}`;
        const existing = combined.get(key);
        combined.set(key, existing === undefined
            ? { ...state, damage }
            : { ...existing, probability: existing.probability + state.probability });
    }
    return [...combined.values()];
}

function explosionRecoveryPressure(context: PolicyContext, actorId: EntityId): number {
    const actor = context.state.characters.find(({ id }) => id === actorId);
    const explosion = context.library.moves[LATEX_EXPLOSION];
    if (actor === undefined || explosion === undefined || explosion.baseDamage === undefined) return 0;

    const expectedEffectiveness = expectedExplosionEffectiveness(explosion.accuracy);
    const expectedAmount = explosion.baseDamage * expectedEffectiveness;
    if (expectedAmount <= 0 || explosion.bindings.length === 0) return 0;
    const current = currentBindingBoard(context.state.characters);
    const projected = cloneBindingBoard(current);
    for (const bindingId of explosion.bindings) {
        addBinding(projected, actorId, bindingId, expectedAmount, context.thresholds.max);
    }
    return Math.max(
        0,
        totalRecoveryDebt(projected, context.thresholds)
        - totalRecoveryDebt(current, context.thresholds),
    );
}

function expectedExplosionEffectiveness(accuracy: AccuracyProfile | undefined): number {
    if (accuracy === undefined) return 0;
    // Public MoveReference exposes band probabilities but not within-band
    // effectiveness ranges, so use the current band midpoints as the smallest
    // isolated content-aware approximation.
    const midpoints: Readonly<Record<HitBand, number>> = {
        none: 0,
        miss: 0,
        graze: 0.35,
        hit: 0.9,
        crit: 1.75,
    };
    return Object.entries(accuracy).reduce(
        (total, [band, chance]) => total
            + ((chance ?? 0) / 100) * midpoints[band as HitBand],
        0,
    );
}

function expectedDamageToEnemy(candidate: SmartCandidate, enemyId: EntityId): number {
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
    enemyId: EntityId | null,
): number {
    if (enemyId === null) return 0;
    return effects.reduce(
        (total, effect) => total
            + (effect.type === "damage" && effect.target === enemyId && effect.amount > 0
                ? effect.amount
                : 0),
        0,
    );
}

function finisherValue(damage: number, currentHp: number): number {
    return currentHp > 0 ? damage * Math.min(damage / currentHp, 1) : 0;
}

function expectedSuccessfulHits(target: ValidTarget): number {
    return nonMissProbability(target.accuracy, target);
}

function isFairy(id: EntityId): boolean {
    return FAIRY_PATTERN.test(id);
}

function isSkunk(id: EntityId): boolean {
    return SKUNK_PATTERN.test(id);
}

function isFairyHealTarget(id: EntityId): boolean {
    return isSkunk(id) || SKUNKETTE_PATTERN.test(id);
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

function formatNumber(value: number): number {
    return Number(value.toFixed(4));
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}
