import { CharacterDef, MoveDef, PassiveDef } from "../../engine/protected/definitions";
import { findBuff, isEnemy } from "../../engine/protected/helpers";
import { iBinding, iBuff, iCallbackReturn, iCharacter, iEffect, iEnemy, iEntity, iGameState, iMove, iTargetInfo } from "../../engine/protected/types";

const TELEKINESIS_DAMAGE = 100;

const thousandRestraintsBody: PassiveDef = {
    id: "thousandRestraintsBody",
    status: { allowedMoveTypes: ["arms", "legs", "mouth"], blocksEscape: true }
}

export const ko: CharacterDef = {
    id: "ko",
    getMoves: function (actor: iCharacter): MoveDef[] {
        const buff = findBuff(actor, "fairyEmpowerment");
        if (buff) {
            return [fairyTelekinesis, fairyStarlightBindings, fairyReflect, fairyEmpowerment];
        }
        else {
            return [telekinesis, starlightBindings, reflect, fairyTransformation];
        }
    },
    passives: [thousandRestraintsBody]
};

const telekinesis: MoveDef = {
    id: "telekinesis",
    targetSide: "enemy",
    targets: 1,
    baseDamage: TELEKINESIS_DAMAGE,
    type: "mouth",
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
                    amount: ((this.baseDamage ?? 1) * target.effectiveness)
                });
            }
        }
        const fairyBuff = findBuff(actor, "fairyEmpowerment");
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
}

const starlightBindings: MoveDef = {
    id: "starlightBindings",
    targetSide: "enemy",
    targets: 1,
    type: "mouth",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];

        const buff = {
            id: "starlightBindings",
            duration: 3,
            active: true,
            modifications: {
                defense: -2,
                hit: -2,
            }
        }

        for (const target of targets) {
            if (isEnemy(target.target)) {
                effects.push({
                    type: "buff",
                    target: target.target,
                    buff: buff,
                    operation: "add"
                });
            }
        }

        const fairyBuff = findBuff(actor, "fairyEmpowerment");
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
}

const reflect: MoveDef = {
    id: "reflect",
    targetSide: "player",
    targets: 0,
    type: "mouth",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        const newTargets: iEntity[] = [];
        if (targets.length === 0) {
            newTargets.push(actor);
        }
        else {
            newTargets.push(...targets.map(x => x.target));
        }

        const buff = {
            id: "reflect",
            active: true,
            modifyBinding: reflectCallback
        }

        for (const target of newTargets) {
            effects.push({
                type: "buff",
                target: target,
                buff: buff,
                operation: "add"
            });
        }

        const fairyBuff = findBuff(actor, "fairyEmpowerment");
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
}

const fairyTransformation: MoveDef = {
    id: "fairyTransformation",
    targetSide: "player",
    targets: 0,
    type: "mouth",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        const newTargets: iEntity[] = [];
        if (targets.length === 0) {
            newTargets.push(actor);
        }
        else {
            newTargets.push(...targets.map(x => x.target));
        }

        const buff = {
            id: "fairyTransformation",
            active: true,
            duration: 3,
            modifications: {
                defense: 3,
            }
        }

        for (const target of newTargets) {
            effects.push({
                type: "buff",
                target: target,
                buff: buff,
                operation: "add"
            });
        }

        const fairyBuff = findBuff(actor, "fairyEmpowerment");
        if (fairyBuff) {
            effects.push({
                type: "buff",
                target: actor,
                buff: fairyBuff,
                operation: "remove"
            })
        } else {
            const newBuff = {
                id: "fairyEmpowerment",
                active: true,
                modifyBinding: reflectCallback
            }

            effects.push({
                type: "buff",
                target: actor,
                buff: newBuff,
                operation: "add"
            })
        }
        return effects;
    }
}

const fairyTelekinesis: MoveDef = {
    ...telekinesis,
    id: "fairyTelekinesis",
    targets: "all",
}

const fairyStarlightBindings: MoveDef = {
    ...starlightBindings,
    id: "fairyStarlightBindings",
    targets: "all"
}

const fairyReflect: MoveDef = {
    ...reflect,
    id: "fairyReflect",
    targets: "all"
}

const fairyEmpowerment: MoveDef = {
    ...fairyTransformation,
    id: "fairyEmpowerment",
    targets: "all"
}

function reflectCallback(actor: iEnemy, target: iCharacter, buff: iBuff, binding: iBinding, amount: number): iCallbackReturn {
    const effects: iEffect[] = [];
    let newAmount = amount;
    if (buff.duration && buff.duration > 0) {
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
        newAmount = 0;
    }
    return { value: newAmount, effects: effects };
}