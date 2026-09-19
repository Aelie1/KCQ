import type { PlayerAction } from "../../engine/public/types";
import type { FightPolicy, PolicyContext } from "../harness";
import { firstTargets } from "./first";

const programmedMoves: Readonly<Record<string, string>> = {
    ko: "telekinesis",
    matsuko: "whiteFlame",
    hinari: "rockfall",
};

export const swingOnlyPolicy: FightPolicy = {
    id: "swing-only",
    chooseAction(context: PolicyContext): PlayerAction {
        for (const character of context.availability) {
            if (!character.available) {
                continue;
            }

            const programmedMove = programmedMoves[character.id];
            if (!programmedMove) {
                continue;
            }

            const move = context.getMoves(character.id).find(
                (candidate) => candidate.move.id === programmedMove && candidate.available,
            );
            if (!move) {
                continue;
            }

            return {
                type: "move",
                actor: character.id,
                move: programmedMove,
                targets: firstTargets(move.move.targets, move.targets),
            };
        }

        return { type: "endTurn" };
    },
};
