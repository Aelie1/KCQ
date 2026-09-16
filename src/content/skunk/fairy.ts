import { EnemyDef, MoveDef } from "../../engine/protected/definitions";
import { pickBinding, pickTarget } from "../../engine/protected/enemies";
import { isCharacter, isEnemy } from "../../engine/protected/helpers";
import { Random } from "../../engine/protected/random";
import { iBuff, iCallbackReturn, iEffect, iEnemy, iEntity, iGameState, iMove, iMoveEffect, iTargetInfo } from "../../engine/protected/types";
import { HitBand } from "../../engine/public/types";
import { latexArms, latexHead, latexLegs, latexTorso } from "./latex";

const FAIRY_HP = 200;
const FAIRY_DEF = 0;

const BINDING_MAGIC_DAMAGE = 10;

const HEALING_MAGIC_HP_RATIO = 0.25;

const EMPOWERING_MAGIC_POTENCY = 5;
const EMPOWERING_MAGIC_DURATION = 1;

export const fairy: EnemyDef = {
    id: "fairy",
    hp: FAIRY_HP,
    defense: FAIRY_DEF,
    passives: [],
    ai: function (state: iGameState, actor: iEnemy, rng: Random): iMoveEffect[] {
        const effects: iMoveEffect[] = [];
        const bindings = [latexHead, latexArms, latexTorso, latexLegs];

        //0) Determine which moves are valid
        const healFilter = ["skunkette", "skunk"];
        const healTargets = state.enemies.filter(x => (healFilter.includes(x.definition.id) && x.currHp < x.maxHp));

        const barrierFilter = ["skunkette", "skunk", "queen"];
        const barrierTargets = state.enemies.filter(x => (barrierFilter.includes(x.definition.id)) && !x.buffs.some(y => y.id === "barrierMagic"));

        const empowerFilter = ["skunkette", "skunk", "queen"];
        const empowerTargets = state.enemies.filter(x => (empowerFilter.includes(x.definition.id)));

        type FairyAction = "heal" | "barrier" | "empower";
        const actions: FairyAction[] = [];

        if (healTargets.length > 0) {
            actions.push("heal");
        }

        if (barrierTargets.length > 0) {
            actions.push("barrier");
        }

        if (empowerTargets.length > 0) {
            actions.push("empower");
        }

        //1) Select a random action out of the random valid actions
        const roll = Math.floor(rng.random() * actions.length);

        switch (actions[roll]) {
            case "heal":
                const healTarget = pickTarget(healTargets, rng);
                if (healTarget) {
                    effects.push({
                        type: "move",
                        actor: actor,
                        move: { definition: healingMagic },
                        targets: [healTarget]
                    });
                    return effects;
                }
                break;
            case "barrier":
                const barrierTarget = pickTarget(barrierTargets, rng);
                if (barrierTarget) {
                    effects.push({
                        type: "move",
                        actor: actor,
                        move: { definition: barrierMagic },
                        targets: [barrierTarget]
                    });
                    return effects;
                }
                break;
            case "empower":
                const empowerTarget = pickTarget(empowerTargets, rng);
                if (empowerTarget) {
                    effects.push({
                        type: "move",
                        actor: actor,
                        move: { definition: empoweringMagic },
                        targets: [empowerTarget]
                    });
                    return effects;
                }
                break;
        }


        //2) If no valid actions, basic attack
        const target = pickTarget(state.characters, rng);
        if (target && isCharacter(target)) {
            const binding = pickBinding(target, bindings, rng);
            if (binding) {
                effects.push({
                    type: "move",
                    actor: actor,
                    move: { definition: bindingMagic, binding: binding },
                    targets: [target]
                });
                return effects;
            }
        }

        return effects;
    }
}

const bindingMagic: MoveDef = {
    id: "bindingMagic",
    targetSide: "player",
    targets: 1,
    baseDamage: BINDING_MAGIC_DAMAGE,
    accuracy: {
        miss: 50,
        graze: 15,
        hit: 25,
        crit: 10
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (targets.length === 0) {
            return effects;
        }

        const target = targets[0];
        if (!move.binding) {
            return effects;
        }

        if (isCharacter(target.target)) {
            effects.push({
                type: "binding",
                source: actor,
                target: target.target,
                binding: move.binding,
                amount: (this.baseDamage ?? 1) * target.effectiveness
            });
        }
        return effects;
    },
};


const healingMagic: MoveDef = {
    id: "healingMagic",
    targetSide: "enemy",
    targets: 1,
    accuracy: {
        hit: 95,
        crit: 5
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (targets.length === 0) {
            return effects;
        }

        const target = targets[0];
        if (target.band === "hit") {

            if (isEnemy(target.target)) {
                effects.push({
                    type: "damage",
                    source: actor,
                    target: target.target,
                    amount: -HEALING_MAGIC_HP_RATIO * target.target.maxHp
                });
            }
        } else if (target.band === "crit") {
            const filter = ["skunkette", "skunk", "fairy"];
            const enemies = state.enemies.filter(x => (filter.includes(x.definition.id) && x.currHp < x.maxHp));
            for (const enemy of enemies) {
                effects.push({
                    type: "damage",
                    source: actor,
                    target: enemy,
                    amount: -HEALING_MAGIC_HP_RATIO * enemy.maxHp
                });
            }
        }
        return effects;
    },
};

const empoweringMagic: MoveDef = {
    id: "empoweringMagic",
    targetSide: "enemy",
    targets: 1,
    accuracy: {
        hit: 95,
        crit: 5
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (targets.length === 0) {
            return effects;
        }

        const buff = {
            id: "empoweringMagic",
            duration: EMPOWERING_MAGIC_DURATION,
            modifiers: { potency: EMPOWERING_MAGIC_POTENCY },
            active: false,
        }

        const target = targets[0];
        if (target.band === "hit") {

            if (isEnemy(target.target)) {
                effects.push({
                    type: "buff",
                    target: target.target,
                    buff: buff,
                    operation: "add"
                });
            }
        } else if (target.band === "crit") {
            const filter = ["skunkette", "skunk", "fairy", "queen"];
            const enemies = state.enemies.filter(x => (filter.includes(x.definition.id)));
            for (const enemy of enemies) {
                effects.push({
                    type: "buff",
                    target: enemy,
                    buff: buff,
                    operation: "add"
                });
            }
        }
        return effects;
    }
};

const barrierMagic: MoveDef = {
    id: "barrierMagic",
    targetSide: "enemy",
    targets: 1,
    accuracy: {
        graze: 50,
        hit: 45,
        crit: 5
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (targets.length === 0) {
            return effects;
        }

        const durationByBand: Record<HitBand, number> = {
            none: 0,
            miss: 0,
            graze: 1,
            hit: 2,
            crit: 3,
        };

        const duration = durationByBand[targets[0].band];

        const buff = {
            id: "barrierMagic",
            duration: duration,
            active: false,
            modifyDamage: barrierCallback
        }

        const target = targets[0];

        if (isEnemy(target.target)) {
            effects.push({
                type: "buff",
                target: target.target,
                buff: buff,
                operation: "add"
            });
        }
        return effects;
    }
};



function barrierCallback(target: iEntity, buff: iBuff, amount: number): iCallbackReturn {
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
        newAmount = 0;
    }
    return { value: newAmount, effects: effects };
}