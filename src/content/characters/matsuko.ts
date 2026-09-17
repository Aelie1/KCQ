import { CharacterDef, MoveDef } from "../../engine/protected/definitions";
import { findBuff, isEnemy } from "../../engine/protected/helpers";
import { iBuff, iCharacter, iEffect, iEntity, iGameState, iMove, iTargetInfo } from "../../engine/protected/types";


const PUNCH_DAMAGE = 100;
const KICK_DAMAGE = 100;
const WHITE_FLAME_DAMAGE = 100;
const PHOENIX_KICK_DAMAGE = 100;
const IMMOLATION_DAMAGE = 200;

export const matsuko: CharacterDef = {
    id: "matsuko",
    getMoves: function (actor: iCharacter): MoveDef[] {
        const buff = findBuff(actor, "burnout");
        if (buff) {
            return [punch, kick];
        }
        else {
            return [whiteFlame, phoenixKick, immolation];
        }
    },
    passives: []
};

const punch: MoveDef = {
    id: "punch",
    targetSide: "enemy",
    targets: 1,
    baseDamage: PUNCH_DAMAGE,
    type: "arms",
    accuracy: {
        miss: 10,
        graze: 15,
        hit: 65,
        crit: 10
    },
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
    }
}

const kick: MoveDef = {
    id: "kick",
    targetSide: "enemy",
    targets: 1,
    baseDamage: KICK_DAMAGE,
    type: "legs",
    accuracy: {
        miss: 10,
        graze: 15,
        hit: 65,
        crit: 10
    },
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
    }
}

const whiteFlame: MoveDef = {
    id: "whiteFlame",
    targetSide: "enemy",
    targets: 1,
    baseDamage: WHITE_FLAME_DAMAGE,
    type: "arms",
    accuracy: {
        miss: 10,
        graze: 15,
        hit: 65,
        crit: 10
    },
    modifiers: { hit: 2 },
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
    }
}

const phoenixKick: MoveDef = {
    id: "phoenixKick",
    targetSide: "enemy",
    targets: 1,
    baseDamage: PHOENIX_KICK_DAMAGE,
    type: "legs",
    accuracy: {
        miss: 10,
        graze: 15,
        hit: 65,
        crit: 10
    },
    modifiers: { potency: 2 },
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
    }
}

const immolation: MoveDef = {
    id: "immolation",
    targetSide: "enemy",
    targets: "all",
    baseDamage: IMMOLATION_DAMAGE,
    type: "none",
    accuracy: {
        miss: 10,
        graze: 15,
        hit: 65,
        crit: 10
    },
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

        const buff: iBuff = {
            id: "burnout",
            active: true,
        }

        effects.push({
            type: "buff",
            target: actor,
            buff: buff,
            operation: "add"
        });
        return effects;
    }
}


