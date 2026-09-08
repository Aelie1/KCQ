import { iBuff, iEntity, iGameState } from "./itypes";
import { GameEvent } from "./types";

export function addBuff(target: iEntity, buff: iBuff): GameEvent[] {
    const events: GameEvent[] = [];
    target.buffs.push(buff);
    events.push({ type: "buffAdded", target: target.id, buff: buff.id });

    return events;
}

export function removeBuff(target: iEntity, buff: iBuff): GameEvent[] {
    const events: GameEvent[] = [];
    const index = target.buffs.indexOf(buff);
    if (index >= 0) {
        target.buffs.splice(index, 1);
        events.push({ type: "buffRemoved", target: target.id, buff: buff.id });
    }
    return events;
}

export function tickBuffs(state: iGameState): GameEvent[] {
    const events: GameEvent[] = [];

    for (const character of state.characters) {
        for (const buff of [...character.buffs]) {
            if (buff.duration === "infinite") {
                continue;
            }
            buff.duration--;
            if (buff.duration === 0) {
                events.push(...removeBuff(character, buff));
            }
        }
    }

    for (const enemy of state.enemies) {
        for (const buff of [...enemy.buffs]) {
            if (buff.duration === "infinite") {
                continue;
            }
            if (buff.active) {
                buff.duration--;
                if (buff.duration === 0) {
                    events.push(...removeBuff(enemy, buff));
                }
            } else {
                buff.active = true;
            }
        }
    }

    return events;
}