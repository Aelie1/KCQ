import type { PlayerAction, ValidityInfo } from "../../engine/public/types";
import type { FightPolicy, PolicyContext } from "../harness";

export const firstPolicy: FightPolicy = {
    id: "first",
    chooseAction(context: PolicyContext): PlayerAction {
        for (const actionView of context.view.actions) {
            if (!actionView.available) {
                continue;
            }

            const move = actionView.moves.find((candidate) => candidate.available);
            if (!move) {
                continue;
            }

            return {
                type: "move",
                actor: actionView.id,
                move: move.move.id,
                targets: firstTargets(move.move.targets, move.targets),
            };
        }

        return { type: "endTurn" };
    },
};

export function firstTargets(
    targetCount: number | "all",
    candidates: readonly ValidityInfo[],
): string[] {
    if (targetCount === 0 || targetCount === "all") {
        return [];
    }

    return candidates
        .filter((candidate) => candidate.valid && candidate.target !== null)
        .map((candidate) => candidate.target as string)
        .slice(0, targetCount);
}
