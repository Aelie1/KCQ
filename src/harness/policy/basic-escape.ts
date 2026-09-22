import type {
    EscapeInfo,
    PlayerAction
} from "../../engine/public/types";
import type {
    FightPolicy,
    PolicyContext,
} from "../harness";
import { chooseBasicAction } from "./basic";

const rescuers = ["matsuko", "hinari"] as const;

export function makeBasicEscapePolicy(threshold: number): FightPolicy {
    return {
        id: `basic${threshold}`,

        chooseAction(context: PolicyContext): PlayerAction {
            for (const actorId of rescuers) {
                const action = chooseRescueAction(context, actorId, threshold);
                if (action) return action;
            }

            return chooseBasicAction(context);
        },
    };
}

function chooseRescueAction(
    context: PolicyContext,
    actorId: string,
    threshold: number,
): PlayerAction | undefined {
    const actor = context.view.characters.find(character => character.id === actorId);
    const actionView = context.view.actions.find(action => action.id === actorId);

    if (!actor || !actionView?.available) return undefined;

    const legalEscapes = actionView.escapes.filter(option => option.available);

    // Finish the "double" once the first escape has already earned a bonus escape.
    if (actor.bonusEscapes > 0) {
        const option = bestEscape(context, legalEscapes, actorId);
        return option ? escapeAction(actorId, option) : undefined;
    }

    // Assist somebody else before worrying about yourself.
    const assist = bestEscape(
        context,
        legalEscapes.filter(option =>
            option.target !== actorId
            && bindingValue(context, option) > threshold
        ),
        actorId,
    );

    if (assist) {
        if (!actor.standing && actionView.stance.available) {
            return { type: "stance", actor: actorId };
        }
        return escapeAction(actorId, assist);
    }

    // Otherwise escape your own dangerous binding.
    const selfEscape = bestEscape(
        context,
        legalEscapes.filter(option =>
            option.target === actorId
            && bindingValue(context, option) > threshold
        ),
        actorId,
    );

    if (selfEscape) {
        if (!actor.standing && actionView.stance.available) {
            return { type: "stance", actor: actorId };
        }
        return escapeAction(actorId, selfEscape);
    }

    return undefined;
}

function bestEscape(
    context: PolicyContext,
    options: readonly EscapeInfo[],
    actorId: string,
): EscapeInfo | undefined {
    return [...options].sort(
        (a, b) => bindingValue(context, b) - bindingValue(context, a),
    )[0];
}

function bindingValue(
    context: PolicyContext,
    option: EscapeInfo,
): number {
    const target = context.view.characters.find(
        character => character.id === option.target,
    );

    return target?.bindings.find(
        binding => binding.id === option.binding,
    )?.value ?? 0;
}

function escapeAction(actor: string, option: EscapeInfo): PlayerAction {
    return {
        type: "escape",
        actor,
        target: option.target,
        binding: option.binding,
    };
}

export const basic50Policy = makeBasicEscapePolicy(50);
export const basic30Policy = makeBasicEscapePolicy(30);
export const basic20Policy = makeBasicEscapePolicy(20);