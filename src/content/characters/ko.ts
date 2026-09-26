import { BindingDef, CharacterDef, EMPOWERMENT_BUFF, MoveDef, PassiveDef } from "../../engine/protected/definitions";
import { basicDamageEffect, basicPlayerAccuracy, findBuff, isCharacter, isEnemy } from "../../engine/protected/helpers";
import { iBuff, iCallbackReturn, iCharacter, iEffect, iEntity, iGameState, iMove, iMoveResult, iTargetInfo } from "../../engine/protected/types";

const TELEKINESIS_DAMAGE = 30;

export const TRANSFORMATION_BUFF = "transformation";
export const TRANSFORMATION_COOLDOWN = 3;

function reflectCallback(state: iGameState, actor: iEntity, target: iCharacter, buff: iBuff, binding: BindingDef, amount: number): iCallbackReturn {
    const effects: iEffect[] = [];
    let newAmount = amount;
    if (isEnemy(actor) && buff.duration && buff.duration > 0) {
        buff.duration--;
        if (buff.duration === 0) {
            effects.push({
                type: "buff",
                target: target,
                buff: buff,
                operation: "remove"
            });
        }
        effects.push({
            type: "damage",
            source: target,
            target: actor,
            amount: amount
        })
        if (buff.id === "fairyReflect") {
            newAmount = 0;
        } else {
            newAmount = Math.floor(newAmount / 2);
        }
    }
    return { value: newAmount, effects: effects };
}

export function removeEmpowerment(actor: iEntity): iEffect[] {
    const effects: iEffect[] = [];
    const fairyBuff = findBuff(actor, EMPOWERMENT_BUFF);
    if (fairyBuff) {
        effects.push({
            type: "buff",
            target: actor,
            buff: fairyBuff,
            operation: "remove"
        })
    }
    return effects;
}

const thousandRestraintsBody: PassiveDef = {
    id: "thousandRestraintsBody",
    status: { allowedMoveTypes: ["arms", "legs", "mouth"], flags: ["blocksEscape"] }
}

const telekinesis: MoveDef = {
    id: "telekinesis",
    index: 1,
    targetSide: "enemy",
    targets: 1,
    baseDamage: TELEKINESIS_DAMAGE,
    type: "mouth",
    accuracy: basicPlayerAccuracy,
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicDamageEffect(actor, move, targets);
    }
}

const fairyTelekinesis: MoveDef = {
    ...telekinesis,
    id: "fairyTelekinesis",
    index: 2,
    targets: "all",
    baseDamage: TELEKINESIS_DAMAGE / 2,
    baseHits: 2,
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result = telekinesis.resolve(state, actor, move, targets);
        result.effects.push(...removeEmpowerment(actor));
        return result;
    }
}

const starlightBindings: MoveDef = {
    id: "starlightBindings",
    index: 3,
    targetSide: "enemy",
    targets: 1,
    type: "mouth",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        const buff: iBuff = {
            id: move.definition.id,
            duration: 3,
            active: true,
            modifiers: {
                defense: -2,
                hit: -2,
            }
        }

        for (const target of targets) {
            if (isEnemy(target.target)) {
                result.targets.push({
                    target: target.target,
                    result: target.band,
                    effects: [{
                        type: "buff",
                        target: target.target,
                        buff: buff,
                        operation: "add"
                    }]
                });
            }
        }
        return result;
    }
}

const fairyStarlightBindings: MoveDef = {
    ...starlightBindings,
    id: "fairyStarlightBindings",
    index: 4,
    targets: "all",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result = starlightBindings.resolve(state, actor, move, targets);
        result.effects.push(...removeEmpowerment(actor));
        return result;
    }

}

const reflect: MoveDef = {
    id: "reflect",
    index: 5,
    targetSide: "player",
    targets: 0,
    type: "mouth",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        const buff: iBuff = {
            id: move.definition.id,
            active: true,
            duration: 1,
            modifyBinding: reflectCallback
        }

        result.effects.push({
            type: "buff",
            target: actor,
            buff: buff,
            operation: "add"
        });

        return result;
    }
}

const fairyReflect: MoveDef = {
    ...reflect,
    id: "fairyReflect",
    index: 6,
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result = reflect.resolve(state, actor, move, targets);
        result.effects.push(...removeEmpowerment(actor));
        return result;
    }
}

const fairyTransformation: MoveDef = {
    id: "fairyTransformation",
    index: 7,
    targetSide: "player",
    targets: 0,
    type: "mouth",
    cooldown: { "fairyTransformation": TRANSFORMATION_COOLDOWN },
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        const transformBuff: iBuff = {
            id: TRANSFORMATION_BUFF,
            active: true,
            duration: 3,
            modifiers: {
                defense: 3,
            }
        }

        result.effects.push({
            type: "buff",
            target: actor,
            buff: transformBuff,
            operation: "add"
        })

        const fairyBuff = findBuff(actor, EMPOWERMENT_BUFF);
        if (!fairyBuff && isCharacter(actor)) {
            const newBuff: iBuff = {
                id: EMPOWERMENT_BUFF,
                moveList: { addedMoves: actor.definition.empoweredMoves },
                active: true,
            }

            result.effects.push({
                type: "buff",
                target: actor,
                buff: newBuff,
                operation: "add"
            })
        }

        return result;
    }
}

const fairyEmpowerment: MoveDef = {
    ...fairyTransformation,
    id: "fairyEmpowerment",
    index: 8,
    targets: "all",
    cooldown: { "fairyEmpowerment": TRANSFORMATION_COOLDOWN },
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result = fairyTransformation.resolve(state, actor, move, targets);
        result.effects.push(...removeEmpowerment(actor));

        const transformBuff: iBuff = {
            id: TRANSFORMATION_BUFF,
            active: true,
            duration: 2,
            modifiers: {
                defense: 2,
            }
        }

        for (const target of targets) {
            if (target.target !== actor && isCharacter(target.target)) {
                const empowerBuff = {
                    id: EMPOWERMENT_BUFF,
                    moveList: { addedMoves: target.target.definition.empoweredMoves },
                    active: true,
                }
                result.targets.push({
                    target: target.target,
                    result: target.band,
                    effects: [{
                        type: "buff",
                        target: target.target,
                        buff: transformBuff,
                        operation: "add"
                    },
                    {
                        type: "buff",
                        target: target.target,
                        buff: empowerBuff,
                        operation: "add"
                    }]
                });
            }
        }

        return result;
    }
}

const powerOfDenial: MoveDef = {
    id: "powerOfDenial",
    index: 9,
    targetSide: "either",
    targets: 1,
    type: "mouth",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        for (const target of targets) {
            if (isCharacter(target.target)) {
                let highest = 0;
                let highestBinding;
                for (const binding of target.target.bindings) {
                    if (binding.value > highest) {
                        highest = binding.value;
                        highestBinding = binding.definition;
                    }
                }
                if (highestBinding) {
                    result.targets.push({
                        target: target.target,
                        result: target.band,
                        effects: [{
                            type: "binding",
                            source: actor,
                            target: target.target,
                            binding: highestBinding,
                            amount: -highest
                        }]
                    });
                }
            }
            if (isEnemy(target.target)) {
                result.targets.push({
                    target: target.target,
                    result: target.band,
                    effects: [{
                        type: "enemy",
                        operation: "defeat",
                        target: target.target,
                    }]
                });
            }
        }

        result.effects.push({
            type: "data",
            target: actor,
            name: "denialUsed",
            amount: 1
        });

        return result;
    },
    isValid: function (move: MoveDef, actor: iEntity) {
        if ((actor.data["denialUsed"] ?? 0) > 0) {
            return "insufficientResource";
        }
    },
    isValidTarget: function (move: MoveDef, target: iEntity | null) {
        if (!target) {
            return undefined;
        }
        if (isEnemy(target) && target.rank === "boss") {
            return "invalidTarget";
        }
        if (isCharacter(target) && target.bindings.length === 0) {
            return "invalidTarget";
        }
        return undefined;
    },
}


export const ko: CharacterDef = {
    id: "ko",
    moves: [telekinesis, starlightBindings, reflect, fairyTransformation, powerOfDenial],
    empoweredMoves: [fairyTelekinesis, fairyStarlightBindings, fairyReflect, fairyEmpowerment],
    passives: [thousandRestraintsBody]
};