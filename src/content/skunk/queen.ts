import { EnemyDef, MoveDef } from "../../engine/protected/definitions";
import { pickBinding } from "../../engine/protected/enemies";
import { isCharacter } from "../../engine/protected/helpers";
import { Random } from "../../engine/protected/random";
import { iEffect, iEnemy, iEntity, iGameState, iMove, iTargetInfo } from "../../engine/protected/types";
import { latexArms, latexCollar, latexHead, latexLegs, latexTorso } from "./latex";

const QUEEN_HP = 300;
const QUEEN_DEF = 0;

const GUN_DAMAGE = 35;

const COLLAR_DAMAGE = 50;

const PUDDLE_BASE = 25;

const REGENERATION_DAMAGE = 30;

const EXPLOSION_HP_RATIO = 0.25;
const EXPLOSION_HEAL = QUEEN_HP * 0.2;
const EXPLOSION_DAMAGE = 25;

export const queen: EnemyDef = {
    id: "queen",
    hp: QUEEN_HP,
    defense: QUEEN_DEF,
    passives: [],
    ai: function (state: iGameState, actor: iEnemy, rng: Random): iEffect[] {
        const effects: iEffect[] = [];
        const bindings = [latexHead, latexArms, latexTorso, latexLegs];
        const roll = rng.int(1, 2)
        if (roll === 1) {
            const binding = pickBinding(state.characters[0], bindings, rng);
            effects.push({
                type: "move",
                actor: actor,
                move: { definition: skunkGun, binding: binding },
                targets: [state.characters[0]]
            });
            return effects;
        }
        else {
            effects.push({
                type: "move",
                actor: actor,
                move: { definition: skunkCollar },
                targets: [state.characters[0]]
            });
            return effects;
        }
    }
}


const skunkGun: MoveDef = {
    id: "skunkGun",
    side: "player",
    targets: 1,
    baseDamage: GUN_DAMAGE,
    accuracy: {
        miss: 50,
        graze: 25,
        hit: 24,
        crit: 1
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
                target: target.target,
                binding: move.binding,
                amount: (this.baseDamage ?? 1) * target.effectiveness
            });
        }
        return effects;
    },
};

const skunkCollar: MoveDef = {
    id: "skunkCollar",
    side: "player",
    targets: 1,
    baseDamage: COLLAR_DAMAGE,
    cooldown: 3,
    accuracy: {
        miss: 60,
        graze: 25,
        hit: 14,
        crit: 1
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (targets.length === 0) {
            return effects;
        }

        const target = targets[0];

        if (isCharacter(target.target)) {
            effects.push({
                type: "binding",
                target: target.target,
                binding: latexCollar,
                amount: (this.baseDamage ?? 1) * target.effectiveness
            });
        }
        return effects;
    },
};
