import { EnemyDef, iGameState } from "../../../engine/itypes";
import { GameAction } from "../../../engine/types";

export const skunkette: EnemyDef = {
    id: "skunkette",
    hp: 20,
    defense: 10,
    moves: [],
    passives: [],
    ai: function (state: iGameState): GameAction {
        throw new Error("Function not implemented.");
    }
}