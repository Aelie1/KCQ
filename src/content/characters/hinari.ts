import { getEscapePotency } from "../../engine/private/combat";
import { BindingDef, CharacterDef, MoveDef, PassiveDef } from "../../engine/protected/definitions";
import { findBinding, findBuff, isCharacter, isEnemy, thresholds } from "../../engine/protected/helpers";
import { hobbled } from "../../engine/protected/statuses";
import { iBuff, iCallbackReturn, iCharacter, iEffect, iEntity, iGameState, iMove, iTargetInfo } from "../../engine/protected/types";
import { FailureReason } from "../../engine/public/types";
import { removeEmpowerment } from "./ko";

const SUBSPACE_MAX = 100;

const STORE_REMOVE_AMOUNT = 25;
const STORE_REMOVE_MODIFIER = 2;

const RELEASE_PLAYER_AMOUNT = 50;
const RELEASE_ENEMY_AMOUNT = 25;

const ROCKFALL_DAMAGE = 10;

const subspaceMovement: PassiveDef = {
    id: "subspaceMovement",
    status: { flags: ["skipsTraps"] },
    immunities: [hobbled]
}

export const hinari: CharacterDef = {
    id: "hinari",
    getMoves: function (actor: iCharacter): MoveDef[] {
        const moves: MoveDef[] = [];
        if (actor.data["subspace"] !== undefined) {
            if (actor.data["subspace"] < SUBSPACE_MAX) {
                {
                    const baseRocks = 4;
                    const totalRocks = baseRocks - Math.floor(actor.data["subspace"] / (SUBSPACE_MAX / baseRocks));
                    moves.push({
                        ...rockfall,
                        baseHits: totalRocks
                    });
                }
                const buff = findBuff(actor, "fairyEmpowerment");
                if (buff) {
                    const baseRocks = 6;
                    const totalRocks = baseRocks - Math.floor(actor.data["subspace"] / (SUBSPACE_MAX / baseRocks));
                    moves.push({
                        ...fairyRockfall,
                        baseHits: totalRocks
                    });
                }
                moves.push(store);
                moves.push(brace);
            }
            if (actor.data["subspace"] > 0) {
                moves.push(release);
            }
        }
        return moves;
    },
    passives: [subspaceMovement],
    data: { "subspace": 0, "subspaceMax": SUBSPACE_MAX }
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
                    const actorBinding = findBinding(actor, highestBinding.id);
                    const bindingRoom = Math.max(0, thresholds.impossible - (actorBinding?.value ?? 0));
                    let removeAmount = Math.min(highest, getEscapePotency(STORE_REMOVE_AMOUNT, highest, 0, STORE_REMOVE_MODIFIER));
                    let overflowAmount = Math.max(0, STORE_REMOVE_AMOUNT + actor.data["subspace"] - SUBSPACE_MAX);
                    const subspaceAmount = STORE_REMOVE_AMOUNT - overflowAmount;
                    if (overflowAmount > bindingRoom) {
                        const excess = overflowAmount - bindingRoom;
                        removeAmount = Math.max(0, removeAmount - excess);;
                        overflowAmount = bindingRoom;
                    }
                    const bindingId = state.encounter.bindings.findIndex(x => x.id === highestBinding.id);
                    const currentBindingId = actor.data["subspaceBinding"] ?? 0;
                    effects.push({
                        type: "binding",
                        source: actor,
                        target: target,
                        binding: highestBinding,
                        amount: -removeAmount
                    });

                    if (subspaceAmount) {
                        effects.push({
                            type: "data",
                            target: actor,
                            name: "subspace",
                            amount: subspaceAmount
                        });
                        if (bindingId >= 0) {
                            effects.push({
                                type: "data",
                                target: actor,
                                name: "subspaceBinding",
                                amount: bindingId - currentBindingId
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
                }
            }
        }
        return effects;
    },
    isValid: function (move: MoveDef, target: iEntity | null): FailureReason | undefined {
        if (target !== null &&
            (!isCharacter(target)
                || target.bindings.length === 0)) {
            return "invalidTarget";
        }
    }

}

const brace: MoveDef = {
    id: "brace",
    targetSide: "none",
    targets: 0,
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];

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
        for (const target of targets) {
            if (isEnemy(target.target)) {
                effects.push({
                    type: "damage",
                    source: actor,
                    target: target.target,
                    amount: ((move.definition.baseDamage ?? 1) * target.effectiveness)
                });
            }
        }
        return effects;
    }
}

const fairyRockfall: MoveDef = {
    ...rockfall,
    id: "fairyRockfall",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects = rockfall.resolve(state, actor, move, targets);
        effects.push(...removeEmpowerment(actor));
        return effects;
    }
}

const release: MoveDef = {
    id: "release",
    targetSide: "either",
    targets: 1,
    type: "arms",
    accuracy: {
        graze: 25,
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
                const buff: iBuff = {
                    id: "subspaceClutter",
                    duration: 2,
                    active: true,
                    modifiers: {
                        defense: -1,
                        hit: -1,
                    }
                }

                effects.push({
                    type: "buff",
                    target: target.target,
                    buff: buff,
                    operation: "add"
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
                const subspaceAmount = Math.min(actor.data["subspace"] ?? 0, RELEASE_PLAYER_AMOUNT);
                const bindingAmount = Math.ceil(subspaceAmount / 2);
                if (binding) {
                    effects.push({
                        type: "binding",
                        source: actor,
                        target: target.target,
                        binding: binding,
                        amount: bindingAmount
                    });
                    effects.push({
                        type: "data",
                        target: actor,
                        name: "subspace",
                        amount: -subspaceAmount
                    });
                }
            }
        }
        return effects;
    }
}

function braceCallback(state: iGameState, actor: iEntity, target: iCharacter, buff: iBuff, binding: BindingDef, amount: number): iCallbackReturn {
    const effects: iEffect[] = [];
    let newAmount = amount;
    if (isEnemy(actor) && buff.duration && buff.duration > 0 && state.encounter) {
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
            const bindingId = state.encounter.bindings.findIndex(x => x.id === binding.id);
            const currentBindingId = target.data["subspaceBinding"] ?? 0;
            if (bindingId >= 0) {
                effects.push({
                    type: "data",
                    target: target,
                    name: "subspaceBinding",
                    amount: bindingId - currentBindingId
                });
            }
        }

        newAmount = spreadAmount;

    }
    return { value: newAmount, effects: effects };
}