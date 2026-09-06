import { damageEnemy } from "../../engine/combat";
import { isEnemy } from "../../engine/helpers";
import { CharacterDef, iEntity, iGameState, MoveDef, PassiveDef } from "../../engine/itypes";
import { GameEvent } from "../../engine/types";

const telekinesis: MoveDef = {
    id: "telekinesis",
    target: "enemy",
    targets: 1,
    type: "mystical",
    activate: function (state: iGameState, actor: iEntity, targets: iEntity[]): GameEvent[] {
        const events: GameEvent[] = []
        const target = targets[0];
        if (isEnemy(target))
            events.push(...damageEnemy(state, target, 10));
        return events;
    },
    isValid: function (state: iGameState, actor: iEntity, targets: iEntity[]): boolean {
        if (targets.length !== 1) {
            return false;
        }
        if (!isEnemy(targets[0])) {
            return false;
        }
        return true;
    }

};

const starlight: MoveDef = {
    id: "starlight",
    target: "enemy",
    targets: 0,
    type: "mystical",
    activate: function (state: iGameState, actor: iEntity, targets: iEntity[]): GameEvent[] {
        console.log("used starlight");
        return [];
    },
    isValid: function (state: iGameState, actor: iEntity, targets: iEntity[]): boolean {
        return true;
    }
}

const thousandrestraintsbody: PassiveDef = {
    id: "thousandrestraintsbody"
}

export const ko: CharacterDef = {
    id: "ko",
    moves: [telekinesis, starlight],
    passives: [thousandrestraintsbody]
};
