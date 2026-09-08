import { damageEnemy } from "../../engine/combat";
import { isEnemy } from "../../engine/helpers";
import { CharacterDef, DamageMoveDef, iEntity, iGameState, MoveDef, PassiveDef, TargetInfo } from "../../engine/itypes";
import { GameEvent } from "../../engine/types";

const telekinesis: DamageMoveDef = {
    id: "telekinesis",
    target: "enemy",
    targets: 1,
    baseDamage: 10,
    type: "mouth",
    activate: function (state: iGameState, actor: iEntity, targets: TargetInfo[]): GameEvent[] {
        const events: GameEvent[] = []
        const target = targets[0].target;
        const effectiveness = targets[0].effectiveness;
        if (isEnemy(target))
            events.push(...damageEnemy(state, target, this.baseDamage*effectiveness));
        return events;
    },
    accuracy: {
        miss: 10,
        graze: 15,
        hit: 65,
        crit: 10
    },

}

const fairypunch: DamageMoveDef = {
    id: "fairypunch",
    target: "enemy",
    targets: "all",
    baseDamage: 10,
    type: "arms",
    activate: function (state: iGameState, actor: iEntity, targets: TargetInfo[]): GameEvent[] {
        const events: GameEvent[] = []
        const target = targets[0].target;
        const effectiveness = targets[0].effectiveness;
        if (isEnemy(target))
            events.push(...damageEnemy(state, target, this.baseDamage*effectiveness));
        return events;
    },
    accuracy: {
        miss: 10,
        graze: 15,
        hit: 65,
        crit: 10
    },

}

const starlight: MoveDef = {
    id: "starlight",
    target: "enemy",
    targets: 0,
    type: "mouth",
    activate: function (state: iGameState, actor: iEntity, targets: TargetInfo[]): GameEvent[] {
        console.log("used starlight");
        return [];
    },
    accuracy: {
        miss: 10,
        graze: 15,
        hit: 65,
        crit: 10
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
