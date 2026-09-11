import { findBuff } from "./find";
import { isEnemy } from "./helpers";
import { iBuff, iEffect, iEntity, iGameState } from "./itypes";
import { GameEffects } from "./effects";

export function addBuff(actor: iEntity, target: iEntity, buff: iBuff): GameEffects {
    const result = new GameEffects();
    const oldBuff = findBuff(target, buff.id);
    const newBuff = { ...buff };
    newBuff.active = !isEnemy(actor);
    if (oldBuff) {
        const index = target.buffs.indexOf(oldBuff);
        target.buffs[index] = newBuff;
        result.addEvent({ 
            type: "buffUpdated", 
            target: target.id, 
            buff: newBuff.id 
        });
    } else {
        target.buffs.push(newBuff);
        result.addEvent({ 
            type: "buffAdded", 
            target: target.id, 
            buff: newBuff.id 
        });
    }
    return result;
}

export function removeBuff(target: iEntity, buff: iBuff): GameEffects {
    const result = new GameEffects();
    const index = target.buffs.indexOf(buff);
    if (index >= 0) {
        target.buffs.splice(index, 1);
        result.addEvent({ 
            type: "buffRemoved", 
            target: target.id, 
            buff: buff.id 
        });
    }
    return result;
}

export function tickBuffs(state: iGameState): GameEffects {
    const result = new GameEffects();
    const effects: iEffect[] = [];
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
                effects.push({
                    type: "buff",
                    buff: buff,
                    source: entity,
                    target: entity,
                    added: false
                });
            }
        }
    }
    result.fromEffects(state, effects);
    return result;
}