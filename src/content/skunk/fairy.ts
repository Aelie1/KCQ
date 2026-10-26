import { CallbackDef, EnemyDef, MoveDef } from "../../engine/protected/definitions";
import { getValidTargets, pickBinding, pickTarget, pickValidTarget } from "../../engine/protected/enemies";
import { isCharacter, isEnemy } from "../../engine/protected/helpers";
import { basicBindingEffect, tr } from "../../engine/protected/mechanics";
import { Random } from "../../engine/protected/random";
import { iBuff, iCallbackReturn, iEffect, iEnemy, iEntity, iGameState, iMove, iMoveEffect, iMoveResult, iTargetInfo } from "../../engine/protected/types";
import { HitBand } from "../../engine/public/types";
import { FAIRY_ID, HEAL_FILTER } from "./constants";
import { latexArms, latexHead, latexLegs, latexTorso } from "./latex";

const FAIRY_HP = 200;
const FAIRY_DEF = 0;

const BINDING_MAGIC_DAMAGE = 20;

const HEALING_MAGIC_HP_RATIO = 0.25;

const EMPOWERING_MAGIC_POTENCY = 5;
const EMPOWERING_MAGIC_DURATION = 1;

export const barrierCallback: CallbackDef = {
    id: "barrier",
    modifyDamage(target: iEnemy, buff: iBuff, amount: number): iCallbackReturn {
        const effects: iEffect[] = [];
        let newAmount = amount;
        if (amount > 0 && buff.duration && buff.duration > 0) {
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
}
export const bindingMagic: MoveDef = {
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
    traits: ["binding"],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicBindingEffect(actor, move, targets);
    },
};


export const healingMagic: MoveDef = {
    id: "healingMagic",
    targetSide: "enemy",
    targets: 1,
    accuracy: {
        hit: 95,
        crit: 5
    },
    type: "none",
    traits: ["heal"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };
        if (targets.length === 0) {
            return result;
        }

        const target = targets[0];
        if (target.band === "hit" || target.band === "crit") {

            if (isEnemy(target.target)) {
                result.targets.push(tr(target, [
                    {
                        type: "damage",
                        source: actor,
                        target: target.target,
                        amount: -HEALING_MAGIC_HP_RATIO * target.target.definition.hp
                    }]
                ));
            }
        }
        if (target.band === "crit") {
            const enemies = state.enemies.filter(x => (HEAL_FILTER.includes(x.definition.rank) && x.currHp < x.definition.hp));
            for (const enemy of enemies) {
                if (enemy !== target.target) {
                    result.effects.push({
                        type: "damage",
                        source: actor,
                        target: enemy,
                        amount: -HEALING_MAGIC_HP_RATIO * enemy.definition.hp
                    });
                }
            }
        }
        return result;
    },
};

export const empoweringMagic: MoveDef = {
    id: "empoweringMagic",
    targetSide: "enemy",
    targets: 1,
    accuracy: {
        hit: 95,
        crit: 5
    },
    type: "none",
    traits: ["buff"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };
        if (targets.length === 0) {
            return result;
        }

        const buff: iBuff = {
            id: move.definition.id,
            icon: "sword",
            duration: EMPOWERING_MAGIC_DURATION,
            modifiers: { potency: EMPOWERING_MAGIC_POTENCY },
            active: false,
        }

        const target = targets[0];
        if (target.band === "hit" || target.band === "crit") {

            if (isEnemy(target.target)) {
                result.targets.push(tr(target, [
                    {
                        type: "buff",
                        target: target.target,
                        buff: buff,
                        operation: "add"
                    }]
                ));
            }
        }
        if (target.band === "crit") {
            for (const enemy of state.enemies) {
                if (enemy !== target.target) {
                    result.effects.push({
                        type: "buff",
                        target: enemy,
                        buff: buff,
                        operation: "add"
                    });
                }
            }
        }
        return result;
    }
};

export const barrierMagic: MoveDef = {
    id: "barrierMagic",
    targetSide: "enemy",
    targets: 1,
    accuracy: {
        graze: 50,
        hit: 45,
        crit: 5
    },
    type: "none",
    traits: ["buff"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };
        if (targets.length === 0) {
            return result;
        }

        const durationByBand: Record<HitBand, number> = {
            none: 0,
            miss: 0,
            graze: 1,
            hit: 2,
            crit: 3,
        };

        const duration = durationByBand[targets[0].band];

        const buff: iBuff = {
            id: move.definition.id,
            icon: "shield",
            duration: duration,
            active: false,
            callback: barrierCallback
        }

        const target = targets[0];

        if (isEnemy(target.target)) {
            result.targets.push(tr(target, [
                {
                    type: "buff",
                    target: target.target,
                    buff: buff,
                    operation: "add"
                }]
            ));
        }
        return result;
    }
};

export const fairy: EnemyDef = {
    id: FAIRY_ID,
    rank: "enemy",
    hp: FAIRY_HP,
    defense: FAIRY_DEF,
    passives: [],
    moves: [healingMagic, empoweringMagic, barrierMagic, bindingMagic],
    ai: function (state: iGameState, actor: iEnemy, rng: Random): iMoveEffect[] {
        const effects: iMoveEffect[] = [];
        const bindings = [latexHead, latexArms, latexTorso, latexLegs];
        const validTargets = getValidTargets(state, state.enemies);

        //-1) Difficulty based extra attacks
        if (state.difficulty.id === "mythic" || (state.difficulty.id === "extreme" && rng.random() < 0.5)) {
            const target = pickValidTarget(state, state.characters, rng);
            if (target && isCharacter(target)) {
                const binding = pickBinding(target, bindings, rng);
                if (binding) {
                    effects.push({
                        type: "move",
                        actor: actor,
                        move: { definition: bindingMagic, binding: binding },
                        targets: [target]
                    });
                }
            }
        }

        //0) Determine which moves are valid
        const healTargets = validTargets.filter(x => (isEnemy(x) && HEAL_FILTER.includes(x.definition.rank) && x.currHp < x.definition.hp));

        const barrierTargets = validTargets.filter(x => !x.buffs.some(y => y.id === "barrierMagic"));

        const empowerTargets = validTargets;

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
        const target = pickValidTarget(state, state.characters, rng);
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
