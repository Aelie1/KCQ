import { addBinding } from "../../engine/bindings";
import { isCharacter } from "../../engine/helpers";
import { DamageMoveDef, EnemyAction, EnemyDef, iEnemy, iEntity, iGameState, iTargetInfo } from "../../engine/itypes";
import { PlayerAction, GameEvent } from "../../engine/types";
import { latexarms } from "./latex";

const latexspray: DamageMoveDef = {
    activate: function (state: iGameState, actor: iEntity, targets: iTargetInfo[]): GameEvent[] {
        const events: GameEvent[] = []
        const target = targets[0].target;
        const effectiveness = targets[0].effectiveness;
        if (isCharacter(target))
            events.push(...addBinding(target, latexarms, this.baseDamage*effectiveness));
        return events;
    },
    id: "latexspray",
    target: "player",
    targets: 1,
    baseDamage: 20,
    accuracy: {
        miss: 10,
        graze: 25,
        hit: 65
    },
    type: "enemy"
};

export const skunkette: EnemyDef = {
    id: "skunkette",
    hp: 20,
    defense: 0,
    moves: [latexspray],
    passives: [],
    ai: function (state: iGameState, actor: iEnemy): EnemyAction {
        const target = state.characters[0]; //this becomes random later
        const move = actor.definition.moves[0]; //this becomes smarter later, pounce->spray, mist, etc
        return { actor: actor, targets: [target], move: move };
    }
}