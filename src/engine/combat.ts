import { iEnemy, iGameState } from "./itypes";
import { DamageEvent, DefeatEvent, GameEvent } from "./types";

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
        events.push(...defeatEnemy(state,target));
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
    state.enemies.splice(state.enemies.indexOf(target));
    return events;
}