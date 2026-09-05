import { Character, EntityId, GameState, Move, Passive } from "../../engine/types";

const telekinesis: Move = {
    id: "telekinesis",
    target: "enemy",
    targets: 1,
    type: "mystical",
    activate: function (state: GameState, actor: EntityId, targets: EntityId[]): void {
        throw new Error("Function not implemented.");
    }
};

const starlight: Move = {
    id: "starlight",
    target: "enemy",
    targets: 0,
    type: "mystical",
    activate: function (state: GameState, actor: EntityId, targets: EntityId[]): void {
        throw new Error("Function not implemented.");
    }
}

const thousandrestraintsbody: Passive = {
    id: "thousandrestraintsbody"
}

export const ko: Character = {
    id: "ko",
    moves: [telekinesis, starlight],
    passives: [thousandrestraintsbody]
};
