import type { Enemy } from "../../../engine/public/types";
import type { PolicyContext } from "../../harness";
import { dormantEnemyIds, physicalEnemies, smartEnemyContext } from "../smart-enemies";
import type { SmartCandidate } from "../smart";
import type { KitKnowledgeRuleDiagnostic } from "./kit-knowledge";
import {
    applicationChance, candidateEffects, followUpDamage,
    incrementalDuration, mitigatedPressure, previewDamage,
} from "./kit-knowledge-utils";

const EMPOWERMENT_SUBSTITUTION_PENALTY = -80;
// Cooldown control needs a small benefit; a permanent expenditure needs more.
const DISCORD_SEAL_RESERVE = 10;
const POWER_OF_CHAOS_RESERVE = 60;

export function evaluateSakariKnowledge(
    context: PolicyContext,
    candidate: SmartCandidate,
): KitKnowledgeRuleDiagnostic[] {
    context = smartEnemyContext(context);
    if (candidate.action.type !== "move" || candidate.action.actor !== "sakari") return [];
    const move = candidate.action.move;
    const rules: KitKnowledgeRuleDiagnostic[] = [];
    if ((move === "malfunction" || move === "overload")
        && context.state.characters.find(({ id }) => id === "sakari")?.buffs.some(({ id }) => id === "empowerment")
        && context.actions.find(({ id }) => id === "sakari")?.moves.some(({ move: fairy, available }) =>
            available && fairy.id === (move === "malfunction" ? "fairyMalfunction" : "fairyOverload"))) {
        rules.push({ id: "sakari.consume-empowerment", adjustment: EMPOWERMENT_SUBSTITUTION_PENALTY,
            reason: "Choose the available three-round fairy version when using this attack." });
    }
    if (["malfunction", "fairyMalfunction", "overload", "fairyOverload"].includes(move)) {
        rules.push(attackDebuffRule(context, candidate));
    }
    if (move === "overconfidence") rules.push(overconfidenceRule(context, candidate));
    if (move === "discordSeal" || move === "powerOfChaos") rules.push(discordRule(context, candidate));
    return rules;
}

function discordRule(context: PolicyContext, candidate: SmartCandidate): KitKnowledgeRuleDiagnostic {
    const effects = candidateEffects(candidate).filter((effect) =>
        effect.type === "intention" && effect.operation === "discord");
    const living = context.state.enemies.filter(({ currHp }) => currHp > 0);
    const dormantIds = dormantEnemyIds(context);
    const physical = physicalEnemies(context).filter(({ id, currHp }) => currHp > 0 || dormantIds.has(id));
    const eligible = (enemy: Enemy, move: string) => physical.length >= 2 && effects.some((effect) =>
        effect.target === enemy.id && effect.move === move)
        && context.library.moves[move]?.traits?.length === 1
        && context.library.moves[move]?.traits?.[0] === "binding";
    const preventedPressure = mitigatedPressure(context, (enemy, intention) =>
        eligible(enemy, intention.move) ? 1 : 0);
    const conversions = living.map((enemy) => {
        // The preview gives exact converted binding damage. Destinations are random;
        // dormant destinations receive zero value but retain their physical share
        // of the random draw. Filtering the denominator would overvalue redirects.
        const damage = effects.reduce((sum, effect) => sum + (effect.target === enemy.id
            && eligible(enemy, effect.move)
            && enemy.intentions.some((intention) => !intention.resolved && intention.move === effect.move)
            ? Math.max(0, effect.amount) : 0), 0);
        const others = living.filter(({ id }) => id !== enemy.id);
        const destinationCount = physical.filter(({ id }) => id !== enemy.id).length;
        return { enemyId: enemy.id, damage,
            expectedDamage: destinationCount === 0 ? 0 : others.reduce((sum, target) =>
                sum + Math.min(target.currHp, damage), 0) / destinationCount };
    });
    const expectedDamage = Math.min(living.reduce((sum, enemy) => sum + enemy.currHp, 0),
        conversions.reduce((sum, conversion) => sum + conversion.expectedDamage, 0));
    const ultimate = candidate.action.type === "move" && candidate.action.move === "powerOfChaos";
    const reserve = ultimate ? POWER_OF_CHAOS_RESERVE : DISCORD_SEAL_RESERVE;
    return { id: ultimate ? "sakari.power-of-chaos" : "sakari.discord-seal",
        adjustment: preventedPressure + expectedDamage - reserve,
        reason: ultimate
            ? "Reserve one-use Chaos unless its eligible binding redirects justify the expenditure."
            : "Spend Discord Seal's cooldown on harmful pure binding intentions and their converted damage.",
        details: { preventedPressure, expectedDamage, reserve, conversions,
            approximation: "Converted damage uses public previews and averages capped random destinations; no guaranteed kill credit." } };
}

function attackDebuffRule(context: PolicyContext, candidate: SmartCandidate): KitKnowledgeRuleDiagnostic {
    const targets = candidate.targets.flatMap((preview) => {
        const enemy = context.state.enemies.find(({ id, currHp }) => id === preview.target && currHp > 0);
        const effect = preview.effects.find((effect) => effect.type === "buff" && effect.operation === "add"
            && (effect.buff.id === "malfunction" || effect.buff.id === "overload"));
        if (enemy === undefined || effect?.type !== "buff") return [];
        const damage = previewDamage(preview, candidate.hits);
        const remainingHp = Math.max(0, enemy.currHp - damage);
        const duration = incrementalDuration(effect.buff, enemy.buffs);
        const previous = enemy.buffs.find(({ id }) => id === effect.buff.id);
        const futureRounds = Math.max(0, (effect.buff.duration ?? 1) - Math.max(1, previous?.duration ?? 0));
        const shortenedRounds = Math.max(0, (previous?.duration ?? 0) - (effect.buff.duration ?? 1));
        let benefit = 0;
        if (remainingHp > 0 && duration > 0) {
            if (effect.buff.id === "malfunction") {
                const fraction = Math.min(1, Math.abs(effect.buff.modifiers?.potency ?? 0)
                    / Math.max(1, 10 + (enemy.modifiers.potency ?? 0)));
                benefit = (previous === undefined
                    ? mitigatedPressure(context, (source) => source.id === enemy.id ? fraction : 0) : 0)
                    + futureRounds * Math.abs(effect.buff.modifiers?.potency ?? 0) * 2;
            } else {
                const followUp = followUpDamage(context, "sakari", enemy.id);
                // Ordinary Overload expires at round end. Fairy Overload also
                // supports future attacks, including Sakari's own next action.
                const future = futureRounds * (followUp + damage) * 0.5;
                const fraction = Math.max(0, effect.buff.modifiers?.vulnerability ?? 0)
                    / Math.max(1, 10 + (enemy.modifiers.vulnerability ?? 0));
                benefit = Math.min(remainingHp, ((previous === undefined ? followUp : 0) + future) * fraction);
            }
        }
        const contribution = remainingHp === 0 ? 0
            : (benefit - shortenedRounds * 8) * applicationChance(preview);
        return [{ enemyId: enemy.id, buffId: effect.buff.id, duration, shortenedRounds,
            applicationChance: applicationChance(preview), benefit, contribution }];
    });
    return { id: "sakari.attack-debuff-role",
        adjustment: targets.reduce((sum, target) => sum + target.contribution, 0),
        reason: "Malfunction suppresses Potency; Overload enables later damage. Credit only surviving targets and successful applications.",
        details: { targets } };
}

function overconfidenceRule(context: PolicyContext, candidate: SmartCandidate): KitKnowledgeRuleDiagnostic {
    const targets = candidate.targets.flatMap((preview) => {
        const effect = preview.effects.find((effect) => effect.type === "buff"
            && effect.operation === "add" && effect.buff.id === "overconfidence");
        if (effect?.type !== "buff") return [];
        const enemy = context.state.enemies.find(({ id, currHp }) => id === preview.target && currHp > 0);
        const character = context.state.characters.find(({ id }) => id === preview.target);
        if (enemy === undefined && character === undefined) return [];
        const buffs = (enemy ?? character)!.buffs;
        const duration = incrementalDuration(effect.buff, buffs);
        const improvesCurrentRound = duration > 0 && !buffs.some(({ id }) => id === effect.buff.id);
        let offenseBenefit = 0;
        let pressureRisk = 0;
        if (improvesCurrentRound && enemy !== undefined) {
            // Defense -3 enables party follow-ups, but Hit +3 helps this enemy.
            offenseBenefit = Math.min(enemy.currHp,
                followUpDamage(context, "sakari", enemy.id) * 0.3);
            pressureRisk = mitigatedPressure(context, (source) => source.id === enemy.id ? 1 : 0) * 0.3;
        } else if (improvesCurrentRound && character !== undefined) {
            const view = context.actions.find(({ id }) => id === character.id);
            // Do not invent offensive value for incapacitated/skipped allies or
            // attacks already at full reliability. Public accuracy includes Thrillseeker.
            const canAttack = view?.attack.available && (view.available || view.reason === "actorAlreadyActed");
            if (canAttack) {
                for (const info of view.moves) {
                    if (!info.available) continue;
                    for (const target of info.targets) {
                        if (!target.valid || target.accuracy === undefined
                            || !context.state.enemies.some(({ id }) => id === target.target)) continue;
                        const headroom = ((target.accuracy.miss ?? 0) + (target.accuracy.graze ?? 0)) / 100;
                        const damage = previewDamage(target, info.move.hits ?? 1);
                        offenseBenefit = Math.max(offenseBenefit, damage * Math.min(0.3, headroom));
                    }
                }
            }
            pressureRisk = characterIncomingPressure(context, character.id) * 0.3;
        }
        // Future rounds are uncertain; don't multiply a risky setup by all three rounds.
        const contribution = duration === 0 ? 0 : (offenseBenefit - pressureRisk) * applicationChance(preview);
        return [{ target: preview.target, side: enemy === undefined ? "player" : "enemy", duration,
            offenseBenefit, pressureRisk, contribution }];
    });
    return { id: "sakari.overconfidence-tradeoff",
        adjustment: targets.reduce((sum, target) => sum + target.contribution, 0),
        reason: "Balance Hit improvement against Defense loss for the selected side; avoid redundant or unusable setup.",
        details: { targets } };
}

function characterIncomingPressure(context: PolicyContext, characterId: string): number {
    return mitigatedPressure(context, () => 1,
        (effect) => effect.type === "binding" && effect.target === characterId);
}
