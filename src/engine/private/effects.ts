import { thresholds, TRAP_MAX } from "../protected/constants";
import { validTargets } from "../protected/enemies";
import { findBinding, findBuff, findEntity } from "../protected/find";
import { isEnemy, isValidEntity } from "../protected/helpers";
import { BindingDef, EnemyDef, iBuff, iCharacter, iEffect, iEnemy, iEntity, iGameState, iIntentionRoll, iTrap, MoveDef } from "../protected/itypes";
import { Random } from "../protected/random";
import { canMove } from "../protected/status";
import { BondageEvent, DamageEvent, EnemyEvent, EntityId, GameEvent, StanceId } from "../public/types";

export class GameEffects {
    private events: GameEvent[];
    private effects: iEffect[];
    private state: iGameState;
    private rng: Random;

    constructor(state: iGameState, rng: Random) {
        this.events = [];
        this.effects = [];
        this.state = state;
        this.rng = rng;
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
        this.resolve();
    }

    fromEffects(state: iGameState, other: iEffect[]) {
        this.effects.push(...other);
        this.resolve();
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

    private resolve() {
        this.effects.reverse();

        while (this.effects.length > 0) {
            const effect = this.effects.pop();
            if (!effect) {
                continue;
            }
            if ("target" in effect && !isValidEntity(this.state, effect.target)) {
                continue;
            }
            switch (effect.type) {
                case "binding":
                    if (effect.onResolve) {
                        this.stackEffects(effect.onResolve(effect));
                    }
                    if (effect.amount !== undefined) {
                        if (effect.amount > 0) {
                            this.addBinding(effect.target, effect.binding, effect.amount);
                        } else {
                            this.removeBinding(effect.target, effect.binding, -effect.amount);
                        }
                    }
                    break;
                case "buff":
                    if (effect.operation == "add") {
                        this.addBuff(effect.target, effect.buff);
                    } else {
                        if (effect.linked) {
                            this.removeLinkedBuffs(effect.target, effect.buff);
                        } else {
                            this.removeBuff(effect.target, effect.buff);
                        }
                    }
                    break;
                case "damage":
                    this.damageEnemy(effect.source, effect.target, effect.amount);
                    break;
                case "enemy":
                    this.spawnEnemy(effect.definition, { buff: effect.buff, id: effect.id, hp: effect.hpRatio });
                    break;
                case "cooldown":
                    this.setCooldown(effect.target, effect.move, effect.value);
                    break;
                case "trap":
                    if (effect.amount > 0) {
                        this.addTrap(effect.actor, effect.trap, effect.amount);
                    } else {
                        this.removeTrap(effect.actor, effect.trap, -effect.amount);
                    }
                    break;
                case "stance":
                    this.setStance(effect.actor, effect.stance);
                    break;
                case "move":
                    this.addIntention(effect);
                    break;
            }
        }

    };


    addBinding(target: iCharacter, type: BindingDef, amount: number) {
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
        this.addEvent(event);

        if (type.onAdd) {
            this.stackEffects(type.onAdd(this.state, target, binding, event.amount));
        }
    };

    removeBinding(target: iCharacter, type: BindingDef, amount: number) {
        const event: BondageEvent = {
            type: "bondageChanged",
            target: target.id,
            binding: type.id,
            amount: 0
        };
        let binding = findBinding(target, type.id);
        if (!binding) {
            //character doesnt have it, do nothing
            return;
        }
        let origLevel = binding.value;
        binding.value -= amount;
        if (binding.value <= 0) {
            binding.value = 0;
            event.type = "bondageRemoved";
        }
        event.amount = binding.value - origLevel;
        this.addEvent(event);
        if (binding.value === 0) {
            //it's at 0, remove it entirely
            target.bindings.splice(target.bindings.indexOf(binding), 1);
        }
    };

    addBuff(target: iEntity, buff: iBuff) {
        const oldBuff = findBuff(target, buff.id);
        const newBuff = { ...buff };
        if (oldBuff) {
            const index = target.buffs.indexOf(oldBuff);
            target.buffs[index] = newBuff;
            this.addEvent({
                type: "buffUpdated",
                target: target.id,
                buff: newBuff.id
            });
        } else {
            target.buffs.push(newBuff);
            this.addEvent({
                type: "buffAdded",
                target: target.id,
                buff: newBuff.id
            });
        }
        return;
    };

    removeBuff(target: iEntity, buff: iBuff) {
        const index = target.buffs.indexOf(buff);
        if (index >= 0) {
            target.buffs.splice(index, 1);
            this.addEvent({
                type: "buffRemoved",
                target: target.id,
                buff: buff.id
            });
        }
        return;
    };


    removeLinkedBuffs(target: iEntity, buff: iBuff) {

        this.removeBuff(target, buff);
        if (!buff.linkedEntity) {
            return;
        }

        const linkedEntity = findEntity(this.state, buff.linkedEntity);
        if (!linkedEntity) {
            return;
        }

        const linkedBuff = findBuff(linkedEntity, buff.id);
        if (!linkedBuff) {
            return;
        }

        this.removeBuff(linkedEntity, linkedBuff);
        return;
    };


    damageEnemy(actor: iEntity, target: iEnemy, amount: number) {
        target.currHp -= amount;
        const event: DamageEvent = {
            type: "enemyDamaged",
            target: target.id,
            amount: amount
        };
        this.addEvent(event);

        if (target.definition.onDamage) {
            this.stackEffects(target.definition.onDamage(this.state, actor, target, amount));
            this.resolve();
        }

        if (target.currHp <= 0) {
            this.defeatEnemy(target);
        }
        return;
    };

    defeatEnemy(target: iEnemy) {
        const event: EnemyEvent = {
            type: "enemyDefeated",
            target: target.id,
        };
        this.addEvent(event);

        if (target.definition.onDefeat) {
            target.definition.onDefeat(this.state, target);
        }

        this.state.enemies.splice(this.state.enemies.indexOf(target), 1);
        return;
    };

    spawnEnemy(definition: EnemyDef, options?: { buff?: iBuff; id?: EntityId; hp?: number }) {
        if (!options?.id) {
            this.state.nextId[definition.id] = (this.state.nextId[definition.id] ?? 0) + 1;
        }
        const name = options?.id ? options.id : definition.id + this.state.nextId[definition.id];
        const hpRatio = Math.min(1, Math.max(0.1, (options?.hp ?? 1)));
        const enemy = {
            definition: definition,
            buffs: [],
            id: name,
            maxHp: definition.hp,
            currHp: definition.hp * hpRatio,
            currDef: definition.defense,
            intention: [],
            cooldowns: {}
        };
        this.state.enemies.push(enemy);

        this.addEvent({
            type: "enemySpawned",
            target: name
        });

        if (options?.buff) {
            this.effects.push({
                type: "buff",
                target: enemy,
                buff: options.buff,
                operation: "add"
            });
        }
        return;
    };

    setCooldown(target: iEnemy, move: MoveDef, value: number) {
        target.cooldowns[move.id] = value;
        this.addEvent({
            type: "cooldownChanged",
            target: target.id,
            move: move.id,
            value: value
        });
        return;
    };

    addTrap(actor: iEntity, trap: iTrap, amount: number) {
        const origLevel = trap.amount;

        trap.amount += amount;
        if (trap.amount > TRAP_MAX) {
            trap.amount = TRAP_MAX;
        }

        this.addEvent({
            type: "trapAdded",
            actor: actor.id,
            trap: trap.id,
            amount: trap.amount - origLevel
        })

        return;
    };

    removeTrap(actor: iEntity, trap: iTrap, amount: number) {
        const origLevel = trap.amount;

        trap.amount -= amount;
        if (trap.amount < 0) {
            trap.amount = 0;
        }

        return;
    };

    setStance(target: iCharacter, stance: StanceId) {
        switch (stance) {
            case "standing":
                if (!target.standing) {
                    this.addEvent({
                        type: "stanceChanged",
                        actor: target.id,
                        stance: stance
                    });
                    target.standing = true;
                }
                break;
            case "moving":
                if (target.standing && canMove(target)) {
                    this.addEvent({
                        type: "stanceChanged",
                        actor: target.id,
                        stance: stance
                    });
                    target.standing = false;
                }
                break;
        }
        return;
    };

    addIntention(action: iEffect) {
        if (action.type != "move" || !isEnemy(action.actor)) {
            return;
        }
        const targets = [];
        const move = { ...action.move, roll: this.rng.accuracy() };
        if (move.definition.targets === "all") {
            if (move.definition.side === "enemy") {
                targets.push(...this.state.enemies);
            } else {
                targets.push(...validTargets(this.state.characters));
            }
        } else {
            targets.push(...action.targets);
        }
        const iTargets: iIntentionRoll[] = [];
        for (const target of targets) {
            iTargets.push({
                target: target,
                roll: this.rng.accuracy()
            });
        }
        if (move.definition.targets === 0) {
            iTargets.push({
                target: null,
                roll: this.rng.accuracy()
            });
        }
        action.actor.intention.push({
            actor: action.actor,
            move: move,
            rolls: iTargets
        });
    };

}