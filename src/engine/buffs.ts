import { isCharacter, isEnemy } from "./helpers";
import { iBuff, iEntity, iGameState } from "./itypes";
import { GameEvent } from "./types";

export function addBuff(actor:iEntity, target: iEntity, buff: iBuff): GameEvent[] {
    const events: GameEvent[] = [];
    const newBuff = {...buff};
    newBuff.active = true;
    if (isEnemy(actor))
        newBuff.active = false;
    target.buffs.push(newBuff);
    events.push({ type: "buffAdded", target: target.id, buff: newBuff.id });

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

    for (const entity of [...state.characters, ...state.enemies]) {
        for (const buff of [...entity.buffs]) {
            if (!buff.active) {
                buff.active = true;
                continue;
            }
            if (buff.duration === "infinite") {
                continue;
            }
            buff.duration--;
            if (buff.duration === 0) {
                events.push(...removeBuff(entity, buff));
            }
        }
    }

    return events;
}