import { BindingDef, CallbackDef, CharacterDef, MoveDef, PassiveDef } from "../../engine/protected/definitions";
import { isCharacter, isEnemy } from "../../engine/protected/helpers";
import { basicDamageEffect, basicPlayerAccuracy, getEscapePotency, tr } from "../../engine/protected/mechanics";
import { hobbled } from "../../engine/protected/statuses";
import { ContentCatalogFragment, iBuff, iCallbackReturn, iCharacter, iEffect, iEntity, iGameState, iMove, iMoveResult, iTargetInfo } from "../../engine/protected/types";
import { FailureReason } from "../../engine/public/types";
import { removeEmpowerment } from "./ko";

const SUBSPACE_MAX = 100;

const STORE_REMOVE_AMOUNT = 25;
const STORE_REMOVE_MODIFIER = 2;

const RELEASE_PLAYER_AMOUNT = 100;
const RELEASE_ENEMY_AMOUNT = 25;
const RELEASE_BUFF = "subspaceClutter";
const RELEASE_DURATION = 2;
const RELEASE_MODIFIER = -2;

const ROCKFALL_DAMAGE = 10;

const POWEROFSPACE_DAMAGE_FACTOR = 10;
const POWEROFSPACE_DEBUFF_FACTOR = 25;
const POWEROFSPACE_BUFF = "instability";

export const braceCallback: CallbackDef = {
    id: "brace",
    modifyBinding(state: iGameState, actor: iEntity, target: iCharacter, buff: iBuff, binding: BindingDef, amount: number): iCallbackReturn {
        const effects: iEffect[] = [];
        let newAmount = amount;
        if (amount > 0 && isEnemy(actor) && buff.duration && buff.duration > 0 && state.encounter) {
            buff.duration--;
            if (buff.duration === 0) {
                effects.push({
                    type: "buff",
                    target: target,
                    buff: buff,
                    operation: "remove"
                });
            }

            const spreadAmount = Math.max(0, newAmount + target.data["subspace"] - SUBSPACE_MAX);
            const subspaceAmount = newAmount - spreadAmount;

            if (subspaceAmount) {
                effects.push(modifySubspace(target, subspaceAmount));
                const bindingId = state.encounter.bindings.findIndex(x => x.id === binding.id);
                const currentBindingId = target.data["subspaceBinding"] ?? 0;
                if (bindingId >= 0) {
                    effects.push({
                        type: "data",
                        target: target,
                        name: "subspaceBinding",
                        amount: bindingId - currentBindingId,
                        visible: false
                    });
                }
            }

            newAmount = spreadAmount;

        }
        return { value: newAmount, effects: effects };
    }
}

function createSubspaceDebuff(duration: number): iBuff {
    return {
        id: RELEASE_BUFF,
        icon: "shield-off",
        duration: duration,
        active: true,
        modifiers: {
            defense: RELEASE_MODIFIER,
            hit: RELEASE_MODIFIER,
        }
    }
}

function modifySubspace(actor: iEntity, amount: number): iEffect {
    return {
        type: "data",
        target: actor,
        name: "subspace",
        amount: amount,
        visible: true
    };
}

export const subspaceMovement: PassiveDef = {
    id: "subspaceMovement",
    status: { flags: ["skipsTraps"] },
    immunities: [hobbled]
}


export const rockfall: MoveDef = {
    id: "rockfall",
    index: 1,
    targetSide: "enemy",
    targets: 1,
    baseDamage: ROCKFALL_DAMAGE,
    type: "arms",
    accuracy: basicPlayerAccuracy,
    baseHits: 4,
    traits: ["damage"],
    getHits: function (actor: iEntity, move: MoveDef): number {
        if (actor.data["subspace"] === undefined) {
            return move.baseHits ?? 1;
        }
        return (move.baseHits ?? 1) - Math.floor(actor.data["subspace"] / (SUBSPACE_MAX * 2 / (move.baseHits ?? 1)));
    },
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicDamageEffect(actor, move, targets);
    },
    isValid: function (state: iGameState, move: MoveDef, actor: iEntity): FailureReason | undefined {
        if (actor.data["subspace"] === undefined) {
            return "invalidActor";
        }
    }
}

export const fairyRockfall: MoveDef = {
    ...rockfall,
    id: "fairyRockfall",
    index: 2,
    baseHits: 6,
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result = rockfall.resolve(state, actor, move, targets);
        result.effects.push(...removeEmpowerment(actor));
        return result;
    }
}

export const store: MoveDef = {
    id: "store",
    index: 3,
    targetSide: "player",
    targets: 1,
    type: "arms",
    traits: ["escape"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };
        if (actor.data["subspace"] === undefined || isEnemy(actor) || !state.encounter) {
            return result;
        }

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
                    const subspaceRoom = SUBSPACE_MAX - actor.data["subspace"];
                    const removeAmount = Math.min(highest, getEscapePotency(highest, 0, STORE_REMOVE_MODIFIER), subspaceRoom);
                    const overflowAmount = Math.max(0, STORE_REMOVE_AMOUNT - subspaceRoom);
                    const subspaceAmount = STORE_REMOVE_AMOUNT - overflowAmount;
                    const bindingId = state.encounter.bindings.findIndex(x => x.id === highestBinding.id);
                    const currentBindingId = actor.data["subspaceBinding"] ?? 0;
                    const effects: iEffect[] = [];
                    effects.push({
                        type: "binding",
                        source: actor,
                        target: target.target,
                        binding: highestBinding,
                        amount: -removeAmount
                    });

                    if (subspaceAmount) {
                        effects.push(modifySubspace(actor, subspaceAmount));
                        if (bindingId >= 0) {
                            effects.push({
                                type: "data",
                                target: actor,
                                name: "subspaceBinding",
                                amount: bindingId - currentBindingId,
                                visible: false
                            });
                        }
                    }
                    if (overflowAmount) {
                        effects.push({
                            type: "binding",
                            source: actor,
                            target: actor,
                            binding: highestBinding,
                            amount: overflowAmount
                        });
                    }
                    result.targets.push(tr(target, effects));

                }
            }
        }
        return result;
    },
    isValid: function (state: iGameState, move: MoveDef, actor: iEntity): FailureReason | undefined {
        if (actor.data["subspace"] === undefined) {
            return "invalidActor";
        }
        if (actor.data["subspace"] === SUBSPACE_MAX) {
            return "insufficientResource";
        }
    },
    isValidTarget: function (move: MoveDef, target: iEntity | null): FailureReason | undefined {
        if (target !== null &&
            (!isCharacter(target)
                || target.bindings.length === 0)) {
            return "invalidTarget";
        }
    }

}

export const brace: MoveDef = {
    id: "brace",
    libraryEffects: [{ id: "brace", recipient: "self", duration: 1 }],
    index: 4,
    targetSide: "none",
    targets: 0,
    type: "none",
    traits: ["buff"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        const buff: iBuff = {
            id: move.definition.id,
            active: true,
            duration: 1,
            callback: braceCallback
        }

        result.effects.push({
            type: "buff",
            target: actor,
            buff: buff,
            operation: "add"
        });
        return result;
    },
    isValid: function (state: iGameState, move: MoveDef, actor: iEntity): FailureReason | undefined {
        if (actor.data["subspace"] === undefined) {
            return "invalidActor";
        }
        if (actor.data["subspace"] === SUBSPACE_MAX) {
            return "insufficientResource";
        }
    }
}

export const release: MoveDef = {
    id: "release",
    index: 5,
    targetSide: "either",
    targets: 1,
    type: "arms",
    traits: ["debuff"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };
        if (actor.data["subspace"] === undefined || actor.data["subspaceBinding"] === undefined || !state.encounter) {
            return result;
        }
        for (const target of targets) {
            if (isEnemy(target.target)) {
                result.targets.push(tr(target, [
                    {
                        type: "buff",
                        target: target.target,
                        buff: createSubspaceDebuff(RELEASE_DURATION),
                        operation: "add"
                    },
                    modifySubspace(actor, -RELEASE_ENEMY_AMOUNT)]
                ));
            }
            else {
                const binding = state.encounter.bindings[actor.data["subspaceBinding"]];
                const subspaceAmount = Math.min(actor.data["subspace"] ?? 0, RELEASE_PLAYER_AMOUNT);
                const bindingAmount = Math.ceil(subspaceAmount / 2);
                if (binding) {
                    result.targets.push(tr(target, [
                        {
                            type: "binding",
                            source: actor,
                            target: target.target,
                            binding: binding,
                            amount: bindingAmount
                        },
                        modifySubspace(actor, -subspaceAmount)
                    ]));
                }
            }
        }
        return result;
    },
    isValid: function (state: iGameState, move: MoveDef, actor: iEntity): FailureReason | undefined {
        if (actor.data["subspace"] === undefined) {
            return "invalidActor";
        }
        if (actor.data["subspace"] < RELEASE_ENEMY_AMOUNT) {
            return "insufficientResource";
        }
    }
}

export const powerOfSpace: MoveDef = {
    id: "powerOfSpace",
    index: 5,
    targetSide: "enemy",
    targets: 1,
    baseDamage: ROCKFALL_DAMAGE,
    type: "none",
    accuracy: basicPlayerAccuracy,
    traits: ["onetime", "debuff", "damage"],
    getHits: function (actor: iEntity, move: MoveDef): number {
        if (actor.data["subspace"] === undefined) {
            return move.baseHits ?? 1;
        }
        return Math.max(1, Math.floor(actor.data["subspace"] / (POWEROFSPACE_DAMAGE_FACTOR)));
    },
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = basicDamageEffect(actor, move, targets);
        if (actor.data["subspace"] === undefined) {
            return result;
        }
        for (const target of targets) {
            if (isEnemy(target.target) && actor.data["subspace"] >= POWEROFSPACE_DEBUFF_FACTOR) {
                result.targets.push({
                    target: target.target,
                    result: "none",
                    effects: [{
                        type: "buff",
                        target: target.target,
                        buff: createSubspaceDebuff(Math.floor(actor.data["subspace"] / (POWEROFSPACE_DEBUFF_FACTOR))),
                        operation: "add"
                    }]
                });
                break;
            }
        }
        result.effects.push(modifySubspace(actor, -SUBSPACE_MAX));
        const spaceBuff: iBuff = {
            id: POWEROFSPACE_BUFF,
            active: true,
            moveList: { blockedMoves: [powerOfSpace] }
        }

        result.effects.push({
            type: "buff",
            target: actor,
            buff: spaceBuff,
            operation: "add"
        });

        return result;
    },
    isValid: function (state: iGameState, move: MoveDef, actor: iEntity): FailureReason | undefined {
        if (actor.data["subspace"] === undefined) {
            return "invalidActor";
        }
        if (actor.data["subspace"] < POWEROFSPACE_DAMAGE_FACTOR) {
            return "insufficientResource";
        }
    }
}

export const hinari: CharacterDef = {
    id: "hinari",
    moves: [rockfall, store, brace, release, powerOfSpace],
    empoweredMoves: [fairyRockfall],
    passives: [subspaceMovement],
    data: { "subspace": 0, "subspaceMax": SUBSPACE_MAX }
};

export const hinariCatalog: ContentCatalogFragment = {
    characters: [hinari],
    moves: [rockfall, store, brace, release, powerOfSpace, fairyRockfall],
    passives: [subspaceMovement],
    callbacks: [braceCallback]
};