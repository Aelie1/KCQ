import type { PolicyContext } from "../../harness";
import type { SmartCandidate } from "../smart";
import { applyBindingEffects, cloneBindingBoard, currentBindingBoard, totalRecoveryDebt } from "../smart-bindings";
import type { KitKnowledgeRuleDiagnostic } from "./kit-knowledge";
import { applicationChance, candidateEffects, incrementalDuration, mitigatedPressure } from "./kit-knowledge-utils";

const EMPOWERMENT_SUBSTITUTION_PENALTY = -80;
// A modest two-basic-attack opportunity cost, in the existing score units.
const POWER_OF_TIME_RESERVE = 60;

export function evaluateNaruyoKnowledge(
    context: PolicyContext,
    candidate: SmartCandidate,
): KitKnowledgeRuleDiagnostic[] {
    if (candidate.action.type !== "move" || candidate.action.actor !== "naruyo") return [];
    const move = candidate.action.move;
    if (move === "precisionStab"
        && context.state.characters.find(({ id }) => id === "naruyo")?.buffs.some(({ id }) => id === "empowerment")
        && context.actions.find(({ id }) => id === "naruyo")?.moves.some(({ move, available }) =>
            available && move.id === "fairyPrecisionStab")) {
        return [{ id: "naruyo.consume-empowerment", adjustment: EMPOWERMENT_SUBSTITUTION_PENALTY,
            reason: "Use the available empowered area attack when choosing Naruyo offense." }];
    }
    if (move === "timeAcceleration") return [accelerationRule(context, candidate)];
    if (move === "snowstorm") return [snowstormRule(context, candidate)];
    if (move !== "temporalLock" && move !== "powerOfTime") return [];

    const effects = candidateEffects(candidate);
    // Weaken changes private rolls, not binding amounts directly. As with Stop,
    // use a conservative pressure fraction rather than reconstructing hidden RNG.
    const preventedPressure = mitigatedPressure(context, (enemy, intention) => {
        const effect = effects.find((effect) => effect.type === "intention"
            && effect.target === enemy.id && effect.move === intention.move
            && (effect.operation === "cancel" || effect.operation === "weaken"));
        return effect?.type !== "intention" ? 0 : effect.operation === "cancel" ? 1
            : effect.operation === "weaken" ? effect.amount : 0;
    });
    const reserve = move === "powerOfTime" ? POWER_OF_TIME_RESERVE : 0;
    return [{
        id: `naruyo.${move === "powerOfTime" ? "power-of-time" : "temporal-lock"}`,
        adjustment: preventedPressure - reserve,
        reason: move === "powerOfTime"
            ? "Spend the one-use Time power when committed cancellation/mitigation warrants its reserve."
            : "Temporal Lock mitigates the selected enemy's unresolved public pressure.",
        details: { preventedPressure, reserve,
            approximation: "Weaken discounts committed pressure by its previewed fraction; private rolls are unavailable." },
    }];
}

function snowstormRule(context: PolicyContext, candidate: SmartCandidate): KitKnowledgeRuleDiagnostic {
    const targets = candidate.targets.flatMap((preview) => {
        const enemy = context.state.enemies.find(({ id, currHp }) => id === preview.target && currHp > 0);
        const effect = preview.effects.find((effect) => effect.type === "buff"
            && effect.operation === "add" && effect.buff.id === "snowstorm");
        if (enemy === undefined || effect?.type !== "buff") return [];
        const duration = incrementalDuration(effect.buff, enemy.buffs);
        const previous = enemy.buffs.find(({ id }) => id === effect.buff.id);
        // Hit reduction also weakens future reliability; Potency reduces effect strength.
        const potencyFraction = Math.min(1, Math.abs(effect.buff.modifiers?.potency ?? 0)
            / Math.max(1, 10 + (enemy.modifiers.potency ?? 0)));
        const hitFraction = Math.abs(effect.buff.modifiers?.hit ?? 0) * 0.01;
        const currentPressure = previous !== undefined ? 0 : mitigatedPressure(context,
            (source) => source.id === enemy.id ? Math.min(1, potencyFraction + hitFraction) : 0);
        const futureRounds = Math.max(0, (effect.buff.duration ?? 1) - Math.max(1, previous?.duration ?? 0));
        const futureControl = futureRounds
            * (Math.abs(effect.buff.modifiers?.hit ?? 0) + Math.abs(effect.buff.modifiers?.potency ?? 0));
        return [{ enemyId: enemy.id, duration, currentPressure, futureControl,
            contribution: (currentPressure + futureControl) * applicationChance(preview) }];
    });
    return { id: "naruyo.snowstorm-suppression", adjustment: targets.reduce((sum, target) => sum + target.contribution, 0),
        reason: "Snowstorm suppresses enemy Hit and Potency; refreshing equivalent duration adds no control.", details: { targets } };
}

function accelerationRule(context: PolicyContext, candidate: SmartCandidate): KitKnowledgeRuleDiagnostic {
    const projected = currentBindingBoard(context.state.characters);
    const characterIds = new Set(context.state.characters.map(({ id }) => id));
    const targets: { characterId: string; recoveryGain: number }[] = [];
    const grants: { characterId: string; amount: number; bestEscape: () => number }[] = [];
    for (const effect of candidateEffects(candidate)) {
        if (effect.type !== "bonus" || effect.amount <= 0) continue;
        const character = context.state.characters.find(({ id }) => id === effect.target);
        const view = context.actions.find(({ id }) => id === effect.target);
        if (character === undefined || view === undefined || !view.escape.available
            || (view.reason !== undefined && view.reason !== "actorAlreadyActed")) continue;
        const escapes = view.escapes.filter(({ available, reason }) => available || reason === "actorAlreadyActed");
        const bestEscape = () => {
            let best = projected;
            let gain = 0;
            for (const escape of escapes) {
                const after = cloneBindingBoard(projected);
                applyBindingEffects(after, escape.effects, characterIds, context.thresholds.max);
                const value = totalRecoveryDebt(projected, context.thresholds) - totalRecoveryDebt(after, context.thresholds);
                if (value > gain) { best = after; gain = value; }
            }
            for (const [id, bindings] of best) projected.set(id, bindings);
            return gain;
        };
        // Existing bonus actions and an unspent ordinary escape already cover some
        // recovery. Naruyo spends her ordinary action casting this move.
        const ordinary = !character.acted && character.id !== "naruyo" ? 1 : 0;
        // bonus.available controls the bonus generated by Standing, not whether
        // an externally granted Time Acceleration token can be spent.
        const standingBonus = ordinary && character.standing && view.bonus.available ? 1 : 0;
        const existing = character.bonusEscapes + ordinary + standingBonus;
        for (let index = 0; index < existing; index += 1) bestEscape();
        grants.push({ characterId: character.id, amount: effect.amount, bestEscape });
    }
    // Allocate all existing actions first, so two recipients assisting the same
    // track cannot make an already-covered binding look like new bonus recovery.
    for (const grant of grants) {
        let recoveryGain = 0;
        for (let index = 0; index < grant.amount; index += 1) recoveryGain += grant.bestEscape();
        targets.push({ characterId: grant.characterId, recoveryGain });
    }
    return { id: "naruyo.time-acceleration-recovery",
        adjustment: targets.reduce((sum, target) => sum + target.recoveryGain, 0),
        reason: "Value extra escapes usable this round after existing action budgets; bonuses expire next round.",
        details: { targets, approximation: "Greedy public escape previews with capped shared binding tracks." } };
}
