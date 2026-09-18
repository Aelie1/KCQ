import { BindingDef, CharacterDef, MoveDef } from "../../engine/protected/definitions";
import { isCharacter, isEnemy } from "../../engine/protected/helpers";
import { iBuff, iCallbackReturn, iCharacter, iEffect, iEntity, iGameState, iMove, iTargetInfo } from "../../engine/protected/types";

const SUBSPACE_MAX = 100;

const STORE_REMOVE_AMOUNT = 25;

const RELEASE_PLAYER_AMOUNT = 50;
const RELEASE_PLAYER_BINDING = 25;
const RELEASE_ENEMY_AMOUNT = 25;
const RELEASE_DAMAGE = 100;

const ROCKFALL_DAMAGE = 40;

export const hinari: CharacterDef = {
    id: "hinari",
    getMoves: function (actor: iCharacter): MoveDef[] {
        const moves: MoveDef[] = [];
        moves.push(...[store, brace]);
        if (typeof actor.data["subspace"] === "number" && actor.data["subspace"] < SUBSPACE_MAX) {
            const totalRockfallHits = 4 - Math.floor(actor.data["subspace"] / (SUBSPACE_MAX / 4));
            moves.push({
                ...rockfall,
                baseHits: totalRockfallHits
            });
        }

        return moves;
    },
    passives: [],
    data: { "subspace": 0 }
};


const store: MoveDef = {
    id: "store",
    targetSide: "player",
    targets: 1,
    type: "arms",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (typeof actor.data["subspace"] !== "number" || isEnemy(actor) || !state.encounter) {
            return effects;
        }

        for (const { target } of targets) {
            if (isCharacter(target)) {
                let highest = 0;
                let highestBinding;
                for (const binding of target.bindings) {
                    if (binding.value > highest) {
                        highest = binding.value;
                        highestBinding = binding.definition;
                    }
                }
                if (highestBinding) {
                    const removeAmount = Math.min(highest, STORE_REMOVE_AMOUNT);
                    const spreadAmount = Math.max(0, removeAmount + actor.data["subspace"] - SUBSPACE_MAX);
                    const subspaceAmount = removeAmount - spreadAmount;
                    const bindingId = state.encounter.bindings.indexOf(highestBinding);
                    effects.push({
                        type: "binding",
                        source: actor,
                        target: target,
                        binding: highestBinding,
                        amount: -Math.min(highest, STORE_REMOVE_AMOUNT)
                    });

                    if (subspaceAmount) {
                        effects.push({
                            type: "data",
                            target: actor,
                            name: "subspace",
                            amount: subspaceAmount
                        });
                        effects.push({
                            type: "data",
                            target: actor,
                            name: "subspaceBinding",
                            amount: bindingId
                        });
                    }
                    if (spreadAmount) {
                        effects.push({
                            type: "binding",
                            source: actor,
                            target: actor,
                            binding: highestBinding,
                            amount: spreadAmount
                        });
                    }
                }
            }
        }
        return effects;
    }
}

const brace: MoveDef = {
    id: "brace",
    targetSide: "none",
    targets: 0,
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (typeof actor.data["subspace"] !== "number") {
            return effects;
        }

        const buff: iBuff = {
            id: "brace",
            active: true,
            duration: 1,
            modifyBinding: braceCallback
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

const rockfall: MoveDef = {
    id: "rockfall",
    targetSide: "enemy",
    targets: 1,
    baseDamage: ROCKFALL_DAMAGE,
    type: "arms",
    accuracy: {
        miss: 10,
        graze: 15,
        hit: 65,
        crit: 10
    },
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (typeof actor.data["subspace"] !== "number") {
            return effects;
        }
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


const release: MoveDef = {
    id: "release",
    targetSide: "either",
    targets: 1,
    baseDamage: RELEASE_DAMAGE,
    type: "arms",
    accuracy: {
        miss: 10,
        graze: 15,
        hit: 65,
        crit: 10
    },
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (typeof actor.data["subspace"] !== "number" || actor.data["subspaceBinding"] === undefined || !state.encounter) {
            return effects;
        }
        for (const target of targets) {
            if (isEnemy(target.target)) {
                effects.push({
                    type: "damage",
                    source: actor,
                    target: target.target,
                    amount: ((this.baseDamage ?? 1) * target.effectiveness)
                });
                effects.push({
                    type: "data",
                    target: actor,
                    name: "subspace",
                    amount: -RELEASE_ENEMY_AMOUNT
                });
            }
            else {
                const binding = state.encounter.bindings[actor.data["subspaceBinding"]];
                if (binding) {
                    effects.push({
                        type: "binding",
                        source: actor,
                        target: target.target,
                        binding: binding,
                        amount: RELEASE_PLAYER_BINDING
                    });
                    effects.push({
                        type: "data",
                        target: actor,
                        name: "subspace",
                        amount: -RELEASE_ENEMY_AMOUNT
                    });
                }
            }
        }
        return effects;
    }
}

function braceCallback(actor: iEntity, target: iCharacter, buff: iBuff, binding: BindingDef, amount: number): iCallbackReturn {
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

        const spreadAmount = Math.max(0, newAmount + target.data["subspace"] - SUBSPACE_MAX);
        const subspaceAmount = newAmount - spreadAmount;

        if (subspaceAmount) {
            effects.push({
                type: "data",
                target: target,
                name: "subspace",
                amount: subspaceAmount
            });
        }

        newAmount = spreadAmount;

    }
    return { value: newAmount, effects: effects };
}