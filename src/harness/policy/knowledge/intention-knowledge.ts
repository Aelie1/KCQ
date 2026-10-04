import type {
    BindingEffect,
    BindingId,
    Effect,
    Enemy,
    EntityId,
    Intention,
} from "../../../engine/public/types";
import type { PolicyContext } from "../../harness";
import type { SmartCandidate } from "../smart";
import {
    addBinding,
    cloneBindingBoard,
    currentBindingBoard,
    totalRecoveryDebt,
    type BindingBoard,
} from "../smart-bindings";
import type { KitKnowledgeRuleDiagnostic } from "./kit-knowledge";
import { TRAP_PRESSURE_SCALE } from "./tempo-knowledge";

const HINARI = "hinari";
const MATSUKO = "matsuko";
const BRACE = "brace";
const STOP = "stop";
const ATTACK_ME = "attackMe";

/** Stop subtracts 25 points from a boss roll, but the private roll is unavailable. */
export const STOP_BOSS_PRESSURE_MITIGATION = 0.25;
/** One public Defense point conservatively discounts 1% of redirected binding debt. */
export const ATTACK_ME_DEFENSE_DEBT_FRACTION = 0.01;

export interface KnownBindingApplication {
    readonly enemyId: EntityId;
    readonly move: string;
    readonly bindingId: BindingId;
    readonly amount: number;
}

interface CommittedIntentionDiagnostic {
    readonly move: string;
    readonly bands: readonly string[];
    readonly harmfulBindingApplications: number;
    readonly harmfulBindingAmount: number;
    readonly harmfulTrapPressure: number;
    readonly addedRecoveryDebt: number;
    readonly reason: string;
}

interface StopDiagnostic {
    readonly enemyId?: EntityId;
    readonly rank?: Enemy["rank"];
    readonly intentions: readonly CommittedIntentionDiagnostic[];
    readonly currentDebt: number;
    readonly committedHarmfulPressure: number;
    readonly committedBindingPressure: number;
    readonly committedTrapPressure: number;
    readonly baselineDebt: number;
    readonly stoppedDebt: number;
    readonly preventedOrMitigatedPressure: number;
    readonly mitigationFraction: number;
    readonly approximation: string;
    readonly reason: string;
}

interface RedirectedBindingDiagnostic {
    readonly bindingId: BindingId;
    readonly amount: number;
    readonly originalTargetDebt: number;
    readonly matsukoDebt: number;
    readonly redirectGain: number;
}

interface RedirectedIntentionDiagnostic {
    readonly enemyId: EntityId;
    readonly move: string;
    readonly originalTarget?: EntityId;
    readonly eligible: boolean;
    readonly reason: string;
    readonly bindings: readonly RedirectedBindingDiagnostic[];
    readonly originalTargetDebt: number;
    readonly matsukoDebt: number;
    readonly redirectGain: number;
}

/** Evaluates committed-intention utility moves from public state only. */
export function evaluateIntentionKnowledge(
    context: PolicyContext,
    candidate: SmartCandidate,
): KitKnowledgeRuleDiagnostic[] {
    if (candidate.action.type !== "move") return [];
    if (candidate.action.actor === HINARI && candidate.action.move === BRACE) {
        return [braceRule(context)];
    }
    if (candidate.action.actor === MATSUKO && candidate.action.move === STOP) {
        return [stopRule(context, candidate)];
    }
    if (candidate.action.actor === MATSUKO && candidate.action.move === ATTACK_ME) {
        return [attackMeRule(context, candidate)];
    }
    return [];
}

function braceRule(context: PolicyContext): KitKnowledgeRuleDiagnostic {
    const hinari = context.state.characters.find(({ id }) => id === HINARI);
    const application = firstKnownBindingApplication(context, HINARI);
    const currentSubspace = Math.max(0, hinari?.data.subspace ?? 0);
    const maximumSubspace = Math.max(0, hinari?.data.subspaceMax ?? 0);
    const subspaceRoom = Math.max(0, maximumSubspace - currentSubspace);
    if (hinari === undefined || application === undefined || subspaceRoom === 0) {
        return {
            id: "hinari.brace-committed-binding",
            adjustment: 0,
            reason: application === undefined
                ? "Brace has no known positive binding application to intercept."
                : "Brace has no remaining public Subspace room.",
            details: {
                ...(application ?? {}),
                currentSubspace,
                subspaceRoom,
                incomingAmount: application?.amount ?? 0,
                absorbedAmount: 0,
                overflowAmount: application?.amount ?? 0,
                normalDebt: 0,
                bracedDebt: 0,
                preventedRecoveryDebt: 0,
            },
        };
    }

    const current = currentBindingBoard(context.state.characters);
    const normal = cloneBindingBoard(current);
    addBinding(normal, HINARI, application.bindingId, application.amount, context.thresholds.max);
    const absorbedAmount = Math.min(application.amount, subspaceRoom);
    const overflowAmount = application.amount - absorbedAmount;
    const braced = cloneBindingBoard(current);
    addBinding(braced, HINARI, application.bindingId, overflowAmount, context.thresholds.max);
    const normalDebt = totalRecoveryDebt(normal, context.thresholds);
    const bracedDebt = totalRecoveryDebt(braced, context.thresholds);
    const preventedRecoveryDebt = Math.max(0, normalDebt - bracedDebt);
    return {
        id: "hinari.brace-committed-binding",
        adjustment: preventedRecoveryDebt,
        reason: `Brace catches the first known binding application from ${application.enemyId}; it is single-use.`,
        details: {
            ...application,
            incomingAmount: application.amount,
            currentSubspace,
            subspaceRoom,
            absorbedAmount,
            overflowAmount,
            normalDebt,
            bracedDebt,
            preventedRecoveryDebt,
        },
    };
}

function stopRule(
    context: PolicyContext,
    candidate: SmartCandidate,
): KitKnowledgeRuleDiagnostic {
    const enemyId = candidate.action.type === "move" ? candidate.action.targets[0] : undefined;
    const enemy = context.state.enemies.find(({ id, currHp }) => id === enemyId && currHp > 0);
    const empty: StopDiagnostic = {
        ...(enemyId === undefined ? {} : { enemyId }),
        intentions: [],
        currentDebt: totalRecoveryDebt(
            currentBindingBoard(context.state.characters),
            context.thresholds,
        ),
        committedHarmfulPressure: 0,
        committedBindingPressure: 0,
        committedTrapPressure: 0,
        baselineDebt: 0,
        stoppedDebt: 0,
        preventedOrMitigatedPressure: 0,
        mitigationFraction: 0,
        approximation: "Only public positive numeric binding effects are valued.",
        reason: enemy === undefined ? "no-living-target" : "no-harmful-committed-effects",
    };
    if (enemy === undefined) return stopDiagnosticRule(empty);

    const characterIds = new Set(context.state.characters.map(({ id }) => id));
    const current = currentBindingBoard(context.state.characters);
    const projected = cloneBindingBoard(current);
    const currentDebt = totalRecoveryDebt(current, context.thresholds);
    const intentions = enemy.intentions.map((intention) => {
        const before = totalRecoveryDebt(projected, context.thresholds);
        const applications = committedBindingEffects(intention, characterIds);
        const harmfulTrapPressure = intentionTrapPressure(intention);
        for (const effect of applications) applyBinding(projected, effect, context.thresholds.max);
        const after = totalRecoveryDebt(projected, context.thresholds);
        const allMiss = intention.targets.length > 0
            && intention.targets.every(({ band }) => band === "miss");
        return {
            move: intention.move,
            bands: intention.targets.map(({ band }) => band),
            harmfulBindingApplications: applications.length,
            harmfulBindingAmount: applications.reduce((sum, effect) => sum + effect.amount!, 0),
            harmfulTrapPressure,
            addedRecoveryDebt: Math.max(0, after - before),
            reason: applications.length > 0
                ? "public-numeric-binding-pressure"
                : harmfulTrapPressure > 0 ? "public-trap-pressure"
                    : allMiss ? "committed-miss" : "no-valued-harmful-effects",
        } satisfies CommittedIntentionDiagnostic;
    });
    const baselineDebt = totalRecoveryDebt(projected, context.thresholds);
    const committedBindingPressure = Math.max(0, baselineDebt - currentDebt);
    const committedTrapPressure = enemy.intentions.reduce(
        (sum, intention) => sum + intentionTrapPressure(intention),
        0,
    );
    const committedHarmfulPressure = committedBindingPressure + committedTrapPressure;
    const mitigationFraction = enemy.rank === "boss"
        ? STOP_BOSS_PRESSURE_MITIGATION
        : 1;
    const preventedOrMitigatedPressure = committedHarmfulPressure * mitigationFraction;
    const stoppedDebt = baselineDebt - committedBindingPressure * mitigationFraction;
    const diagnostics: StopDiagnostic = {
        enemyId: enemy.id,
        rank: enemy.rank,
        intentions,
        currentDebt,
        committedHarmfulPressure,
        committedBindingPressure,
        committedTrapPressure,
        baselineDebt,
        stoppedDebt,
        preventedOrMitigatedPressure,
        mitigationFraction,
        approximation: enemy.rank === "boss"
            ? "Boss Stop is approximated as preventing 25% of current committed binding and existing trap pressure because private rolls are not public."
            : "Non-boss Stop cancels all currently committed public binding and trap pressure.",
        reason: committedHarmfulPressure > 0
            ? enemy.rank === "boss" ? "boss-weaken" : "non-boss-cancel"
            : "no-harmful-committed-effects",
    };
    return stopDiagnosticRule(diagnostics);
}

function stopDiagnosticRule(details: StopDiagnostic): KitKnowledgeRuleDiagnostic {
    return {
        id: "matsuko.stop-committed-intention",
        adjustment: details.preventedOrMitigatedPressure,
        reason: details.preventedOrMitigatedPressure > 0
            ? `Stop prevents or mitigates ${details.preventedOrMitigatedPressure.toFixed(2)} recovery debt.`
            : "Stop's target has no harmful committed public binding pressure; misses are worth zero.",
        details,
    };
}

function attackMeRule(
    context: PolicyContext,
    candidate: SmartCandidate,
): KitKnowledgeRuleDiagnostic {
    const characterIds = new Set(context.state.characters.map(({ id }) => id));
    const affectedEnemyIds = new Set(candidate.targets.flatMap(({ target }) =>
        target !== null && context.state.enemies.some(({ id }) => id === target)
            ? [target]
            : []
    ));
    const normal = currentBindingBoard(context.state.characters);
    const redirected = cloneBindingBoard(normal);
    const intentions: RedirectedIntentionDiagnostic[] = [];
    let redirectedMatsukoDebt = 0;
    let alreadyTargetedMatsukoDebt = 0;

    for (const enemy of context.state.enemies) {
        if (enemy.currHp <= 0) continue;
        for (const intention of enemy.intentions) {
            const move = context.library.moves[intention.move];
            const target = intention.targets.length === 1 ? intention.targets[0] : undefined;
            const eligible = affectedEnemyIds.has(enemy.id)
                && move !== undefined
                && move.targets === 1
                && (move.targetSide === "player" || move.targetSide === "either")
                && target !== undefined
                && target.target !== MATSUKO
                && characterIds.has(target.target);

            if (!eligible || target === undefined) {
                const redirectedBefore = totalRecoveryDebt(redirected, context.thresholds);
                applyIntentionNormally(normal, intention, characterIds, context.thresholds.max);
                applyIntentionNormally(redirected, intention, characterIds, context.thresholds.max);
                const redirectedAfter = totalRecoveryDebt(redirected, context.thresholds);
                if (affectedEnemyIds.has(enemy.id) && target?.target === MATSUKO) {
                    alreadyTargetedMatsukoDebt += Math.max(0, redirectedAfter - redirectedBefore);
                }
                intentions.push({
                    enemyId: enemy.id,
                    move: intention.move,
                    ...(target === undefined ? {} : { originalTarget: target.target }),
                    eligible: false,
                    reason: target?.target === MATSUKO
                        ? "already-targets-matsuko"
                        : move === undefined ? "missing-public-move-definition"
                            : move.targets !== 1 ? "aoe-or-non-single-target"
                                : move.targetSide !== "player" && move.targetSide !== "either"
                                    ? "non-retargetable-side"
                                    : "no-single-character-target",
                    bindings: [],
                    originalTargetDebt: 0,
                    matsukoDebt: 0,
                    redirectGain: 0,
                });
                continue;
            }

            const applications = positiveBindingEffects(target.effects, characterIds)
                .filter((effect) => effect.target === target.target);
            const bindings: RedirectedBindingDiagnostic[] = [];
            let originalTargetDebt = 0;
            let matsukoDebt = 0;
            for (const effect of applications) {
                const normalBefore = totalRecoveryDebt(normal, context.thresholds);
                const redirectedBefore = totalRecoveryDebt(redirected, context.thresholds);
                applyBinding(normal, effect, context.thresholds.max);
                addBinding(
                    redirected,
                    MATSUKO,
                    effect.binding,
                    effect.amount!,
                    context.thresholds.max,
                );
                const originalCost = totalRecoveryDebt(normal, context.thresholds) - normalBefore;
                const matsukoCost = totalRecoveryDebt(redirected, context.thresholds) - redirectedBefore;
                originalTargetDebt += originalCost;
                matsukoDebt += matsukoCost;
                bindings.push({
                    bindingId: effect.binding,
                    amount: effect.amount!,
                    originalTargetDebt: originalCost,
                    matsukoDebt: matsukoCost,
                    redirectGain: originalCost - matsukoCost,
                });
            }
            redirectedMatsukoDebt += matsukoDebt;
            applyEffectsNormally(normal, intention.effects, characterIds, context.thresholds.max);
            applyEffectsNormally(redirected, intention.effects, characterIds, context.thresholds.max);
            intentions.push({
                enemyId: enemy.id,
                move: intention.move,
                originalTarget: target.target,
                eligible: true,
                reason: applications.length > 0
                    ? "public-single-target-binding"
                    : target.band === "miss" ? "committed-miss" : "no-harmful-binding-effect",
                bindings,
                originalTargetDebt,
                matsukoDebt,
                redirectGain: originalTargetDebt - matsukoDebt,
            });
        }
    }

    const normalDebt = totalRecoveryDebt(normal, context.thresholds);
    const redirectedDebt = totalRecoveryDebt(redirected, context.thresholds);
    const trackTransferGain = Math.max(0, normalDebt - redirectedDebt);
    const defenseModifier = candidate.effects.reduce((best, effect) =>
        effect.type === "buff" && effect.operation === "add" && effect.target === MATSUKO
            ? Math.max(best, effect.buff.modifiers?.defense ?? 0)
            : best
        , 0);
    const harmfulRedirect = redirectedDebt > normalDebt;
    const defenseEligibleDebt = alreadyTargetedMatsukoDebt
        + (trackTransferGain > 0 ? redirectedMatsukoDebt : 0);
    const defenseBenefit = harmfulRedirect
        ? 0
        : defenseEligibleDebt * defenseModifier * ATTACK_ME_DEFENSE_DEBT_FRACTION;
    const adjustment = trackTransferGain + defenseBenefit;
    return {
        id: "matsuko.attack-me-redirect",
        adjustment,
        reason: trackTransferGain > 0
            ? "Attack Me moves committed single-target binding pressure onto cheaper Matsuko tracks and applies Defense."
            : defenseBenefit > 0
                ? "Attack Me's public Defense mitigates committed binding pressure already targeting Matsuko."
                : "Attack Me has no beneficial public single-target binding redirect.",
        details: {
            intentions,
            normalDebt,
            redirectedDebt,
            trackTransferGain,
            alreadyTargetedMatsukoDebt,
            defenseModifier,
            defenseEligibleDebt,
            defenseBenefit,
            defenseApproximation: "Each public Defense point discounts 1% of committed Matsuko recovery debt after eligible redirects; the private roll is not replayed.",
        },
    };
}

/** Returns the first public positive numeric binding application in resolution order. */
export function firstKnownBindingApplication(
    context: PolicyContext,
    targetId: EntityId,
): KnownBindingApplication | undefined {
    for (const enemy of context.state.enemies) {
        if (enemy.currHp <= 0) continue;
        for (const intention of enemy.intentions) {
            for (const target of intention.targets) {
                const effect = positiveBindingEffects(target.effects, new Set([targetId]))
                    .find((value) => value.target === targetId);
                if (effect !== undefined) return knownApplication(enemy, intention, effect);
            }
            const effect = positiveBindingEffects(intention.effects, new Set([targetId]))
                .find((value) => value.target === targetId);
            if (effect !== undefined) return knownApplication(enemy, intention, effect);
        }
    }
    return undefined;
}

function knownApplication(
    enemy: Enemy,
    intention: Intention,
    effect: BindingEffect & { amount: number },
): KnownBindingApplication {
    return {
        enemyId: enemy.id,
        move: intention.move,
        bindingId: effect.binding,
        amount: effect.amount,
    };
}

function committedBindingEffects(
    intention: Intention,
    characterIds: ReadonlySet<EntityId>,
): Array<BindingEffect & { amount: number }> {
    return [
        ...intention.targets.flatMap(({ effects }) => positiveBindingEffects(effects, characterIds)),
        ...positiveBindingEffects(intention.effects, characterIds),
    ];
}

function intentionTrapPressure(intention: Intention): number {
    const effects = [
        ...intention.targets.flatMap(({ effects }) => effects),
        ...intention.effects,
    ];
    return effects.reduce((sum, effect) =>
        effect.type === "trap" && effect.amount > 0
            ? sum + effect.amount * TRAP_PRESSURE_SCALE
            : sum
        , 0);
}

function positiveBindingEffects(
    effects: readonly Effect[],
    characterIds: ReadonlySet<EntityId>,
): Array<BindingEffect & { amount: number }> {
    return effects.flatMap((effect) =>
        effect.type === "binding" && effect.amount !== undefined && effect.amount > 0
            && characterIds.has(effect.target)
            ? [effect as BindingEffect & { amount: number }]
            : []
    );
}

function applyIntentionNormally(
    board: BindingBoard,
    intention: Intention,
    characterIds: ReadonlySet<EntityId>,
    maximum: number,
): void {
    for (const target of intention.targets) {
        applyEffectsNormally(board, target.effects, characterIds, maximum);
    }
    applyEffectsNormally(board, intention.effects, characterIds, maximum);
}

function applyEffectsNormally(
    board: BindingBoard,
    effects: readonly Effect[],
    characterIds: ReadonlySet<EntityId>,
    maximum: number,
): void {
    for (const effect of positiveBindingEffects(effects, characterIds)) {
        applyBinding(board, effect, maximum);
    }
}

function applyBinding(
    board: BindingBoard,
    effect: BindingEffect & { amount: number },
    maximum: number,
): void {
    addBinding(board, effect.target, effect.binding, effect.amount, maximum);
}
