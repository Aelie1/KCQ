import { findBuff, findEnemy } from "../../engine/find";
import { isCharacter } from "../../engine/helpers";
import { BindingMoveDef, EnemyAction, EnemyDef, iBuff, iEffect, iEnemy, iEntity, iGameState, iStatus, iTargetInfo, MoveDef, s } from "../../engine/itypes";
import { helpless, immobilized, stunned } from "../../engine/status";
import { ModifierSet } from "../../engine/types";
import { latexArms, latexBindings, latexHead, latexLegs, latexTorso } from "./latex";

const latexSpray: BindingMoveDef = {
    resolve: function (state: iGameState, actor: iEntity, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = []
        const target = targets[0];
        if (isCharacter(target.target)) {
            effects.push({
                type: "binding",
                target: target.target,
                binding: this.binding,
                amount: this.baseDamage * target.effectiveness
            });
        }
        return effects;
    },
    id: "latexSpray",
    displayId: "latexSpray",
    target: "player",
    targets: 1,
    baseDamage: 15,
    binding: latexBindings,
    accuracy: {
        miss: 10,
        graze: 25,
        hit: 65
    },
    type: "enemy"
};


const latexSprayHead: BindingMoveDef = {
    ...latexSpray,
    id: "latexSprayHead",
    binding: latexHead
};

const latexSprayArms: BindingMoveDef = {
    ...latexSpray,
    id: "latexSprayArms",
    binding: latexArms
};

const latexSprayTorso: BindingMoveDef = {
    ...latexSpray,
    id: "latexSprayTorso",
    binding: latexTorso
};

const latexSprayLegs: BindingMoveDef = {
    ...latexSpray,
    id: "latexSprayLegs",
    binding: latexLegs
};


export const pounce: MoveDef = {
    resolve: function (state: iGameState, actor: iEntity, targets: iTargetInfo[]): iEffect[] {
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

        const tStatus: iStatus[] = [s(immobilized,1)];
        const tModifiers: ModifierSet = {};
        const aModifiers: ModifierSet = {defense:-2};
        if (effectiveness < 0.875) {
            aModifiers.hit = 2;
        } 
        else if (effectiveness < 0.95) {
            tModifiers.hit = -1;
            aModifiers.hit = 4;
        }
        else if (effectiveness < 1.5) {
            tStatus.push(s(stunned,1));
            tModifiers.hit = -2;
            aModifiers.hit = 6;
        } else {
            tStatus.push(s(helpless,1));
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

        return effects;
    },
    id: "pounce",
    displayId: "pounce",
    target: "player",
    targets: 1,
    accuracy: {
        miss: 40,
        hit: 50,
        crit: 10
    },
    type: "enemy"
};

export const skunkette: EnemyDef = {
    id: "skunkette",
    hp: 20,
    defense: 0,
    passives: [],
    ai: function (state: iGameState, actor: iEnemy): EnemyAction {
        const target = state.characters[0]; //this becomes random later
        const move = latexSprayArms; //this becomes smarter later, pounce->spray, mist, etc
        return { actor: actor, targets: [target], move: move };
    }
}

export const throwOff: MoveDef = {
    resolve: function (state: iGameState, actor: iEntity, targets: iTargetInfo[]): iEffect[] {
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
    displayId: "throwOff",
    alwaysAvailable: true,
    target: "none",
    targets: 0,
    accuracy: {
        miss: 40,
        hit: 60
    },
    type: "enemy"
};

