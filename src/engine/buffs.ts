import { findBuff } from "./find";
import { isEnemy } from "./helpers";
import { iBuff, iEntity, iGameState } from "./itypes";
import { iEvents } from "./effects";

export function addBuff(actor: iEntity, target: iEntity, buff: iBuff): iEvents {
    const result = new iEvents();
    const oldBuff = findBuff(target, buff.id);
    const newBuff = { ...buff };
    newBuff.active = !isEnemy(actor);
    if (oldBuff) {
        const index = target.buffs.indexOf(oldBuff);
        target.buffs[index] = newBuff;
        result.events.push({ type: "buffUpdated", target: target.id, buff: newBuff.id });
    } else {
        target.buffs.push(newBuff);
        result.events.push({ type: "buffAdded", target: target.id, buff: newBuff.id });
    }
    return result;
}

export function removeBuff(target: iEntity, buff: iBuff): iEvents {
    const result = new iEvents();
    const index = target.buffs.indexOf(buff);
    if (index >= 0) {
        target.buffs.splice(index, 1);
        result.events.push({ type: "buffRemoved", target: target.id, buff: buff.id });
    }
    return result;
}

export function tickBuffs(state: iGameState): iEvents {
    const result = new iEvents();

    for (const entity of [...state.characters, ...state.enemies]) {
        for (const buff of [...entity.buffs]) {
            if (!buff.active) {
                buff.active = true;
                continue;
            }
            if (buff.duration === undefined) {
                continue;
            }
            buff.duration--;
            if (buff.duration === 0) {
                result.effects.push({
                    type: "buff",
                    buff: buff,
                    source: entity,
                    target: entity,
                    added: false
                });
            }
        }
    }
    result.process(state);
    return result;
}