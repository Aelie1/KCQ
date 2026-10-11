import { BindingDef, CharacterDef, EMPOWERMENT_BUFF, MoveDef, PassiveDef } from "../../engine/protected/definitions";
import { findBuff, isCharacter, isEnemy } from "../../engine/protected/helpers";
import { basicDamageEffect, basicPlayerAccuracy } from "../../engine/protected/mechanics";
import { ContentCatalogFragment, iBuff, iCallbackReturn, iCharacter, iEffect, iEntity, iGameState, iMove, iMoveResult, iTargetInfo } from "../../engine/protected/types";

const TELEKINESIS_DAMAGE = 30;

export const TRANSFORMATION_BUFF = "transformation";
const TRANSFORMATION_COOLDOWN = 3;
const TRANSFORMATION_DURATION_KO = 3;
const TRANSFORMATION_MODIFIER_KO = 3;
const TRANSFORMATION_DURATION_ALLY = 2;
const TRANSFORMATION_MODIFIER_ALLY = 2;

const STARLIGHT_BUFF = "starlightBindings";
const STARLIGHT_MODIFIER = -2;
const STARLIGHT_DURATION = 3;

const DENIAL_BUFF = "exhausted";

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

function createTransformBuff(target: iEntity, duration: number, defense: number): iEffect {
    const transformBuff: iBuff = {
        id: TRANSFORMATION_BUFF,
        active: true,
        duration: duration,
        modifiers: {
            defense: defense,
        }
    }

    return {
        type: "buff",
        target: target,
        buff: transformBuff,
        operation: "add"
    }
}

function createEmpowermentBuff(target: iCharacter): iEffect {
    const newBuff: iBuff = {
        id: EMPOWERMENT_BUFF,
        moveList: { addedMoves: target.definition.empoweredMoves },
        active: true,
    }

    return {
        type: "buff",
        target: target,
        buff: newBuff,
        operation: "add"
    }
}

export const thousandRestraintsBody: PassiveDef = {
    id: "thousandRestraintsBody",
    status: { allowedMoveTypes: ["mouth"], flags: ["blocksEscape"] }
}

export const telekinesis: MoveDef = {
    id: "telekinesis",
    index: 1,
    targetSide: "enemy",
    targets: 1,
    baseDamage: TELEKINESIS_DAMAGE,
    type: "mouth",
    traits: ["damage"],
    accuracy: basicPlayerAccuracy,
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicDamageEffect(actor, move, targets);
    }
}

export const fairyTelekinesis: MoveDef = {
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

export const starlightBindings: MoveDef = {
    id: "starlightBindings",
    libraryEffects: [{ id: STARLIGHT_BUFF, recipient: "selected", duration: STARLIGHT_DURATION, modifiers: { defense: STARLIGHT_MODIFIER, hit: STARLIGHT_MODIFIER } }],
    index: 3,
    targetSide: "enemy",
    targets: 1,
    type: "mouth",
    traits: ["debuff"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        const buff: iBuff = {
            id: STARLIGHT_BUFF,
            icon: "shield-off",
            duration: STARLIGHT_DURATION,
            active: true,
            modifiers: {
                defense: STARLIGHT_MODIFIER,
                hit: STARLIGHT_MODIFIER,
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

export const fairyStarlightBindings: MoveDef = {
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

export const reflect: MoveDef = {
    id: "reflect",
    index: 5,
    targetSide: "player",
    targets: 0,
    type: "mouth",
    traits: ["buff"],
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

export const fairyReflect: MoveDef = {
    ...reflect,
    id: "fairyReflect",
    index: 6,
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result = reflect.resolve(state, actor, move, targets);
        result.effects.push(...removeEmpowerment(actor));
        return result;
    }
}

export const fairyTransformation: MoveDef = {
    id: "fairyTransformation",
    libraryEffects: [{ id: TRANSFORMATION_BUFF, recipient: "self", duration: TRANSFORMATION_DURATION_KO, modifiers: { defense: TRANSFORMATION_MODIFIER_KO } }],
    index: 7,
    targetSide: "player",
    targets: 0,
    type: "mouth",
    traits: ["buff"],
    cooldown: { "fairyTransformation": TRANSFORMATION_COOLDOWN },
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };
        result.effects.push(createTransformBuff(actor, TRANSFORMATION_DURATION_KO, TRANSFORMATION_MODIFIER_KO));

        const fairyBuff = findBuff(actor, EMPOWERMENT_BUFF);
        if (!fairyBuff && isCharacter(actor)) {
            result.effects.push(createEmpowermentBuff(actor));
        }

        return result;
    }
}

export const fairyEmpowerment: MoveDef = {
    ...fairyTransformation,
    id: "fairyEmpowerment",
    libraryEffects: [
        { id: TRANSFORMATION_BUFF, recipient: "self", duration: TRANSFORMATION_DURATION_KO, modifiers: { defense: TRANSFORMATION_MODIFIER_KO } },
        { id: TRANSFORMATION_BUFF, recipient: "allies", duration: TRANSFORMATION_DURATION_ALLY, modifiers: { defense: TRANSFORMATION_MODIFIER_ALLY } },
    ],
    index: 8,
    targets: "all",
    cooldown: { "fairyEmpowerment": TRANSFORMATION_COOLDOWN },
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };
        const koEffects: iEffect[] = [];

        koEffects.push(createTransformBuff(actor, TRANSFORMATION_DURATION_KO, TRANSFORMATION_MODIFIER_KO));
        koEffects.push(...removeEmpowerment(actor));
        result.targets.push({
            target: actor,
            result: "none",
            effects: koEffects
        });


        for (const target of targets) {
            if (target.target !== actor && isCharacter(target.target)) {
                const allyEffects: iEffect[] = [];
                allyEffects.push(createTransformBuff(target.target, TRANSFORMATION_DURATION_ALLY, TRANSFORMATION_MODIFIER_ALLY));
                allyEffects.push(createEmpowermentBuff(target.target));
                result.targets.push({
                    target: target.target,
                    result: target.band,
                    effects: allyEffects
                });
            }
        }

        return result;
    }
}

export const powerOfDenial: MoveDef = {
    id: "powerOfDenial",
    index: 9,
    targetSide: "either",
    targets: 1,
    type: "mouth",
    traits: ["onetime", "escape"],
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

        const denialBuff: iBuff = {
            id: DENIAL_BUFF,
            active: true,
            moveList: { blockedMoves: [powerOfDenial] }
        }

        result.effects.push({
            type: "buff",
            target: actor,
            buff: denialBuff,
            operation: "add"
        });

        return result;
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

export const koCatalog: ContentCatalogFragment = {
    characters: [ko],
    moves: [
        telekinesis, starlightBindings, reflect, fairyTransformation, powerOfDenial,
        fairyTelekinesis, fairyStarlightBindings, fairyReflect, fairyEmpowerment,
    ],
    passives: [thousandRestraintsBody],
};