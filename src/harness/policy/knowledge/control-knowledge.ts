import type { Buff, EntityId, ModifierSet } from "../../../engine/public/types";
import type { PolicyContext } from "../../harness";
import type { SmartCandidate } from "../smart";
import type { KitKnowledgeRuleDiagnostic } from "./kit-knowledge";
import type { SmartPressureAssessment } from "./tempo-knowledge";

export const CONTROL_KNOWLEDGE_WEIGHT = 1;
export const STARLIGHT_DURATION = 3;
export const STARLIGHT_HIT_BASE_VALUE = 1;
export const STARLIGHT_HIT_PRESSURE_SCALE = 0.12;
export const STARLIGHT_DEFENSE_VALUE = 1.5;
export const STARLIGHT_REAPPLICATION_MULTIPLIER = 0.1;

const KO = "ko";
const STARLIGHT = "starlightBindings";
const FAIRY_STARLIGHT = "fairyStarlightBindings";
const STARLIGHT_IDS = new Set([STARLIGHT, FAIRY_STARLIGHT]);

export interface StarlightTargetBreakdown {
    readonly enemyId: EntityId;
    readonly enemyPressure: number;
    readonly hitModifier: number;
    readonly defenseModifier: number;
    readonly duration: number;
    readonly alreadyControlled: boolean;
    readonly hitReductionValue: number;
    readonly defenseReductionValue: number;
    readonly contribution: number;
}

export interface ControlKnowledgeBreakdown {
    readonly targets: readonly StarlightTargetBreakdown[];
    readonly rules: readonly KitKnowledgeRuleDiagnostic[];
    readonly raw: number;
}

export function evaluateControlKnowledge(
    context: PolicyContext,
    candidate: SmartCandidate,
    pressure: SmartPressureAssessment,
): ControlKnowledgeBreakdown {
    if (candidate.action.type !== "move" || candidate.action.actor !== KO
        || !STARLIGHT_IDS.has(candidate.action.move)) {
        return { targets: [], rules: [], raw: 0 };
    }

    const pressureByEnemy = new Map(
        pressure.enemies.map((enemy) => [enemy.enemyId, enemy.total] as const),
    );
    const targets: StarlightTargetBreakdown[] = [];
    for (const preview of candidate.targets) {
        if (preview.target === null) continue;
        const enemy = context.state.enemies.find(({ id, currHp }) =>
            id === preview.target && currHp > 0
        );
        if (enemy === undefined) continue;
        const effect = preview.effects.find((value) =>
            value.type === "buff" && value.operation === "add"
                && STARLIGHT_IDS.has(value.buff)
        );
        if (effect?.type !== "buff") continue;
        const modifiers = effect.effects ?? {};
        const hitModifier = Math.min(0, modifiers.hit ?? 0);
        const defenseModifier = Math.min(0, modifiers.defense ?? 0);
        if (hitModifier === 0 && defenseModifier === 0) continue;

        const enemyPressure = pressureByEnemy.get(enemy.id) ?? 0;
        const alreadyControlled = hasUsefulStarlight(enemy.buffs);
        const hitReductionValue = Math.abs(hitModifier) * STARLIGHT_DURATION
            * (STARLIGHT_HIT_BASE_VALUE + enemyPressure * STARLIGHT_HIT_PRESSURE_SCALE);
        const defenseReductionValue = Math.abs(defenseModifier) * STARLIGHT_DURATION
            * STARLIGHT_DEFENSE_VALUE;
        const multiplier = alreadyControlled ? STARLIGHT_REAPPLICATION_MULTIPLIER : 1;
        targets.push({
            enemyId: enemy.id,
            enemyPressure,
            hitModifier,
            defenseModifier,
            duration: STARLIGHT_DURATION,
            alreadyControlled,
            hitReductionValue,
            defenseReductionValue,
            contribution: (hitReductionValue + defenseReductionValue) * multiplier,
        });
    }

    const raw = targets.reduce((total, target) => total + target.contribution, 0);
    const rules: KitKnowledgeRuleDiagnostic[] = raw > 0
        ? [{
            id: targets.some(({ alreadyControlled }) => alreadyControlled)
                ? "control.starlight-reapplication"
                : "control.starlight",
            adjustment: raw,
            reason: `Starlight applies public hit/defense control to ${targets.length} meaningful target(s).`,
        }]
        : [];
    return { targets, rules, raw };
}

function hasUsefulStarlight(buffs: readonly Buff[]): boolean {
    return buffs.some((buff) =>
        STARLIGHT_IDS.has(buff.id)
        && (buff.duration ?? 0) > 1
        && equivalentStarlightModifiers(buff.modifiers)
    );
}

function equivalentStarlightModifiers(modifiers: Readonly<ModifierSet> | undefined): boolean {
    return (modifiers?.hit ?? 0) <= -2 && (modifiers?.defense ?? 0) <= -2;
}
