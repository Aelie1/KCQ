import { EnemyDef, MoveDef } from "../../engine/protected/definitions";
import { isCharacter } from "../../engine/protected/helpers";
import { effectivenessInt, Random } from "../../engine/protected/random";
import { iEffect, iEnemy, iEntity, iGameState, iMove, iMoveEffect, iTargetInfo } from "../../engine/protected/types";
import { latexArms, latexHead, latexLegs, latexTorso } from "./latex";

const RAINMAKER_HP = 200;
const RAINMAKER_DEF = 0;

const RAIN_DAMAGE = 10;

export const rainmaker: EnemyDef = {
    id: "rainmaker",
    rank: "minion",
    hp: RAINMAKER_HP,
    defense: RAINMAKER_DEF,
    passives: [],
    ai: function (state: iGameState, actor: iEnemy, rng: Random): iMoveEffect[] {
        const effects: iMoveEffect[] = [];
        effects.push({
            type: "move",
            actor: actor,
            move: { definition: latexRain },
            targets: [state.characters[0]]
        });
        return effects;
    }
}

const latexRain: MoveDef = {
    id: "latexRain",
    targetSide: "player",
    targets: "all",
    baseDamage: RAIN_DAMAGE,
    accuracy: {
        miss: 50,
        hit: 50,
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        const bindings = [latexHead, latexArms, latexTorso, latexLegs];
        if (targets.length === 0) {
            return effects;
        }

        for (const target of targets) {
            if (isCharacter(target.target)) {
                const count = effectivenessInt(target.effectiveness, 1, bindings.length);
                const start = effectivenessInt(target.effectiveness / bindings.length, 0, bindings.length - 1);

                for (let i = 0; i < count; i++) {
                    const index = (start + i) % bindings.length
                    const binding = bindings[index];
                    effects.push({
                        type: "binding",
                        source: actor,
                        target: target.target,
                        binding: binding,
                        amount: (move.definition.baseDamage ?? 1) * target.effectiveness
                    });
                }
            }
        }
        return effects;
    },
};