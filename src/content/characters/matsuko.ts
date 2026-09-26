import { CharacterDef, MoveDef } from "../../engine/protected/definitions";
import { basicDamageEffect, basicPlayerAccuracy, findBuff, isCharacter, isEnemy } from "../../engine/protected/helpers";
import { s } from "../../engine/protected/status";
import { servitude } from "../../engine/protected/statuses";
import { iBuff, iEntity, iGameState, iMove, iMoveResult, iTargetInfo } from "../../engine/protected/types";
import { FailureReason } from "../../engine/public/types";
import { removeEmpowerment } from "./ko";


const PUNCH_DAMAGE = 30;

const KICK_DAMAGE = 30;

const WHITE_FLAME_DAMAGE = 30;

const PHOENIX_KICK_DAMAGE = 30;

const IMMOLATION_DAMAGE = 75;
const IMMOLATION_BUFF = "burnout";

const OBEY_BUFF = "servitude";
const OBEY_BUFF_DURATION = 2;
const OBEY_COMPULSION_COOLDOWN = 3;

const STOP_COMPULSION_COOLDOWN = 5;
const STOP_BOSS_WEAKEN = 0.25;

const ATTACKME_COMPULSION_COOLDOWN = 2;

const DEFAULT_COMPULSION_COOLDOWN = 2;

const punch: MoveDef = {
    id: "punch",
    index: 1,
    targetSide: "enemy",
    targets: 1,
    baseDamage: PUNCH_DAMAGE,
    type: "arms",
    accuracy: basicPlayerAccuracy,
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicDamageEffect(actor, move, targets);
    }
}

const kick: MoveDef = {
    id: "kick",
    index: 2,
    targetSide: "enemy",
    targets: 1,
    baseDamage: KICK_DAMAGE,
    type: "legs",
    accuracy: basicPlayerAccuracy,
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicDamageEffect(actor, move, targets);
    }
}

const whiteFlame: MoveDef = {
    id: "whiteFlame",
    index: 3,
    targetSide: "enemy",
    targets: 1,
    baseDamage: WHITE_FLAME_DAMAGE,
    type: "arms",
    accuracy: basicPlayerAccuracy,
    modifiers: { hit: 2 },
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicDamageEffect(actor, move, targets);
    }
}

const fairyWhiteFlame: MoveDef = {
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

const phoenixKick: MoveDef = {
    id: "phoenixKick",
    index: 5,
    targetSide: "enemy",
    targets: 1,
    baseDamage: PHOENIX_KICK_DAMAGE,
    type: "legs",
    accuracy: basicPlayerAccuracy,
    modifiers: { potency: 2 },
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicDamageEffect(actor, move, targets);
    }
}

const fairyPhoenixKick: MoveDef = {
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

const immolation: MoveDef = {
    id: "immolation",
    index: 7,
    targetSide: "enemy",
    targets: "all",
    baseDamage: IMMOLATION_DAMAGE,
    type: "none",
    accuracy: basicPlayerAccuracy,
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

const obey: MoveDef = {
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

const stop: MoveDef = {
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

const attackMe: MoveDef = {
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
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        if (!isCharacter(actor)) {
            return result;
        }

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
