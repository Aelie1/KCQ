import { CharacterDef, MoveDef, PassiveDef } from "../../engine/protected/definitions";
import { isCharacter, isEnemy } from "../../engine/protected/helpers";
import { basicDamageEffect, basicPlayerAccuracy, tr } from "../../engine/protected/mechanics";
import { ContentCatalogFragment, iBuff, iEntity, iGameState, iMove, iMoveResult, iTargetInfo } from "../../engine/protected/types";
import { removeEmpowerment } from "./ko";

const PRECISION_STAB_DAMAGE = 30;
const PRECISION_STAB_HIT = 3;

const SNOWSTORM_BUFF = "snowstorm";
const SNOWSTORM_MODIFIER = -2;
const SNOWSTORM_DURATION = 2;

const TIME_ACCELERATION_AMOUNT = 1;

const TEMPORAL_LOCK_WEAKEN = 0.25;

const POWER_OF_TIME_BUFF = "chronostasis";
const POWER_OF_TIME_BOSS_WEAKEN = 0.4;

export const expertArtisan: PassiveDef = {
    id: "expertArtisan",
    status: { flags: ["allowAssist"] }
}

export const precisionStab: MoveDef = {
    id: "precisionStab",
    index: 1,
    targetSide: "enemy",
    targets: 1,
    baseDamage: PRECISION_STAB_DAMAGE,
    type: "legs",
    accuracy: basicPlayerAccuracy,
    modifiers: { hit: PRECISION_STAB_HIT },
    traits: ["damage"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicDamageEffect(actor, move, targets);
    }
}


export const fairyPrecisionStab: MoveDef = {
    ...precisionStab,
    id: "fairyPrecisionStab",
    index: 2,
    targets: "all",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result = precisionStab.resolve(state, actor, move, targets);
        result.effects.push(...removeEmpowerment(actor));
        return result;
    }
}

export const snowstorm: MoveDef = {
    id: "snowstorm",
    libraryEffects: [{ id: SNOWSTORM_BUFF, recipient: "selected", duration: SNOWSTORM_DURATION, modifiers: { hit: SNOWSTORM_MODIFIER, potency: SNOWSTORM_MODIFIER } }],
    index: 3,
    targetSide: "enemy",
    targets: "all",
    type: "arms",
    traits: ["debuff"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        const buff: iBuff = {
            id: SNOWSTORM_BUFF,
            icon: "sword-off",
            duration: SNOWSTORM_DURATION,
            active: true,
            modifiers: {
                hit: SNOWSTORM_MODIFIER,
                potency: SNOWSTORM_MODIFIER,
            }
        }

        for (const target of targets) {
            if (isEnemy(target.target)) {
                result.targets.push(tr(target, [
                    {
                        type: "buff",
                        target: target.target,
                        buff: buff,
                        operation: "add"
                    }]
                ));
            }
        }
        return result;
    }
}

export const timeAcceleration: MoveDef = {
    id: "timeAcceleration",
    index: 4,
    targetSide: "player",
    targets: "all",
    type: "mouth",
    traits: ["bonus"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        for (const target of targets) {
            if (isCharacter(target.target)) {
                result.targets.push(tr(target, [
                    {
                        type: "bonus",
                        target: target.target,
                        amount: TIME_ACCELERATION_AMOUNT
                    }]
                ));
            }
        }

        return result;
    }
}

export const temporalLock: MoveDef = {
    id: "temporalLock",
    index: 5,
    targetSide: "enemy",
    targets: 1,
    type: "mouth",
    traits: ["weaken"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        for (const target of targets) {
            if (isEnemy(target.target)) {
                result.targets.push(tr(target, [
                    {
                        type: "intention",
                        operation: "weaken",
                        target: target.target,
                        amount: TEMPORAL_LOCK_WEAKEN
                    }]
                ));
            }
        }

        return result;
    }
}

export const powerOfTime: MoveDef = {
    id: "powerOfTime",
    index: 6,
    targetSide: "enemy",
    targets: "all",
    type: "mouth",
    traits: ["onetime", "cancel", "weaken"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        for (const target of targets) {
            if (isEnemy(target.target)) {
                if (target.target.definition.rank === "boss") {
                    result.targets.push(tr(target, [
                        {
                            type: "intention",
                            operation: "weaken",
                            target: target.target,
                            amount: POWER_OF_TIME_BOSS_WEAKEN
                        }]
                    ));
                } else {
                    result.targets.push(tr(target, [
                        {
                            type: "intention",
                            operation: "cancel",
                            target: target.target,
                        }]
                    ));
                }
            }
        }

        const timeBuff: iBuff = {
            id: POWER_OF_TIME_BUFF,
            active: true,
            moveList: { blockedMoves: [powerOfTime] }
        }

        result.effects.push({
            type: "buff",
            target: actor,
            buff: timeBuff,
            operation: "add"
        });

        return result;
    }
}

export const naruyo: CharacterDef = {
    id: "naruyo",
    moves: [precisionStab, snowstorm, timeAcceleration, temporalLock, powerOfTime],
    empoweredMoves: [fairyPrecisionStab],
    passives: [expertArtisan]
};

export const naruyoCatalog: ContentCatalogFragment = {
    characters: [naruyo],
    moves: [precisionStab, fairyPrecisionStab, snowstorm, timeAcceleration, temporalLock, powerOfTime],
    passives: [expertArtisan]
};