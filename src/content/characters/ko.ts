import { isEnemy } from "../../engine/protected/helpers";
import { CharacterDef, iEffect, iEntity, iGameState, iMove, iTargetInfo, MoveDef, PassiveDef } from "../../engine/protected/itypes";

const telekinesis: MoveDef = {
    id: "telekinesis",
    side: "enemy",
    targets: 1,
    baseDamage: 100,
    type: "mouth",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        for (const target of targets) {
            if (isEnemy(target.target)) {
                effects.push({
                    type: "damage",
                    source: actor,
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
    side: "enemy",
    targets: "all",
    baseDamage: 100,
    type: "arms",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        for (const target of targets) {
            if (isEnemy(target.target)) {
                effects.push({
                    type: "damage",
                    source: actor,
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
    side: "none",
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
