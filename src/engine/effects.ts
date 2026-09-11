import { thresholds } from "./constants";
import { findBinding, findBuff } from "./find";
import { isValidEntity } from "./helpers";
import { BindingDef, iBuff, iCharacter, iEffect, iEnemy, iEntity, iGameState } from "./itypes";
import { BondageEvent, DamageEvent, EnemyEvent, GameEvent } from "./types";

export class GameEffects {
    private events: GameEvent[];
    private effects: iEffect[];

    constructor() {
        this.events = [];
        this.effects = [];
    }

    getEvents() : GameEvent[] {
        return [...this.events];
    }

    addEvent(event: GameEvent) {
        this.events.push(event);
    }

    fromResult(state: iGameState, other: GameEffects) {
        this.events.push(...other.events);
        this.effects.push(...other.effects);
        this.resolve(state);
    }

    fromEffects(state: iGameState, other: iEffect[]) {
        this.effects.push(...other);
        this.resolve(state);
    }

    private stack(other: GameEffects) {
        this.events.push(...other.events);

        for (let i = other.effects.length - 1; i >= 0; i--) {
            this.effects.push(other.effects[i]);
        }
    }

    private resolve(state: iGameState) {
        this.effects.reverse();
    
        while (this.effects.length > 0) {
            const effect = this.effects.pop();
            if (effect === undefined) {
                continue;
            }
            if (!isValidEntity(state, effect.target)) {
                continue;
            }
            switch (effect.type) {
                case "binding":
                    if (effect.amount > 0) {
                        this.stack(addBinding(state, effect.target, effect.binding, effect.amount))
                    } else {
                        this.stack(removeBinding(state, effect.target, effect.binding, -effect.amount))
                    }
                    break;
                case "buff":
                    if (effect.operation == "add") {
                        this.stack(addBuff(effect.target, effect.buff))
                    } else {
                        this.stack(removeBuff(effect.target, effect.buff))
                    }
                    break;
                case "damage":
                    this.stack(damageEnemy(state, effect.source, effect.target, effect.amount))
                    break;
            }
        }
    
    }
}

function addBinding(state: iGameState, target: iCharacter, type: BindingDef, amount: number): GameEffects {
    const result = new GameEffects();
    const event: BondageEvent = {
        type: "bondageChanged",
        target: target.id,
        binding: type.id,
        amount: 0
    };
    let binding = findBinding(target, type.id);
    if (!binding) {
        //character doesnt have it, let's add it
        binding = {
            definition: type,
            id: type.id,
            value: 0,
            data: { ...type.data }
        };
        target.bindings.push(binding);
        event.type = "bondageAdded";
    }
    let origLevel = binding.value;
    //bondage above 80 is reduced by 90%
    if (origLevel > thresholds.impossible) {
        binding.value += Math.ceil(amount * 0.1);
    } else {
        const toThreshold = Math.min(amount, thresholds.impossible - origLevel);
        const overflow = amount - toThreshold;
        binding.value += Math.ceil(toThreshold + overflow * 0.1);
    }
    if (binding.value > thresholds.max) {
        binding.value = thresholds.max;
    }

    event.amount = binding.value - origLevel;
    result.addEvent(event);

    if (type.onAdd) {
        result.fromEffects(state, type.onAdd(target, binding, event.amount));
    }

    return result;
}

function removeBinding(state: iGameState, target: iCharacter, type: BindingDef, amount: number): GameEffects {
    const result = new GameEffects();
    const event: BondageEvent = { type: "bondageChanged", target: target.id, binding: type.id, amount: 0 };
    let binding = findBinding(target, type.id);
    if (!binding) {
        //character doesnt have it, do nothing
        return result;
    }
    let origLevel = binding.value;
    binding.value -= amount;
    if (binding.value <= 0) {
        binding.value = 0;
        event.type = "bondageRemoved";
    }
    event.amount = binding.value - origLevel;
    result.addEvent(event);
    if (binding.value === 0) {
        //it's at 0, remove it entirely
        target.bindings.splice(target.bindings.indexOf(binding), 1);
    }

    return result;
}

function addBuff(target: iEntity, buff: iBuff): GameEffects {
    const result = new GameEffects();
    const oldBuff = findBuff(target, buff.id);
    const newBuff = { ...buff };
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

function removeBuff(target: iEntity, buff: iBuff): GameEffects {
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

function damageEnemy(state: iGameState, actor: iEntity, target: iEnemy, amount: number): GameEffects {
    const result = new GameEffects();
    target.currHp -= amount;
    const event: DamageEvent = {
        type: "damage",
        target: target.id,
        amount: amount
    };
    result.addEvent(event);
    if (target.definition.onDamage) {
        result.fromEffects(state, target.definition.onDamage(state, actor, target, amount));
    }


    if (target.currHp <= 0) {
        result.fromResult(state, defeatEnemy(state, target));
    }
    return result;
}

function defeatEnemy(state: iGameState, target: iEnemy): GameEffects {
    const result = new GameEffects();
    const event: EnemyEvent = {
        type: "enemyDefeated",
        target: target.id,
    };
    result.addEvent(event);
    if (target.definition.onDefeat) {
        result.fromEffects(state, target.definition.onDefeat(state, target));
    }
    state.enemies.splice(state.enemies.indexOf(target), 1);
    return result;
}

