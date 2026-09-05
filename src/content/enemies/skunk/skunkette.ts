import { Enemy, GameAction, GameState } from "../../../engine/types";

export const skunkette: Enemy = {
    id: "skunkette",
    hp: 20,
    defense: 10,
    moves: [],
    passives: [],
    ai: function (state: GameState): GameAction {
        throw new Error("Function not implemented.");
    }
}