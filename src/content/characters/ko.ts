import { isEnemy } from "../../engine/helpers";
import { CharacterDef, iEffect, iEntity, iGameState, iMove, iTargetInfo, MoveDef, PassiveDef } from "../../engine/itypes";

const telekinesis: MoveDef = {
    id: "telekinesis",
    target: "enemy",
    targets: 1,
    baseDamage: 10,
    type: "mouth",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = []
        for (const target of targets) {
            if (isEnemy(target.target)) {
                effects.push({
                    type: "damage",
                    target: target.target,
                    amount: ((this.baseDamage ?? 1) * target.effectiveness)
                });
            }
        }
        return effects;
    },
    accuracy: {
        miss: 10,
        graze: 15,
        hit: 65,
        crit: 10
    },

}

const fairypunch: MoveDef = {
    id: "fairypunch",
    target: "enemy",
    targets: "all",
    baseDamage: 10,
    type: "arms",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = []
        for (const target of targets) {
            if (isEnemy(target.target)) {
                effects.push({
                    type: "damage",
                    target: target.target,
                    amount: ((this.baseDamage ?? 1) * target.effectiveness)
                });
            }
        }
        return effects;
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
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
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
