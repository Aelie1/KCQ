import { isCharacter } from "../../engine/helpers";
import { BindingMoveDef, EnemyAction, EnemyDef, iEffect, iEnemy, iEntity, iGameState, iTargetInfo } from "../../engine/itypes";
import { latexarms as latexArms, latexbindings as latexBindings } from "./latex";

const latexSpray: BindingMoveDef = {
    resolve: function (state: iGameState, actor: iEntity, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = []
        for (const target of targets) {
            if (isCharacter(target.target)) {
                effects.push({
                    type:"binding",
                    target:target.target,
                    binding:this.binding,
                    amount:this.baseDamage*target.effectiveness
                });
            }
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


const latexSprayArms: BindingMoveDef = {
    ...latexSpray,
    id:"latexSprayArms",
    displayId:"latexSpray",
    binding: latexArms
};

export const skunkette: EnemyDef = {
    id: "skunkette",
    hp: 20,
    defense: 0,
    moves: [latexSprayArms],
    passives: [],
    ai: function (state: iGameState, actor: iEnemy): EnemyAction {
        const target = state.characters[0]; //this becomes random later
        const move = this.moves[0]; //this becomes smarter later, pounce->spray, mist, etc
        return { actor: actor, targets: [target], move: move };
    }
}