import type { PlayerAction } from "../../engine/public/types";
import type { FightPolicy, PolicyContext } from "../harness";

export const idlePolicy: FightPolicy = {
    id: "idle",

    chooseAction(_context: PolicyContext): PlayerAction {
        return { type: "endTurn" };
    },
};