import { getIEntitySide } from "./helpers";
import { iCharacter, iEnemy, iEntity, iGameState, MoveDef } from "./itypes";
import { canMove } from "./status";
import { DamageEvent, DefeatEvent, GameEvent, StanceId } from "./types";

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
        return move.isValid(state, actor, targets)
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

export function setStance(target: iCharacter, stance: StanceId): GameEvent[] {
    const events: GameEvent[] = [];
    switch (stance) {
        case "standing":
            if (!target.standing) {
                events.push({ type: "stanceChanged", actor: target.id, stance: stance });
                target.standing = true;
            }
            break;
        case "moving":
            if (target.standing && canMove(target)) {
                events.push({ type: "stanceChanged", actor: target.id, stance: stance });
                target.standing = false;
            }
            break;
    }
    return events;
}