import { addBinding } from "../../../engine/bindings";
import { isCharacter } from "../../../engine/helpers";
import { EnemyDef, iEnemy, iEntity, iGameState, MoveDef } from "../../../engine/itypes";
import { GameAction, GameEvent } from "../../../engine/types";
import { latexarms } from "../../skunk/latex";

const latexspray: MoveDef = {
    activate: function (state: iGameState, actor: iEntity, targets: iEntity[]): GameEvent[] {
        const events: GameEvent[] = []
        const target = targets[0];
        if (isCharacter(target))
            events.push(...addBinding(target, latexarms, 30));
        return events;
    },
    id: "latexspray",
    target: "player",
    targets: 1,
    type: "enemy"
};

export const skunkette: EnemyDef = {
    id: "skunkette",
    hp: 20,
    defense: 10,
    moves: [latexspray],
    passives: [],
    ai: function (state: iGameState, actor: iEnemy): GameAction {
        const target = state.characters[0]; //this becomes random later
        const move = actor.definition.moves[0]; //this becomes smarter later, pounce->spray, mist, etc
        return { type: "attack", actor: actor.id, targets: [target.id], move: move.id };
    }
}