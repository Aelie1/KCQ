import { evaluateResult, isValidTarget, resolveMove } from "../../engine/combat";
import { pickBinding, pickTarget, validTargets } from "../../engine/enemies";
import { findBuff, findCharacter, findEnemy } from "../../engine/find";
import { isCharacter } from "../../engine/helpers";
import { EnemyAction, EnemyDef, iBuff, iCharacter, iEffect, iEnemy, iEntity, iGameState, iMove, iStatus, iTargetInfo, MoveDef, s } from "../../engine/itypes";
import { effectivenessInt, Random } from "../../engine/random";
import { helpless, immobilized, isIncapacitated, stunned } from "../../engine/status";
import { ModifierSet } from "../../engine/types";
import { latexArms, latexHead, latexLegs, latexTorso } from "./latex";

const latexSpray: MoveDef = {
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        if (targets.length === 0) {
            return [];
        }
        const effects: iEffect[] = []
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
    },
    id: "latexSpray",
    side: "player",
    targets: 1,
    baseDamage: 15,
    accuracy: {
        miss: 10,
        graze: 25,
        hit: 65
    },
    type: "none"
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

const pounce: MoveDef = {
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        if (targets.length === 0) {
            return [];
        }
        const effects: iEffect[] = []
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
            const spray: iMove = {
                definition: latexSpray,
                binding: move.binding
            }
            const info = isValidTarget(state, actor,target,spray.definition);
            if (info.valid && info.accuracy) {
                const targets = [evaluateResult(target, info.accuracy, move.roll)];
                effects.push(...resolveMove(state, spray, actor, targets));
            }
        }

        return effects;
    },
    id: "pounce",
    side: "player",
    targets: 1,
    baseDamage: 10,
    cooldown: 2,
    accuracy: {
        miss: 40,
        hit: 50,
        crit: 10
    },
    type: "none"
};

const latexMist: MoveDef = {
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];

        //1) Add spread buff to everyone based on the common roll
        const modifiers: ModifierSet = { "spread": Math.ceil((move.roll ?? 10) / 20) };

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
                const index = effectivenessInt(target.effectiveness, 0, character.bindings.length - 1)
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
    },
    id: "latexMist",
    side: "player",
    targets: "all",
    baseDamage: 10,
    accuracy: {
        miss: 70,
        hit: 25,
        crit: 5
    },
    type: "none"
}

export const skunkette: EnemyDef = {
    id: "skunkette",
    hp: 20,
    defense: 0,
    passives: [],
    ai: function (state: iGameState, actor: iEnemy, rng: Random): EnemyAction {
        const bindings = [latexHead, latexArms, latexTorso, latexLegs];

        //1) Spray an existing pounced character
        const buff = findBuff(actor, "pounce");
        if (buff && buff.linkedEntity) {
            const target = findCharacter(state, buff.linkedEntity)
            if (target && !isIncapacitated(target)) {
                const binding = pickBinding(target, bindings, rng);
                return { actor: actor, targets: [target], move: { definition: latexSpray, binding: binding } };
            }
        }

        //2) Pounce if off cooldown and a valid target exists
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
                    return { actor: actor, targets: [target], move: { definition: pounce, binding: binding } };
                }
            }
        }

        //3) Use latex mist or latex spray with equal chance on a random target
        const roll = rng.int(1, 2);
        if (roll === 1) {
            //Latex mist
            return { actor: actor, targets: [], move: { definition: latexMist } };
        } else {
            const target = pickTarget(state.characters, rng);
            if (!target) {
                //No valid targets...
                return { actor: actor, targets: [], move: { definition: latexMist } };
            }
            const binding = pickBinding(target, bindings, rng);
            return { actor: actor, targets: [target], move: { definition: latexSpray, binding: binding } };
        }
    },
    onDamage(state: iGameState, actor: iEntity, target: iEnemy, damage: number): iEffect[] {
        const effects: iEffect[] = [];
        const buff = findBuff(target, "pounce");
        if (buff && buff.linkedEntity) {
            const character = findCharacter(state, buff.linkedEntity)
            if (character) {
                const tBuff = findBuff(character, "pounce");
                if (tBuff) {
                    const newLevel = (buff.modifiers?.hit ?? 1) / 2 - 1;
                    if (newLevel === 0) {
                        effects.push({
                            type: "buff",
                            target: character,
                            buff: tBuff,
                            operation: "remove"
                        });
                        effects.push({
                            type: "buff",
                            target: target,
                            buff: buff,
                            operation: "remove"
                        });
                    } else {
                        effects.push(...createPounceBuffs(character, target, newLevel, true));
                    }
                }
            }
        }
        return effects;
    },
    onDefeat(state: iGameState, target: iEnemy): iEffect[] {
        const effects: iEffect[] = [];
        const buff = findBuff(target, "pounce");
        if (buff && buff.linkedEntity) {
            const character = findCharacter(state, buff.linkedEntity)
            if (character) {
                const tBuff = findBuff(character, "pounce");
                if (tBuff) {
                    effects.push({
                        type: "buff",
                        target: character,
                        buff: tBuff,
                        operation: "remove"
                    });
                }
            }
        }
        return effects;
    },
}

const throwOff: MoveDef = {
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        if (move.band === "miss") {
            return [];
        }
        const effects: iEffect[] = []
        const buff = findBuff(actor, "pounce");
        if (!buff) {
            //how did you get here anyhow?
            return effects;
        }

        effects.push({
            target: actor,
            type: "buff",
            buff: buff,
            operation: "remove"
        });

        if (!buff.linkedEntity) {
            //a badly formed pounce?
            return effects;
        }

        const target = findEnemy(state, buff.linkedEntity);

        if (!target) {
            //pounce target died?
            return effects;
        }

        const tBuff = findBuff(target, "pounce");

        if (!tBuff) {
            //target lost their side of the pounce
            return effects;
        }

        effects.push({
            target: target,
            type: "buff",
            buff: tBuff,
            operation: "remove"
        });

        if (pounce.cooldown) {
            target.cooldowns["pounce"] = pounce.cooldown;
        }

        return effects;
    },
    id: "throwOff",
    alwaysAvailable: true,
    freeOnHit: true,
    side: "none",
    targets: 0,
    accuracy: {
        miss: 40,
        hit: 60
    },
    type: "none"
};

