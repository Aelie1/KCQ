import { CharacterDefinition, EntityId, GameState, MoveDefinition, PassiveDefinition } from "../../engine/types";

const telekinesis: MoveDefinition = {
    id: "telekinesis",
    target: "enemy",
    targets: 1,
    type: "mystical",
    activate: function (state: GameState, actor: EntityId, targets: EntityId[]): void {
        throw new Error("Function not implemented.");
    }
};

const starlight: MoveDefinition = {
    id: "starlight",
    target: "enemy",
    targets: 0,
    type: "mystical",
    activate: function (state: GameState, actor: EntityId, targets: EntityId[]): void {
        throw new Error("Function not implemented.");
    }
}

const thousandrestraintsbody: PassiveDefinition = {
    id: "thousandrestraintsbody"
}

export const ko: CharacterDefinition = {
    id: "ko",
    moves: [telekinesis, starlight],
    passives: [thousandrestraintsbody]
};
