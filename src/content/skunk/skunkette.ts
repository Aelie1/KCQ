import { pickBinding } from "../../engine/bindings";
import { calculateAccuracy, evaluateResult, pickTarget } from "../../engine/combat";
import { findBuff, findCharacter, findEnemy } from "../../engine/find";
import { isCharacter } from "../../engine/helpers";
import { EnemyAction, EnemyDef, iBuff, iCharacter, iEffect, iEnemy, iEntity, iGameState, iMove, iStatus, iTargetInfo, MoveDef, s } from "../../engine/itypes";
import { resolveMove } from "../../engine/moves";
import { Random } from "../../engine/random";
import { helpless, immobilized, isIncapacitated, stunned } from "../../engine/status";
import { ModifierSet } from "../../engine/types";
import { latexArms, latexHead, latexLegs, latexTorso } from "./latex";

const latexSpray: MoveDef = {
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = []
        const target = targets[0];
        if (move.binding === undefined) {
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
    target: "player",
    targets: 1,
    baseDamage: 15,
    accuracy: {
        miss: 10,
        graze: 25,
        hit: 65
    },
    type: "enemy"
};

export const pounce: MoveDef = {
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
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

        const tStatus: iStatus[] = [s(immobilized, 1)];
        const tModifiers: ModifierSet = {};
        const aModifiers: ModifierSet = { defense: -2 };
        if (effectiveness < 0.875) {
            aModifiers.hit = 2;
        }
        else if (effectiveness < 0.95) {
            tModifiers.hit = -1;
            aModifiers.hit = 4;
        }
        else if (effectiveness < 1.5) {
            tStatus.push(s(stunned, 1));
            tModifiers.hit = -2;
            aModifiers.hit = 6;
        } else {
            tStatus.push(s(helpless, 1));
            aModifiers.hit = 8;
        }

        const tBuff: iBuff = {
            id: "pounce",
            statuses: tStatus,
            modifiers: tModifiers,
            active: false,
            addedMoves: [throwOff],
            linkedEntity: actor.id
        }

        const aBuff: iBuff = {
            id: "pounce",
            modifiers: aModifiers,
            active: false,
            linkedEntity: target.id
        }

        effects.push({
            source: actor,
            target: target,
            type: "buff",
            buff: tBuff,
            added: true
        });

        effects.push({
            source: actor,
            target: actor,
            type: "buff",
            buff: aBuff,
            added: true
        });

        if (effectiveness >= 1.75 && move.binding !== undefined && move.roll !== undefined) {
            const spray: iMove = {
                definition: latexSpray,
                binding: move.binding
            }
            const accuracy = calculateAccuracy(actor, target, spray.definition);
            const info = [evaluateResult(target, accuracy, move.roll)];
            
            effects.push(...resolveMove(state, spray, actor, info));
        }

        return effects;
    },
    id: "pounce",
    target: "player",
    targets: 1,
    baseDamage: 10,
    accuracy: {
        miss: 40,
        hit: 50,
        crit: 10
    },
    type: "enemy"
};

export const latexMist: MoveDef = {
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        return [];
    },
    id: "latexMist",
    target: "player",
    targets: 0,
    type: "enemy"
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
        if (buff && buff.linkedEntity !== undefined) {
            const target = findCharacter(state, buff.linkedEntity)
            if (target !== undefined && !isIncapacitated(target)) {
                const binding = pickBinding(target, bindings, rng);
                return { actor: actor, targets: [target], move: { definition: latexSpray, binding: binding } };
            }
        }

        //2) Pounce if off cooldown and a valid target exists
        if ((actor.cooldowns['pounce'] ?? 0) === 0) {
            const validCharacters: iCharacter[] = [];
            for (const character of state.characters) {
                const cBuff = findBuff(character, "pounce");
                if (cBuff === undefined) {
                    validCharacters.push(character);
                }
            }
            if (validCharacters.length > 0) {
                const target = pickTarget(validCharacters, rng);
                if (target !== undefined) {
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
            if (target === undefined) {
                //No valid targets...
                return { actor: actor, targets: [], move: { definition: latexMist } };
            }
            const binding = pickBinding(target, bindings, rng);
            return { actor: actor, targets: [target], move: { definition: latexSpray, binding: binding } };
        }
    }
}

export const throwOff: MoveDef = {
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = []
        const buff = findBuff(actor, "pounce");
        if (!buff) {
            //how did you get here anyhow?
            return effects;
        }

        effects.push({
            source: actor,
            target: actor,
            type: "buff",
            buff: buff,
            added: false
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
            source: actor,
            target: target,
            type: "buff",
            buff: tBuff,
            added: false
        });

        return effects;
    },
    id: "throwOff",
    alwaysAvailable: true,
    target: "none",
    targets: 0,
    accuracy: {
        miss: 40,
        hit: 60
    },
    type: "enemy"
};

