import { getIEntitySide } from "./helpers";
import { iEnemy, iEntity, iGameState, MoveDef } from "./itypes";
import { DamageEvent, DefeatEvent, GameEvent } from "./types";

export function isValidMove(state: iGameState, actor: iEntity, targets: iEntity[], move: MoveDef): boolean {
    if (targets.length !== move.targets) {
        return false;
    }
    for (const target of targets) {
        if (getIEntitySide(target) !== move.target) {
            return false;
        }
    }
    if (move.isValid)
        return move.isValid(state,actor,targets)
    return true;
}

export function damageEnemy(state: iGameState, target: iEnemy, amount: number): GameEvent[] {
    const events: GameEvent[] = [];
    target.currHp -= amount;
    const event: DamageEvent = {
        type: "damage",
        target: target.id,
        amount: amount
    };
    events.push(event);
    if (target.currHp <= 0) {
        events.push(...defeatEnemy(state, target));
    }
    return events;
}

export function defeatEnemy(state: iGameState, target: iEnemy): GameEvent[] {
    const events: GameEvent[] = [];
    const event: DefeatEvent = {
        type: "enemyDefeated",
        target: target.id,
    };
    events.push(event);
    state.enemies.splice(state.enemies.indexOf(target), 1);
    return events;
}