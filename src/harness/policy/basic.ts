import type { PlayerAction, PreviewInfo } from "../../engine/public/types";
import type { FightPolicy, PolicyContext } from "../harness";

export function firstTargets(
    targetCount: number | "all",
    candidates: readonly PreviewInfo[],
): string[] {
    if (targetCount === 0 || targetCount === "all") {
        return [];
    }

    return candidates
        .filter((candidate) => candidate.valid && candidate.target !== null)
        .map((candidate) => candidate.target as string)
        .slice(0, targetCount);
}

const programmedMoves: Readonly<Record<string, string>> = {
    ko: "telekinesis",
    matsuko: "whiteFlame",
    hinari: "rockfall",
};

export function chooseBasicAction(context: PolicyContext): PlayerAction {
    for (const actionView of context.actions) {
        if (!actionView.available) continue;

        const programmedMove = programmedMoves[actionView.id];
        if (!programmedMove) continue;

        const move = actionView.moves.find(
            candidate => candidate.move.id === programmedMove && candidate.available,
        );
        if (!move) continue;

        return {
            type: "move",
            actor: actionView.id,
            move: programmedMove,
            targets: firstTargets(move.move.targets, move.targets),
        };
    }

    return { type: "endTurn" };
}

export const basicPolicy: FightPolicy = {
    id: "basic",
    chooseAction: chooseBasicAction,
};