import type { EntityId } from "../../../engine/public/types";
import type { PolicyContext } from "../../harness";
import type { SmartBoardAssessment } from "../smart-board";
import type { SmartCandidate } from "../smart";
import { evaluateSkunkKnowledge } from "./skunk-knowledge";

export interface KitKnowledgeRuleDiagnostic {
    readonly id: string;
    readonly adjustment: number;
    readonly reason: string;
    readonly details?: unknown;
}

export interface KitKnowledgeBreakdown {
    readonly rules: readonly KitKnowledgeRuleDiagnostic[];
    readonly raw: number;
}

export const EMPOWERED_OFFENSE_SUBSTITUTION_PENALTY = -80;
export const IMMOLATION_RESERVE_PENALTY = -1_000;
export const OBEY_KO_BONUS = 80;
export const STOP_COMMITTED_INTENTION_BONUS = 70;
export const RELEASE_SUBSPACE_PRESSURE_VALUE = 80;
export const RELEASE_LOST_ROCKFALL_HIT_VALUE = 20;
export const STORE_SUBSPACE_PRESSURE_PENALTY = 100;
export const STORE_LOST_ROCKFALL_HIT_PENALTY = 20;

const MATSUKO = "matsuko";
const HINARI = "hinari";
const KO = "ko";
const EMPOWERMENT = "empowerment";
const IMMOLATION = "immolation";
const OBEY = "obey";
const STOP = "stop";
const ATTACK_ME = "attackMe";
const MATSUKO_FAIRY_ATTACKS = new Set(["fairyWhiteFlame", "fairyPhoenixKick"]);
const MATSUKO_ORDINARY_ATTACKS = new Set(["punch", "kick", "whiteFlame", "phoenixKick"]);
const ROCKFALL = "rockfall";
const FAIRY_ROCKFALL = "fairyRockfall";
const RELEASE = "release";
const STORE = "store";
const RELEASE_START_RATIO = 0.25;
const STORE_PRESSURE_START_RATIO = 0.5;

/** Evaluates explicit current-KCQ kit knowledge without changing generic scoring. */
export function evaluateKitKnowledge(
    context: PolicyContext,
    board: SmartBoardAssessment,
    candidate: SmartCandidate,
): KitKnowledgeBreakdown {
    const rules = [
        ...evaluateMatsukoKnowledge(context, board, candidate),
        ...evaluateHinariKnowledge(context, candidate),
        ...evaluateSkunkKnowledge(context, candidate),
    ];
    return {
        rules,
        raw: rules.reduce((total, rule) => total + rule.adjustment, 0),
    };
}

function evaluateMatsukoKnowledge(
    context: PolicyContext,
    board: SmartBoardAssessment,
    candidate: SmartCandidate,
): KitKnowledgeRuleDiagnostic[] {
    if (candidate.action.type !== "move" || candidate.action.actor !== MATSUKO) return [];

    const rules: KitKnowledgeRuleDiagnostic[] = [];
    const moveId = candidate.action.move;
    const matsuko = context.state.characters.find(({ id }) => id === MATSUKO);
    const empowered = matsuko?.buffs.some(({ id }) => id === EMPOWERMENT) ?? false;
    const fairyAttackAvailable = context.actions
        .find(({ id }) => id === MATSUKO)
        ?.moves.some(({ available, move }) => available && MATSUKO_FAIRY_ATTACKS.has(move.id))
        ?? false;

    // This is deliberately a substitution penalty on ordinary offense, not a
    // blanket bonus that could make a fairy attack displace urgent recovery.
    if (empowered && fairyAttackAvailable && MATSUKO_ORDINARY_ATTACKS.has(moveId)) {
        rules.push({
            id: "matsuko.consume-empowerment",
            adjustment: EMPOWERED_OFFENSE_SUBSTITUTION_PENALTY,
            reason: "Reserve ordinary offense while a legal empowered Matsuko attack is available.",
        });
    }

    if (moveId === IMMOLATION) {
        const assessment = board.characters.find(({ id }) => id === MATSUKO);
        const emergency = (assessment?.impossibleOrMaxBindings ?? 0) >= 1
            || (assessment?.extremeOrWorseBindings ?? 0) >= 2;
        const livingEnemies = context.state.enemies.filter(({ currHp }) => currHp > 0);
        const encounterEnding = livingEnemies.length > 0 && livingEnemies.every((enemy) =>
            expectedDamageToEnemy(candidate, enemy.id) >= enemy.currHp
        );

        if (emergency || encounterEnding) {
            rules.push({
                id: emergency
                    ? "matsuko.immolation-release-emergency"
                    : "matsuko.immolation-release-finisher",
                adjustment: 0,
                reason: emergency
                    ? "Matsuko's binding emergency releases the Immolation reserve."
                    : "Immolation is expected to finish every remaining enemy.",
            });
        } else {
            rules.push({
                id: "matsuko.immolation-reserve",
                adjustment: IMMOLATION_RESERVE_PENALTY,
                reason: "Preserve Matsuko's post-Immolation move kit outside an emergency or encounter finish.",
            });
        }
    }

    if (moveId === OBEY && candidate.action.targets.includes(KO)) {
        rules.push({
            id: "matsuko.obey-ko",
            adjustment: OBEY_KO_BONUS,
            reason: "Use Matsuko's explicit safe Obey recipient: Ko.",
        });
    }

    if (moveId === STOP) {
        const usefulTarget = candidate.action.targets.some((targetId) =>
            context.state.enemies.some(({ id, currHp, intentions }) =>
                id === targetId && currHp > 0 && intentions.length > 0
            )
        );
        if (usefulTarget) {
            rules.push({
                id: "matsuko.stop-committed-intention",
                adjustment: STOP_COMMITTED_INTENTION_BONUS,
                reason: "Stop can interfere with a living enemy's committed intention.",
            });
        }
    }

    // Attack Me is intentionally neutral in this first knowledge pass.
    if (moveId === ATTACK_ME) return rules;
    return rules;
}

function evaluateHinariKnowledge(
    context: PolicyContext,
    candidate: SmartCandidate,
): KitKnowledgeRuleDiagnostic[] {
    if (candidate.action.type !== "move" || candidate.action.actor !== HINARI) return [];

    const rules: KitKnowledgeRuleDiagnostic[] = [];
    const hinari = context.state.characters.find(({ id }) => id === HINARI);
    if (hinari === undefined) return rules;

    const moveId = candidate.action.move;
    const empowered = hinari.buffs.some(({ id }) => id === EMPOWERMENT);
    const fairyRockfallAvailable = context.actions
        .find(({ id }) => id === HINARI)
        ?.moves.some(({ available, move }) => available && move.id === FAIRY_ROCKFALL)
        ?? false;
    if (empowered && fairyRockfallAvailable && moveId === ROCKFALL) {
        rules.push({
            id: "hinari.consume-empowerment",
            adjustment: EMPOWERED_OFFENSE_SUBSTITUTION_PENALTY,
            reason: "Reserve ordinary Rockfall while Fairy Rockfall is legally available.",
        });
    }

    const pressure = subspacePressure(context);
    if (moveId === RELEASE && targetsLivingEnemy(context, candidate) && pressure.releaseValue > 0) {
        rules.push({
            id: "hinari.release-subspace-pressure",
            adjustment: pressure.releaseValue,
            reason: `Spend Subspace after losing ${pressure.lostRockfallHits} Rockfall hit(s).`,
        });
    }

    if (moveId === STORE && pressure.storePenalty > 0) {
        rules.push({
            id: "hinari.store-opportunity-cost",
            adjustment: -pressure.storePenalty,
            reason: `Additional Store preserves ${pressure.lostRockfallHits} lost Rockfall hit(s) at high Subspace.`,
        });
    }

    return rules;
}

function subspacePressure(context: PolicyContext): {
    releaseValue: number;
    storePenalty: number;
    lostRockfallHits: number;
} {
    const hinari = context.state.characters.find(({ id }) => id === HINARI);
    const subspace = Math.max(0, hinari?.data.subspace ?? 0);
    const maximum = Math.max(1, hinari?.data.subspaceMax ?? 100);
    const ratio = Math.min(1, subspace / maximum);
    const rockfall = context.actions
        .find(({ id }) => id === HINARI)
        ?.moves.find(({ move }) => move.id === ROCKFALL);
    const baseHits = context.library.moves[ROCKFALL]?.baseHits ?? 4;
    const currentHits = rockfall?.move.hits ?? baseHits;
    const lostRockfallHits = Math.max(0, baseHits - currentHits);

    const releaseRatio = clamp(
        (ratio - RELEASE_START_RATIO) / (1 - RELEASE_START_RATIO),
        0,
        1,
    );
    const storeRatio = clamp(
        (ratio - STORE_PRESSURE_START_RATIO) / (1 - STORE_PRESSURE_START_RATIO),
        0,
        1,
    );
    return {
        releaseValue: releaseRatio * RELEASE_SUBSPACE_PRESSURE_VALUE
            + lostRockfallHits * RELEASE_LOST_ROCKFALL_HIT_VALUE,
        storePenalty: storeRatio * STORE_SUBSPACE_PRESSURE_PENALTY
            + Math.max(0, lostRockfallHits - 1) * STORE_LOST_ROCKFALL_HIT_PENALTY,
        lostRockfallHits,
    };
}

function targetsLivingEnemy(context: PolicyContext, candidate: SmartCandidate): boolean {
    const livingEnemyIds = new Set(
        context.state.enemies.filter(({ currHp }) => currHp > 0).map(({ id }) => id),
    );
    return candidate.targets.some(({ target }) => target !== null && livingEnemyIds.has(target));
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
    enemyId: EntityId,
): number {
    let total = 0;
    for (const effect of effects) {
        if (effect.type === "damage" && effect.target === enemyId) total += effect.amount;
    }
    return total;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}
