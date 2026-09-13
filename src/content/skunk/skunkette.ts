import { evaluateResult, isValidTarget, resolveMove } from "../../engine/private/combat";
import { pickBinding, pickTarget, validTargets } from "../../engine/protected/enemies";
import { findBuff, findCharacter, findEnemy } from "../../engine/protected/find";
import { isCharacter } from "../../engine/protected/helpers";
import { EnemyDef, iBuff, iCharacter, iEffect, iEnemy, iEntity, iGameState, iMove, iStatus, iTargetInfo, MoveDef, s } from "../../engine/protected/itypes";
import { effectivenessInt, Random } from "../../engine/protected/random";
import { helpless, immobilized, isIncapacitated, stunned } from "../../engine/protected/status";
import { ModifierSet } from "../../engine/public/types";
import { latexArms, latexHead, latexLegs, latexTorso } from "./latex";

const SKUNKETTE_HP = 200;
const SKUNKETTE_DEF = 0;

const SPRAY_DAMAGE = 15;

const POUNCE_DAMAGE = 15;
const POUNCE_COOLDOWN = 2;

const MIST_DAMAGE = 10;
const MIST_SPREAD = 5;

const RESISTANCE_HP_THRESHOLD = 0.4;
const RESISTANCE_POTENCY = -3;
const RESISTANCE_DEFENSE = -1;

export const skunkette: EnemyDef = {
    id: "skunkette",
    hp: SKUNKETTE_HP,
    defense: SKUNKETTE_DEF,
    passives: [],
    ai: function (state: iGameState, actor: iEnemy, rng: Random): iEffect[] {
        const bindings = [latexHead, latexArms, latexTorso, latexLegs];
        const effects: iEffect[] = [];

        //1) Spray an existing pounced character
        {
            const buff = findBuff(actor, "pounce");
            if (buff && buff.linkedEntity) {
                const target = findCharacter(state, buff.linkedEntity);
                if (target && !isIncapacitated(target)) {
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

        //2) Pounce if off cooldown and a valid target exists
        {
            if ((actor.cooldowns['pounce'] ?? 0) === 0) {
                const validCharacters: iCharacter[] = [];
                for (const character of state.characters) {
                    const cBuff = findBuff(character, "pounce");
                    if (!cBuff) {
                        validCharacters.push(character);
                    }
                }
                if (validCharacters.length > 0) {
                    const target = pickTarget(validCharacters, rng);
                    if (target) {
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
                const target = pickTarget(state.characters, rng);
                if (target) {
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
            const resistBuff = findBuff(target, "resistance");
            if (!resistBuff) {
                const tBuff = {
                    id: "resistance",
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
                })
            }
        }

        const pounceBuff = findBuff(target, "pounce");
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
                    value: pounce.cooldown ?? 0
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
        const pounceBuff = findBuff(target, "pounce");
        if (pounceBuff) {
            effects.push({
                type: "buff",
                target: target,
                buff: pounceBuff,
                operation: "remove",
                linked: true
            });
        }
        const skunkedBuff = findBuff(target, "skunked");
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
    side: "player",
    targets: 1,
    baseDamage: SPRAY_DAMAGE,
    accuracy: {
        miss: 50,
        graze: 20,
        hit: 27,
        crit: 3
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        if (targets.length === 0) {
            return [];
        }
        const effects: iEffect[] = [];
        const target = targets[0];
        if (!move.binding) {
            return effects;
        }
        if (isCharacter(target.target)) {
            effects.push({
                type: "binding",
                target: target.target,
                binding: move.binding,
                amount: (this.baseDamage ?? 1) * target.effectiveness
            });
        }
        return effects;
    }
};

const pounce: MoveDef = {
    id: "pounce",
    side: "player",
    targets: 1,
    baseDamage: POUNCE_DAMAGE,
    cooldown: POUNCE_COOLDOWN,
    accuracy: {
        miss: 10,
        hit: 10,
        crit: 80
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (targets.length === 0) {
            return effects;
        }
        const target = targets[0].target;
        const effectiveness = targets[0].effectiveness;
        if (!isCharacter(target)) {
            return effects;
        }
        const buff = findBuff(target, "pounce");
        if (buff) {
            //we can't pounce someone that's already pounced
            return effects;
        }

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

        if (effectiveness >= 1.75 && move.binding && move.roll !== undefined) {
            effects.push({
                type: "move",
                actor: actor,
                move: {
                    definition: latexSpray,
                    binding: move.binding
                },
                targets:[target]
            })
        }

        return effects;
    }
};

const latexMist: MoveDef = {
    id: "latexMist",
    side: "player",
    targets: "all",
    baseDamage: MIST_DAMAGE,
    accuracy: {
        miss: 70,
        hit: 25,
        crit: 5
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];

        //1) Add spread buff to everyone based on the common roll
        const modifiers: ModifierSet = { "spread": Math.ceil((move.roll ?? 10) / 100 * MIST_SPREAD) };

        const buff: iBuff = {
            id: "latexMist",
            modifiers: modifiers,
            active: false,
            duration: 1
        }
        for (const character of validTargets(state.characters)) {
            effects.push({
                target: character,
                type: "buff",
                buff: buff,
                operation: "add"
            });
        }

        //2) Individual players get additional bondage based on their roll
        for (const target of targets) {
            const character = target.target;
            if (target.band === "hit" && isCharacter(character) && character.bindings.length > 0) {
                const index = effectivenessInt(target.effectiveness, 0, character.bindings.length - 1);
                const binding = character.bindings[index];
                effects.push({
                    type: "binding",
                    target: character,
                    binding: binding.definition,
                    amount: (this.baseDamage ?? 1) * target.effectiveness
                });
            }
            else if (target.band === "crit" && isCharacter(character) && character.bindings.length > 0) {
                for (const binding of character.bindings) {
                    effects.push({
                        type: "binding",
                        target: character,
                        binding: binding.definition,
                        amount: (this.baseDamage ?? 1) * target.effectiveness / 2
                    });
                }
            }
        }

        return effects;
    }
}

const throwOff: MoveDef = {
    id: "throwOff",
    alwaysAvailable: true,
    freeOnHit: true,
    side: "none",
    targets: 0,
    accuracy: {
        miss: 40,
        hit: 60
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (move.band === "miss") {
            return effects;
        }

        const pounceBuff = findBuff(actor, "pounce");
        if (pounceBuff) {
            effects.push({
                type: "buff",
                target: actor,
                buff: pounceBuff,
                operation: "remove",
                linked: true
            });
            if (pounceBuff.linkedEntity) {
                const enemy = findEnemy(state, pounceBuff.linkedEntity)
                if (enemy) {
                    effects.push({
                        type: "cooldown",
                        target: enemy,
                        move: pounce,
                        value: pounce.cooldown ?? 0
                    })
                }
            }
        }
        return effects;
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
        id: "pounce",
        statuses: tStatus,
        modifiers: tModifiers,
        active: active,
        addedMoves: [throwOff],
        linkedEntity: enemy.id
    }

    const eBuff: iBuff = {
        id: "pounce",
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