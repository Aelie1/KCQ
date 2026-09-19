import type {
    ActionInfo,
    EntityId,
    PlayerAction,
    ValidityInfo,
} from "../../engine/public/types";
import type { FightPolicy, PolicyContext, PolicyRandom } from "../harness";

type ActionCandidate =
    | { type: "move"; actor: EntityId; info: ActionInfo }
    | Exclude<PlayerAction, { type: "move" } | { type: "endTurn" }>;

export const randomPolicy: FightPolicy = {
    id: "random",
    chooseAction(context: PolicyContext): PlayerAction {
        const candidates: ActionCandidate[] = [];

        for (const actionView of context.view.actions) {
            if (!actionView.available) {
                continue;
            }

            for (const info of actionView.moves) {
                if (info.available && hasEnoughTargets(info)) {
                    candidates.push({ type: "move", actor: actionView.id, info });
                }
            }

            for (const escape of actionView.escapes) {
                if (escape.available) {
                    candidates.push({
                        type: "escape",
                        actor: actionView.id,
                        target: escape.target,
                        binding: escape.binding,
                    });
                }
            }

            if (actionView.stance.available) {
                candidates.push({ type: "stance", actor: actionView.id });
            }
        }

        if (candidates.length === 0) {
            return { type: "endTurn" };
        }

        const selected = candidates[context.random.integer(candidates.length)];
        if (selected.type !== "move") {
            return selected;
        }

        return {
            type: "move",
            actor: selected.actor,
            move: selected.info.move.id,
            targets: randomTargets(
                selected.info.move.targets,
                selected.info.targets,
                context.random,
            ),
        };
    },
};

function hasEnoughTargets(info: ActionInfo): boolean {
    if (info.move.targets === 0 || info.move.targets === "all") {
        return true;
    }
    return validTargetIds(info.targets).length >= info.move.targets;
}

function randomTargets(
    targetCount: number | "all",
    candidates: readonly ValidityInfo[],
    random: PolicyRandom,
): string[] {
    if (targetCount === 0 || targetCount === "all") {
        return [];
    }

    const remaining = validTargetIds(candidates);
    const selected: string[] = [];
    while (selected.length < targetCount) {
        const index = random.integer(remaining.length);
        selected.push(remaining[index]);
        remaining.splice(index, 1);
    }
    return selected;
}

function validTargetIds(candidates: readonly ValidityInfo[]): string[] {
    return [...new Set(candidates
        .filter((candidate) => candidate.valid && candidate.target !== null)
        .map((candidate) => candidate.target as string))];
}
