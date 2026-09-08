import { addBinding } from "../../engine/bindings";
import { isCharacter } from "../../engine/helpers";
import { DamageMoveDef, EnemyDef, iEnemy, iEntity, iGameState, TargetInfo } from "../../engine/itypes";
import { GameAction, GameEvent } from "../../engine/types";
import { latexarms } from "./latex";

const latexspray: DamageMoveDef = {
    activate: function (state: iGameState, actor: iEntity, targets: TargetInfo[]): GameEvent[] {
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
    ai: function (state: iGameState, actor: iEnemy): GameAction {
        const target = state.characters[0]; //this becomes random later
        const move = actor.definition.moves[0]; //this becomes smarter later, pounce->spray, mist, etc
        return { type: "attack", actor: actor.id, targets: [target.id], move: move.id };
    }
}