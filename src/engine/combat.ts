import { effectivenessRange } from "./constants";
import { getIEntitySide } from "./helpers";
import { iCharacter, iEnemy, iEntity, iGameState, MoveDef } from "./itypes";
import { canMove } from "./status";
import { AccuracyProfile, AccuracyResult, DamageEvent, DefeatEvent, GameEvent, StanceId, TargetInfo } from "./types";

export function isValidMove(state: iGameState, actor: iEntity, targets: TargetInfo[], move: MoveDef): boolean {
    if (targets.length !== move.targets) {
        return false;
    }
    for (const target of targets) {
        if (getIEntitySide(target.target) !== move.target) {
            return false;
        }
    }
    if (move.isValid)
        return move.isValid(state, actor, targets)
    return true;
}

export function damageEnemy(state: iGameState, target: iEnemy, amount: number): GameEvent[] {
    const events: GameEvent[] = [];
    const intAmount =Math.ceil(amount);
    target.currHp -= intAmount;
    const event: DamageEvent = {
        type: "damage",
        target: target.id,
        amount: intAmount
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

export function calculateAccuracy(actor: iEntity, target: iEntity, move: MoveDef): AccuracyProfile {
    //This is where the magic will happen someday
    return {...move.accuracy};
}

export function evaluateResult(target: iEntity, accuracy: AccuracyProfile, roll: number): TargetInfo {
    const result: TargetInfo = { target: target, result: "miss", effectiveness: 0 };

    const order: AccuracyResult[] = ["miss", "graze", "hit", "crit"];

    let cumulative = 0;
    for (const band of order) {
        const value = accuracy[band];
        if (value !== undefined && value > 0) {
            result.result = band;
            if (roll < cumulative + value) {
                if (band !== "miss") {
                    const [min, max] = effectivenessRange[band];
                    const effect = (roll - cumulative) / value;
                    result.effectiveness = min + (max-min) * effect;
                }
                return result;
            }
            cumulative += value;
        }
    }
    //rolled above the highest band, return the top of the highest band
    result.effectiveness = effectivenessRange[result.result][1];

    return result;
}