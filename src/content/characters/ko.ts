import { damageEnemy } from "../../engine/combat";
import { isEnemy } from "../../engine/helpers";
import { CharacterDef, iEntity, iGameState, MoveDef, PassiveDef } from "../../engine/itypes";
import { GameEvent } from "../../engine/types";

const telekinesis: MoveDef = {
    id: "telekinesis",
    target: "enemy",
    targets: 1,
    type: "mouth",
    activate: function (state: iGameState, actor: iEntity, targets: iEntity[]): GameEvent[] {
        const events: GameEvent[] = []
        const target = targets[0];
        if (isEnemy(target))
            events.push(...damageEnemy(state, target, 10));
        return events;
    },

};

const fairypunch: MoveDef = {
    id: "fairypunch",
    target: "enemy",
    targets: 1,
    type: "arms",
    activate: function (state: iGameState, actor: iEntity, targets: iEntity[]): GameEvent[] {
        const events: GameEvent[] = []
        const target = targets[0];
        if (isEnemy(target))
            events.push(...damageEnemy(state, target, 10));
        return events;
    },

};

const starlight: MoveDef = {
    id: "starlight",
    target: "enemy",
    targets: 0,
    type: "mouth",
    activate: function (state: iGameState, actor: iEntity, targets: iEntity[]): GameEvent[] {
        console.log("used starlight");
        return [];
    },
}

const thousandrestraintsbody: PassiveDef = {
    id: "thousandrestraintsbody"
}

export const ko: CharacterDef = {
    id: "ko",
    moves: [telekinesis, starlight, fairypunch],
    passives: [thousandrestraintsbody]
};
