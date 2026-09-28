import type { BindingId, EntityId } from "../../../engine/public/types";
import type { PolicyContext } from "../../harness";
import {
    addBinding,
    cloneBindingBoard,
    currentBindingBoard,
    totalRecoveryDebt,
} from "../smart-bindings";
import type { SmartCandidate } from "../smart";
import type { KitKnowledgeRuleDiagnostic } from "./kit-knowledge";
import { firstKnownBindingApplication } from "./intention-knowledge";

export const REACTIVE_KNOWLEDGE_WEIGHT = 1;
export const REFLECTED_DAMAGE_VALUE = 1;

const KO = "ko";
const REFLECT = "reflect";
const FAIRY_REFLECT = "fairyReflect";

export interface ReflectableBindingApplication {
    readonly enemyId: EntityId;
    readonly move: string;
    readonly bindingId: BindingId;
    readonly amount: number;
}

export interface ReactiveKnowledgeBreakdown {
    readonly application?: ReflectableBindingApplication;
    readonly normalDebt: number;
    readonly reflectedDebt: number;
    readonly preventedRecoveryDebt: number;
    readonly reflectedDamage: number;
    readonly rules: readonly KitKnowledgeRuleDiagnostic[];
    readonly raw: number;
}

export function evaluateReactiveKnowledge(
    context: PolicyContext,
    candidate: SmartCandidate,
): ReactiveKnowledgeBreakdown {
    const empty: ReactiveKnowledgeBreakdown = {
        normalDebt: 0,
        reflectedDebt: 0,
        preventedRecoveryDebt: 0,
        reflectedDamage: 0,
        rules: [],
        raw: 0,
    };
    if (candidate.action.type !== "move" || candidate.action.actor !== KO
        || (candidate.action.move !== REFLECT && candidate.action.move !== FAIRY_REFLECT)) {
        return empty;
    }

    const application = firstReflectableBindingApplication(context);
    if (application === undefined) return empty;

    const current = currentBindingBoard(context.state.characters);
    const normal = cloneBindingBoard(current);
    addBinding(
        normal,
        KO,
        application.bindingId,
        application.amount,
        context.thresholds.max,
    );
    const reflected = cloneBindingBoard(current);
    const modifiedAmount = candidate.action.move === FAIRY_REFLECT
        ? 0
        : Math.floor(application.amount / 2);
    addBinding(
        reflected,
        KO,
        application.bindingId,
        modifiedAmount,
        context.thresholds.max,
    );
    const normalDebt = totalRecoveryDebt(normal, context.thresholds);
    const reflectedDebt = totalRecoveryDebt(reflected, context.thresholds);
    const preventedRecoveryDebt = Math.max(0, normalDebt - reflectedDebt);
    const source = context.state.enemies.find(({ id }) => id === application.enemyId);
    const reflectedDamage = Math.min(application.amount, source?.currHp ?? application.amount);
    const raw = preventedRecoveryDebt + reflectedDamage * REFLECTED_DAMAGE_VALUE;
    const rules: KitKnowledgeRuleDiagnostic[] = raw > 0
        ? [{
            id: candidate.action.move === FAIRY_REFLECT
                ? "reactive.fairy-reflect-binding"
                : "reactive.reflect-binding",
            adjustment: raw,
            reason: `Catch the first known binding application from ${application.enemyId}; Reflect is single-use.`,
        }]
        : [];
    return {
        application,
        normalDebt,
        reflectedDebt,
        preventedRecoveryDebt,
        reflectedDamage,
        rules,
        raw,
    };
}

/** Reflect is removed immediately after the first positive enemy binding application. */
export function firstReflectableBindingApplication(
    context: PolicyContext,
): ReflectableBindingApplication | undefined {
    return firstKnownBindingApplication(context, KO);
}
