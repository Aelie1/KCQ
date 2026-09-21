import type { PlayerAction } from "../../engine/public/types";
import type { FightPolicy, PolicyContext } from "../harness";
import { firstTargets } from "./first";

const programmedMoves: Readonly<Record<string, string>> = {
    ko: "telekinesis",
    matsuko: "whiteFlame",
    hinari: "rockfall",
};

export const basicPolicy: FightPolicy = {
    id: "basic",
    chooseAction(context: PolicyContext): PlayerAction {
        for (const actionView of context.view.actions) {
            if (!actionView.available) {
                continue;
            }

            const programmedMove = programmedMoves[actionView.id];
            if (!programmedMove) {
                continue;
            }

            const move = actionView.moves.find(
                (candidate) => candidate.move.id === programmedMove && candidate.available,
            );
            if (!move) {
                continue;
            }

            return {
                type: "move",
                actor: actionView.id,
                move: programmedMove,
                targets: firstTargets(move.move.targets, move.targets),
            };
        }

        return { type: "endTurn" };
    },
};
