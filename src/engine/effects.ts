import { thresholds, TRAP_MAX } from "./constants";
import { findBinding, findBuff, findEntity } from "./find";
import { isValidEntity } from "./helpers";
import { BindingDef, EnemyDef, iBuff, iCharacter, iEffect, iEnemy, iEntity, iGameState, iTrap, MoveDef } from "./itypes";
import { BondageEvent, DamageEvent, EnemyEvent, EntityId, GameEvent } from "./types";

export class GameEffects {
    private events: GameEvent[];
    private effects: iEffect[];

    constructor() {
        this.events = [];
        this.effects = [];
    }

    getEvents(): GameEvent[] {
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

    private stackEffects(other: iEffect[]) {
        for (let i = other.length - 1; i >= 0; i--) {
            this.effects.push(other[i]);
        }
    }

    private resolve(state: iGameState) {
        this.effects.reverse();

        while (this.effects.length > 0) {
            const effect = this.effects.pop();
            if (!effect) {
                continue;
            }
            if ("target" in effect && !isValidEntity(state, effect.target)) {
                continue;
            }
            switch (effect.type) {
                case "binding":
                    if (effect.onResolve) {
                        this.stackEffects(effect.onResolve(effect));
                    }
                    if (effect.amount !== undefined) {
                        if (effect.amount > 0) {
                            this.stack(addBinding(state, effect.target, effect.binding, effect.amount));
                        } else {
                            this.stack(removeBinding(state, effect.target, effect.binding, -effect.amount));
                        }
                    }
                    break;
                case "buff":
                    if (effect.operation == "add") {
                        this.stack(addBuff(effect.target, effect.buff));
                    } else {
                        if (effect.linked) {
                            this.stack(removeLinkedBuffs(state, effect.target, effect.buff));
                        } else {
                            this.stack(removeBuff(effect.target, effect.buff));
                        }
                    }
                    break;
                case "damage":
                    this.stack(damageEnemy(state, effect.source, effect.target, effect.amount));
                    break;
                case "enemy":
                    this.stack(spawnEnemy(state, effect.definition, { buff: effect.buff, id: effect.id }));
                    break;
                case "cooldown":
                    this.stack(setCooldown(effect.target, effect.move, effect.value));
                    break;
                case "trap":
                    if (effect.amount > 0) {
                        this.stack(addTrap(effect.actor, effect.trap, effect.amount));
                    } else {
                        this.stack(removeTrap(effect.actor, effect.trap, -effect.amount));
                    }
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
        result.fromEffects(state, type.onAdd(state, target, binding, event.amount));
    }

    return result;
}

function removeBinding(state: iGameState, target: iCharacter, type: BindingDef, amount: number): GameEffects {
    const result = new GameEffects();
    const event: BondageEvent = {
        type: "bondageChanged",
        target: target.id,
        binding: type.id,
        amount: 0
    };
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


function removeLinkedBuffs(state: iGameState, target: iEntity, buff: iBuff): GameEffects {
    const result = new GameEffects();

    result.fromResult(state, removeBuff(target, buff));
    if (!buff.linkedEntity) {
        return result;
    }

    const linkedEntity = findEntity(state, buff.linkedEntity);
    if (!linkedEntity) {
        return result;
    }

    const linkedBuff = findBuff(linkedEntity, buff.id);
    if (!linkedBuff) {
        return result;
    }

    result.fromResult(state, removeBuff(linkedEntity, linkedBuff));
    return result;
}


function damageEnemy(state: iGameState, actor: iEntity, target: iEnemy, amount: number): GameEffects {
    const result = new GameEffects();
    target.currHp -= amount;
    const event: DamageEvent = {
        type: "enemyDamaged",
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

function spawnEnemy(state: iGameState, definition: EnemyDef, options?: { buff?: iBuff; id?: EntityId; }): GameEffects {
    const result = new GameEffects();
    if (!options?.id) {
        state.nextId[definition.id] = (state.nextId[definition.id] ?? 0) + 1;
    }
    const name = options?.id ? options.id : definition.id + state.nextId[definition.id];
    const enemy = {
        definition: definition,
        buffs: [],
        id: name,
        maxHp: definition.hp,
        currHp: definition.hp,
        currDef: definition.defense,
        intention: null,
        cooldowns: {}
    };
    state.enemies.push(enemy);
    result.addEvent({
        type: "enemySpawned",
        target: name
    });
    if (options?.buff) {
        const effects: iEffect[] = [];
        effects.push({
            type: "buff",
            target: enemy,
            buff: options.buff,
            operation: "add"
        });
        result.fromEffects(state, effects);
    }
    return result;
}

function setCooldown(target: iEnemy, move: MoveDef, value: number): GameEffects {
    const result = new GameEffects();
    target.cooldowns[move.id] = value;
    result.addEvent({
        type: "cooldownChanged",
        target: target.id,
        move: move.id,
        value: value
    });
    return result;
}

function addTrap(actor: iEntity, trap: iTrap, amount: number): GameEffects {
    const result = new GameEffects();

    const origLevel = trap.amount;

    trap.amount += amount;
    if (trap.amount > TRAP_MAX) {
        trap.amount = TRAP_MAX;
    }

    result.addEvent({
        type: "trapAdded",
        actor: actor.id,
        trap: trap.id,
        amount: trap.amount - origLevel
    })

    return result;
}

function removeTrap(actor: iEntity, trap: iTrap, amount: number): GameEffects {
    const result = new GameEffects();

    const origLevel = trap.amount;

    trap.amount -= amount;
    if (trap.amount < 0) {
        trap.amount = 0;
    }

    return result;
}