import { CharacterDef, MoveDef } from "../../engine/protected/definitions";
import { findBuff, isCharacter, isEnemy } from "../../engine/protected/helpers";
import { s } from "../../engine/protected/status";
import { servitude } from "../../engine/protected/statuses";
import { iBuff, iCharacter, iEffect, iEntity, iGameState, iMove, iTargetInfo } from "../../engine/protected/types";


const PUNCH_DAMAGE = 100;

const KICK_DAMAGE = 100;

const WHITE_FLAME_DAMAGE = 100;

const PHOENIX_KICK_DAMAGE = 100;

const IMMOLATION_DAMAGE = 200;

const OBEY_SERVITUDE_DURATION = 2;
const OBEY_COMPULSION_COOLDOWN = 3;

const STOP_COMPULSION_COOLDOWN = 3;
const STOP_BOSS_WEAKEN = 0.25;

const ATTACKME_COMPULSION_COOLDOWN = 2;

export const matsuko: CharacterDef = {
    id: "matsuko",
    getMoves: function (actor: iCharacter): MoveDef[] {
        const moves: MoveDef[] = [];
        const burnoutBuff = findBuff(actor, "burnout");
        if (burnoutBuff) {
            moves.push(...[punch, kick]);
        }
        else {
            moves.push(...[whiteFlame, phoenixKick, immolation]);
        }
        const compulsionBuff = findBuff(actor, "compulsionCD");
        if (!compulsionBuff) {
            moves.push(...[obey, stop, attackMe]);
        }
        return moves;
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

        const burnoutBuff: iBuff = {
            id: "burnout",
            active: true,
        }

        effects.push({
            type: "buff",
            target: actor,
            buff: burnoutBuff,
            operation: "add"
        });
        return effects;
    }
}

const obey: MoveDef = {
    id: "obey",
    targetSide: "player",
    targets: 1,
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];

        const servitudeBuff: iBuff = {
            id: "servitude",
            duration: OBEY_SERVITUDE_DURATION,
            active: true,
            statuses: [s(servitude, 1)]
        }

        for (const target of targets) {
            if (isCharacter(target.target)) {
                effects.push({
                    type: "buff",
                    target: target.target,
                    buff: servitudeBuff,
                    operation: "add"
                });
                effects.push({
                    type: "refresh",
                    target: target.target,
                });
            }
        }

        const cooldownBuff: iBuff = {
            id: "compulsionCD",
            active: true,
            duration: OBEY_COMPULSION_COOLDOWN,
        }

        effects.push({
            type: "buff",
            target: actor,
            buff: cooldownBuff,
            operation: "add"
        });

        return effects;
    }
}

const stop: MoveDef = {
    id: "stop",
    targetSide: "enemy",
    targets: 1,
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];

        if (!isCharacter(actor)) {
            return effects;
        }

        for (const target of targets) {
            if (isEnemy(target.target)) {
                effects.push({
                    type: "intention",
                    operation: "remove",
                    target: target.target,
                    amount: STOP_BOSS_WEAKEN
                });
            }
        }

        const cooldownBuff: iBuff = {
            id: "compulsionCD",
            active: true,
            duration: STOP_COMPULSION_COOLDOWN,
        }

        effects.push({
            type: "buff",
            target: actor,
            buff: cooldownBuff,
            operation: "add"
        });

        return effects;
    }
}

const attackMe: MoveDef = {
    id: "attackMe",
    targetSide: "enemy",
    targets: "all",
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];

        if (!isCharacter(actor)) {
            return effects;
        }

        for (const target of targets) {
            if (isEnemy(target.target)) {
                effects.push({
                    type: "intention",
                    operation: "target",
                    target: target.target,
                    destination: actor,
                });
            }
        }

        const cooldownBuff: iBuff = {
            id: "compulsionCD",
            active: true,
            duration: ATTACKME_COMPULSION_COOLDOWN,
        }

        effects.push({
            type: "buff",
            target: actor,
            buff: cooldownBuff,
            operation: "add"
        });

        return effects;
    }
}

