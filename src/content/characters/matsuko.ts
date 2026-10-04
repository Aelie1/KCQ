import { CharacterDef, MoveDef } from "../../engine/protected/definitions";
import { findBuff, isCharacter, isEnemy } from "../../engine/protected/helpers";
import { basicDamageEffect, basicPlayerAccuracy } from "../../engine/protected/mechanics";
import { s } from "../../engine/protected/status";
import { servitude } from "../../engine/protected/statuses";
import { iBuff, iEntity, iGameState, iMove, iMoveResult, iTargetInfo } from "../../engine/protected/types";
import { FailureReason } from "../../engine/public/types";
import { removeEmpowerment } from "./ko";


const PUNCH_DAMAGE = 30;

const KICK_DAMAGE = 30;

const WHITE_FLAME_DAMAGE = 30;
const WHITE_FLAME_HIT = 2;

const PHOENIX_KICK_DAMAGE = 30;
const PHOENIX_KICK_POTENCY = 3;

const IMMOLATION_DAMAGE = 75;
const IMMOLATION_BUFF = "burnout";

const OBEY_BUFF = "servitude";
const OBEY_BUFF_DURATION = 2;
const OBEY_COMPULSION_COOLDOWN = 3;

const STOP_COMPULSION_COOLDOWN = 5;
const STOP_BOSS_WEAKEN = 0.25;

const ATTACKME_COMPULSION_COOLDOWN = 2;
const ATTACKME_BUFF = "defenseBarrier";

const DEFAULT_COMPULSION_COOLDOWN = 2;

export const punch: MoveDef = {
    id: "punch",
    index: 1,
    targetSide: "enemy",
    targets: 1,
    baseDamage: PUNCH_DAMAGE,
    type: "arms",
    accuracy: basicPlayerAccuracy,
    traits: ["damage"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicDamageEffect(actor, move, targets);
    }
}

export const kick: MoveDef = {
    id: "kick",
    index: 2,
    targetSide: "enemy",
    targets: 1,
    baseDamage: KICK_DAMAGE,
    type: "legs",
    accuracy: basicPlayerAccuracy,
    traits: ["damage"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicDamageEffect(actor, move, targets);
    }
}

export const whiteFlame: MoveDef = {
    id: "whiteFlame",
    index: 3,
    targetSide: "enemy",
    targets: 1,
    baseDamage: WHITE_FLAME_DAMAGE,
    type: "arms",
    accuracy: basicPlayerAccuracy,
    modifiers: { hit: WHITE_FLAME_HIT },
    traits: ["damage"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicDamageEffect(actor, move, targets);
    }
}

export const fairyWhiteFlame: MoveDef = {
    ...whiteFlame,
    id: "fairyWhiteFlame",
    index: 4,
    targets: "all",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result = whiteFlame.resolve(state, actor, move, targets);
        result.effects.push(...removeEmpowerment(actor));
        return result;
    }
}

export const phoenixKick: MoveDef = {
    id: "phoenixKick",
    index: 5,
    targetSide: "enemy",
    targets: 1,
    baseDamage: PHOENIX_KICK_DAMAGE,
    type: "legs",
    accuracy: basicPlayerAccuracy,
    modifiers: { potency: PHOENIX_KICK_POTENCY },
    traits: ["damage"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicDamageEffect(actor, move, targets);
    }
}

export const fairyPhoenixKick: MoveDef = {
    ...phoenixKick,
    id: "fairyPhoenixKick",
    index: 6,
    baseHits: 2,
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result = phoenixKick.resolve(state, actor, move, targets);
        result.effects.push(...removeEmpowerment(actor));
        return result;
    }
}

export const immolation: MoveDef = {
    id: "immolation",
    index: 7,
    targetSide: "enemy",
    targets: "all",
    baseDamage: IMMOLATION_DAMAGE,
    type: "none",
    accuracy: basicPlayerAccuracy,
    traits: ["damage", "onetime", "escape"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result = basicDamageEffect(actor, move, targets);

        if (!isCharacter(actor)) {
            return result;
        }
        for (const binding of actor.bindings) {
            result.effects.push({
                type: "binding",
                binding: binding.definition,
                source: actor,
                target: actor,
                amount: -Math.ceil(binding.value / 2)
            });
        }
        const burnoutBuff: iBuff = {
            id: IMMOLATION_BUFF,
            active: true,
            moveList: { addedMoves: [punch, kick], blockedMoves: [whiteFlame, fairyWhiteFlame, phoenixKick, fairyPhoenixKick, immolation] }
        }

        result.effects.push({
            type: "buff",
            target: actor,
            buff: burnoutBuff,
            operation: "add"
        });
        return result;
    }
}

export const obey: MoveDef = {
    id: "obey",
    index: 8,
    targetSide: "player",
    targets: 1,
    type: "mouth",
    freeOnHit: true,
    cooldown: {
        "stop": DEFAULT_COMPULSION_COOLDOWN,
        "obey": OBEY_COMPULSION_COOLDOWN,
        "attackMe": DEFAULT_COMPULSION_COOLDOWN
    },
    traits: ["debuff", "refresh"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        const servitudeBuff: iBuff = {
            id: OBEY_BUFF,
            duration: OBEY_BUFF_DURATION,
            active: true,
            statuses: [s(servitude, 1)]
        }

        for (const target of targets) {
            if (isCharacter(target.target)) {
                result.targets.push({
                    target: target.target,
                    result: target.band,
                    effects: [{
                        type: "buff",
                        target: target.target,
                        buff: servitudeBuff,
                        operation: "add"
                    },
                    {
                        type: "refresh",
                        target: target.target,
                    }]
                });
            }
        }

        return result;
    },
    isValidTarget: function (move: MoveDef, target: iEntity | null): FailureReason | undefined {
        if (target !== null && (!isCharacter(target) || !target.acted || findBuff(target, "servitude"))) {
            return "invalidTarget";
        }
    }
}

export const stop: MoveDef = {
    id: "stop",
    index: 9,
    targetSide: "enemy",
    targets: 1,
    type: "mouth",
    freeOnHit: true,
    cooldown: {
        "stop": STOP_COMPULSION_COOLDOWN,
        "obey": DEFAULT_COMPULSION_COOLDOWN,
        "attackMe": DEFAULT_COMPULSION_COOLDOWN
    },
    traits: ["debuff"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        for (const target of targets) {
            if (isEnemy(target.target)) {
                result.targets.push({
                    target: target.target,
                    result: target.band,
                    effects: [{
                        type: "intention",
                        operation: "cancel",
                        target: target.target,
                        amount: STOP_BOSS_WEAKEN
                    }]
                });
            }
        }

        return result;
    }
}

export const attackMe: MoveDef = {
    id: "attackMe",
    index: 10,
    targetSide: "enemy",
    targets: "all",
    type: "mouth",
    freeOnHit: true,
    cooldown: {
        "stop": DEFAULT_COMPULSION_COOLDOWN,
        "obey": DEFAULT_COMPULSION_COOLDOWN,
        "attackMe": ATTACKME_COMPULSION_COOLDOWN
    },
    traits: ["buff"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        if (!isCharacter(actor)) {
            return result;
        }


        const transformBuff: iBuff = {
            id: ATTACKME_BUFF,
            active: true,
            duration: 1,
            modifiers: {
                defense: 3,
            }
        }

        result.effects.push({
            type: "buff",
            target: actor,
            buff: transformBuff,
            operation: "add"
        });

        for (const target of targets) {
            if (isEnemy(target.target)) {
                result.targets.push({
                    target: target.target,
                    result: target.band,
                    effects: [{
                        type: "intention",
                        operation: "target",
                        target: target.target,
                        destination: actor,
                    }]
                });
            }
        }

        return result;
    }
}

export const matsuko: CharacterDef = {
    id: "matsuko",
    moves: [whiteFlame, phoenixKick, immolation, obey, stop, attackMe],
    empoweredMoves: [fairyWhiteFlame, fairyPhoenixKick],
    passives: []
};
