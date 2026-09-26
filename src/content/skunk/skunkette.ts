import { EnemyDef, MoveDef } from "../../engine/protected/definitions";
import { getValidTargets, pickBinding, pickTarget } from "../../engine/protected/enemies";
import { basicBindingEffect, findBuff, findCharacter, findEnemy, isCharacter } from "../../engine/protected/helpers";
import { effectivenessInt, Random } from "../../engine/protected/random";
import { s } from "../../engine/protected/status";
import { helpless, immobilized, stunned } from "../../engine/protected/statuses";
import { iBuff, iEffect, iEnemy, iEntity, iGameState, iMove, iMoveEffect, iMoveResult, iStatus, iTargetInfo } from "../../engine/protected/types";
import { ModifierSet } from "../../engine/public/types";
import { latexArms, latexHead, latexLegs, latexTorso, SKUNKED_BUFF } from "./latex";

const SKUNKETTE_HP = 200;
const SKUNKETTE_DEF = 0;

const SPRAY_DAMAGE = 30;

const POUNCE_COOLDOWN = 2;
export const POUNCE_BUFF = "pounce";

const MIST_DAMAGE = 10;
const MIST_SPREAD = 5;

const RESISTANCE_HP_THRESHOLD = 0.4;
const RESISTANCE_POTENCY = -3;
const RESISTANCE_DEFENSE = -1;
const RESISTANCE_BUFF = "resistance";

export const skunkette: EnemyDef = {
    id: "skunkette",
    rank: "enemy",
    hp: SKUNKETTE_HP,
    defense: SKUNKETTE_DEF,
    passives: [],
    ai: function (state: iGameState, actor: iEnemy, rng: Random): iMoveEffect[] {
        const effects: iMoveEffect[] = [];
        const bindings = [latexHead, latexArms, latexTorso, latexLegs];

        //1) Spray an existing pounced character
        {
            const buff = findBuff(actor, POUNCE_BUFF);
            if (buff && buff.linkedEntity) {
                const target = findCharacter(state, buff.linkedEntity);
                if (target) {
                    const binding = pickBinding(target, bindings, rng);
                    effects.push({
                        type: "move",
                        actor: actor,
                        targets: [target],
                        move: { definition: latexSpray, binding: binding }
                    });
                    return effects;
                }
            }
        }

        const validTargets = getValidTargets(state.characters);

        //2) Pounce if off cooldown and a valid target exists
        {
            if ((actor.cooldowns['pounce'] ?? 0) === 0) {
                const validCharacters: iEntity[] = [];
                for (const target of validTargets) {
                    const cBuff = findBuff(target, POUNCE_BUFF);
                    if (!cBuff) {
                        validCharacters.push(target);
                    }
                }
                if (validCharacters.length > 0) {
                    const target = pickTarget(validCharacters, rng);
                    if (target && isCharacter(target)) {
                        const binding = pickBinding(target, bindings, rng);
                        effects.push({
                            type: "move",
                            actor: actor,
                            targets: [target],
                            move: { definition: pounce, binding: binding }
                        });
                        return effects;
                    }
                }
            }
        }

        //3) Use latex mist or latex spray with equal chance on a random target
        {
            const roll = rng.int(1, 2);
            if (roll === 1) {
                //Latex mist
                effects.push({
                    type: "move",
                    actor: actor,
                    targets: [],
                    move: { definition: latexMist }
                });
                return effects;
            } else {
                const target = pickTarget(validTargets, rng);
                if (target && isCharacter(target)) {
                    const binding = pickBinding(target, bindings, rng);
                    if (binding) {
                        effects.push({
                            type: "move",
                            actor: actor,
                            targets: [target],
                            move: { definition: latexSpray, binding: binding }
                        });
                        return effects;
                    }
                }
            }
        }

        //4) Just mist I guess?
        {
            effects.push({
                type: "move",
                actor: actor,
                targets: [],
                move: { definition: latexMist }
            });
            return effects;
        }
    },
    onDamage(state: iGameState, actor: iEntity, target: iEnemy, damage: number): iEffect[] {
        const effects: iEffect[] = [];
        if (target.currHp / target.maxHp < RESISTANCE_HP_THRESHOLD) {
            const resistBuff = findBuff(target, RESISTANCE_BUFF);
            if (!resistBuff) {
                const tBuff = {
                    id: RESISTANCE_BUFF,
                    active: true,
                    modifiers: {
                        potency: RESISTANCE_POTENCY,
                        defense: RESISTANCE_DEFENSE
                    }
                }
                effects.push({
                    type: "buff",
                    target: target,
                    buff: tBuff,
                    operation: "add"
                });
            }
        }

        const pounceBuff = findBuff(target, POUNCE_BUFF);
        if (pounceBuff && pounceBuff.linkedEntity) {
            const newLevel = (pounceBuff.modifiers?.hit ?? 1) / 2 - 1;
            if (newLevel === 0) {
                effects.push({
                    type: "buff",
                    target: target,
                    buff: pounceBuff,
                    operation: "remove",
                    linked: true
                });
                effects.push({
                    type: "cooldown",
                    target: target,
                    move: pounce,
                    value: pounce.cooldown?.["pounce"] ?? 0
                });
            } else {
                const character = findCharacter(state, pounceBuff.linkedEntity);
                if (character) {
                    effects.push(...createPounceBuffs(character, target, newLevel, true));
                }
            }
        }
        return effects;
    },
    onDefeat(state: iGameState, target: iEnemy): iEffect[] {
        const effects: iEffect[] = [];
        const pounceBuff = findBuff(target, POUNCE_BUFF);
        if (pounceBuff) {
            effects.push({
                type: "buff",
                target: target,
                buff: pounceBuff,
                operation: "remove",
                linked: true
            });
        }
        const skunkedBuff = findBuff(target, SKUNKED_BUFF);
        if (skunkedBuff && skunkedBuff.linkedEntity) {
            effects.push({
                type: "buff",
                target: target,
                buff: skunkedBuff,
                operation: "remove",
                linked: true
            });
            const character = findCharacter(state, skunkedBuff.linkedEntity);
            if (character) {
                for (const binding of character.bindings) {
                    effects.push({
                        type: "binding",
                        source: character,
                        target: character,
                        binding: binding,
                        amount: Math.floor(binding.value * -0.5)
                    });
                }
            }
        }
        return effects;
    }
}

const latexSpray: MoveDef = {
    id: "latexSpray",
    targetSide: "player",
    targets: 1,
    baseDamage: SPRAY_DAMAGE,
    accuracy: {
        miss: 50,
        graze: 20,
        hit: 27,
        crit: 3
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicBindingEffect(actor, move, targets);
    }
};

const pounce: MoveDef = {
    id: "pounce",
    targetSide: "player",
    targets: 1,
    cooldown: { "pounce": POUNCE_COOLDOWN },
    accuracy: {
        miss: 40,
        hit: 50,
        crit: 10
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };
        if (targets.length === 0) {
            return result;
        }
        const target = targets[0].target;
        const effectiveness = targets[0].effectiveness;
        const band = targets[0].band;
        if (!isCharacter(target)) {
            return result;
        }
        const buff = findBuff(target, POUNCE_BUFF);
        if (buff) {
            //we can't pounce someone that's already pounced
            return result;
        }
        const effects: iEffect[] = [];
        if (effectiveness < 0.875) {
            effects.push(...createPounceBuffs(target, actor, 1, false));
        }
        else if (effectiveness < 0.95) {
            effects.push(...createPounceBuffs(target, actor, 2, false));
        }
        else if (effectiveness < 1.5) {
            effects.push(...createPounceBuffs(target, actor, 3, false));
        }
        else {
            effects.push(...createPounceBuffs(target, actor, 4, false));
        }

        if (effectiveness >= 1.75 && move.binding) {
            effects.push({
                type: "move",
                actor: actor,
                move: {
                    definition: latexSpray,
                    binding: move.binding
                },
                targets: [target]
            });
        }
        result.targets.push({
            target: target,
            result: band,
            effects: effects
        })

        return result;
    }
};

const latexMist: MoveDef = {
    id: "latexMist",
    targetSide: "player",
    targets: "all",
    baseDamage: MIST_DAMAGE,
    accuracy: {
        graze: 70,
        hit: 25,
        crit: 5
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        if (move.roll === undefined) {
            return result;
        }

        //1) Add spread buff to everyone based on the common roll
        const modifiers: ModifierSet = { "spread": Math.ceil(move.roll * MIST_SPREAD) };

        const buff: iBuff = {
            id: move.definition.id,
            modifiers: modifiers,
            active: false,
            duration: 1
        }

        //2) Individual players get additional bondage based on their roll
        for (const target of targets) {
            const effects: iEffect[] = [];
            const character = target.target;
            effects.push({
                target: target.target,
                type: "buff",
                buff: buff,
                operation: "add"
            });

            if (target.band === "hit" && isCharacter(character) && character.bindings.length > 0) {
                const index = effectivenessInt(target.effectiveness, 0, character.bindings.length - 1);
                const binding = character.bindings[index];
                effects.push({
                    type: "binding",
                    source: actor,
                    target: character,
                    binding: binding.definition,
                    amount: (move.definition.baseDamage ?? 1) * target.effectiveness
                });
            }
            else if (target.band === "crit" && isCharacter(character) && character.bindings.length > 0) {
                for (const binding of character.bindings) {
                    effects.push({
                        type: "binding",
                        source: actor,
                        target: character,
                        binding: binding.definition,
                        amount: (move.definition.baseDamage ?? 1) * target.effectiveness / 2
                    });
                }
            }
            result.targets.push({
                target: target.target,
                result: target.band,
                effects: effects
            })
        }

        return result;
    }
}

const throwOff: MoveDef = {
    id: "throwOff",
    alwaysAvailable: true,
    freeOnHit: true,
    targetSide: "none",
    targets: 0,
    accuracy: {
        miss: 40,
        hit: 60
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };
        if (!move.band || move.band === "miss") {
            return result;
        }

        const pounceBuff = findBuff(actor, POUNCE_BUFF);
        if (pounceBuff) {
            result.effects.push({
                type: "buff",
                target: actor,
                buff: pounceBuff,
                operation: "remove",
                linked: true
            });
            if (pounceBuff.linkedEntity) {
                const enemy = findEnemy(state, pounceBuff.linkedEntity)
                if (enemy) {
                    result.effects.push({
                        type: "cooldown",
                        target: enemy,
                        move: pounce,
                        value: pounce.cooldown?.["pounce"] ?? 0
                    });
                }
            }
        }
        return result;
    }
};


function createPounceBuffs(character: iEntity, enemy: iEntity, level: number, active: boolean): iEffect[] {
    const effects: iEffect[] = [];
    const tStatus: iStatus[] = [s(immobilized, 1)];
    const tModifiers: ModifierSet = {};
    const aModifiers: ModifierSet = { defense: -2 };
    switch (level) {
        case 1:
            aModifiers.hit = 2;
            break;
        case 2:
            tModifiers.hit = -1;
            aModifiers.hit = 4;
            break;
        case 3:
            tStatus.push(s(stunned, 1));
            tModifiers.hit = -2;
            aModifiers.hit = 6;
            break;
        case 4:
            tStatus.push(s(helpless, 1));
            aModifiers.hit = 8;
            break
    }

    const cBuff: iBuff = {
        id: POUNCE_BUFF,
        statuses: tStatus,
        modifiers: tModifiers,
        active: active,
        addedMoves: [throwOff],
        linkedEntity: enemy.id
    }

    const eBuff: iBuff = {
        id: POUNCE_BUFF,
        modifiers: aModifiers,
        active: active,
        linkedEntity: character.id
    }

    effects.push({
        target: character,
        type: "buff",
        buff: cBuff,
        operation: "add"
    });

    effects.push({
        target: enemy,
        type: "buff",
        buff: eBuff,
        operation: "add"
    });

    return effects;
}