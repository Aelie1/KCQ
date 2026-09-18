import { BindingDef, EnemyDef, MoveDef } from "../protected/definitions";
import { getValidTargets } from "../protected/enemies";
import { findBinding, findBuff, findEntity, isEnemy, isValidEntity, thresholds } from "../protected/helpers";
import { Random } from "../protected/random";
import { canMove } from "../protected/status";
import { iBuff, iCharacter, iEnemy, iEntity, iGameState, iIntentionRoll, iMove, iTrap } from "../protected/types";
import { BondageEvent, EntityId, GameEvent, StanceId, TargetInfo } from "../public/types";
import { evaluateIntention, resolveMove } from "./combat";
import { TRAP_MAX } from "./constants";
import { serializeEffects } from "./serialize";
import { iEngineEffect } from "./types";

export class GameEffects {
    private events: GameEvent[];
    private effects: iEngineEffect[];
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

    fromResult(other: GameEffects) {
        this.events.push(...other.events);
        this.stack(other.effects);
        this.resolve();
        this.refreshPreviews()
    }

    fromEffects(other: iEngineEffect[]) {
        this.stack(other);
        this.resolve();
        this.refreshPreviews()
    }

    private stack(other: iEngineEffect[]) {
        for (let i = other.length - 1; i >= 0; i--) {
            this.effects.push(other[i]);
        }
    }

    private refreshPreviews() {
        for (const enemy of this.state.enemies) {
            enemy.preview.length = 0;
            for (const intention of enemy.intentions) {
                const preview = {
                    ...intention,
                    move: { ...intention.move }
                };
                const iTargets = evaluateIntention(this.state, preview);
                const targets: TargetInfo[] = [];
                let effects = resolveMove(this.state, preview.move, preview.actor, iTargets);
                for (const iTarget of iTargets) {
                    const tEffects = effects.filter(x => "target" in x && x.target === iTarget.target);
                    targets.push({ target: iTarget.target.id, band: iTarget.band, effects: serializeEffects(tEffects) });
                    effects = effects.filter(x => !("target" in x) || x.target !== iTarget.target);
                }
                enemy.preview.push({
                    move: intention.move.definition.id,
                    targets: targets,
                    effects: serializeEffects(effects)
                });
            }
        }
    }

    private resolve() {
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
                        this.stack(effect.onResolve(effect));
                    }
                    if (effect.amount !== undefined) {
                        if (effect.amount > 0) {
                            this.addBinding(effect.source, effect.target, effect.binding, effect.amount);
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
                    switch (effect.operation) {
                        case "spawn":
                            this.spawnEnemy(effect.definition, { buff: effect.buff, id: effect.id, hp: effect.hpRatio });
                            break;
                        case "check":
                            this.checkEnemy(effect.target);
                            break;
                        case "defeat":
                            this.defeatEnemy(effect.target);
                            break;
                    }
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
                    this.addIntention(effect.actor, effect.move, effect.targets);
                    break;
                case "refresh":
                    this.refreshCharacter(effect.target);
                    break;
                case "intention":
                    switch (effect.operation) {
                        case "target":
                            this.retargetIntention(effect.target, effect.destination);
                            break;
                        case "cancel":
                            this.cancelIntentions(effect.target, effect.amount);
                            break;
                    }
                    break;
                case "data":
                    this.setData(effect.target, effect.name, effect.amount);
            }
        }
    };


    private addBinding(actor: iEntity, target: iCharacter, type: BindingDef, amount: number) {
        let modifiedAmount = amount;
        if (modifiedAmount > 0) {
            for (const buff of target.buffs) {
                if (buff.active && buff.modifyBinding) {
                    const result = buff.modifyBinding(actor, target, buff, type, modifiedAmount);
                    modifiedAmount = result.value;
                    this.stack(result.effects);
                }
            }
            if (modifiedAmount < amount) {
                this.addEvent({
                    type: "bondageBlocked",
                    target: target.id,
                    binding: type.id,
                    amount: amount - modifiedAmount
                });
            }
        }

        if (modifiedAmount <= 0) {
            return;
        }

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
            binding.value += Math.ceil(modifiedAmount * 0.1);
        } else {
            const toThreshold = Math.min(modifiedAmount, thresholds.impossible - origLevel);
            const overflow = modifiedAmount - toThreshold;
            binding.value += Math.ceil(toThreshold + overflow * 0.1);
        }
        if (binding.value > thresholds.max) {
            binding.value = thresholds.max;
        }

        event.amount = binding.value - origLevel;
        this.addEvent(event);

        if (type.onAdd) {
            this.stack(type.onAdd(this.state, target, binding, event.amount));
        }
    };

    private removeBinding(target: iCharacter, type: BindingDef, amount: number) {
        let binding = findBinding(target, type.id);
        if (!binding) {
            return;
        }
        let origLevel = binding.value;
        binding.value -= amount;
        if (binding.value <= 0) {
            binding.value = 0;
        }
        this.addEvent({
            type: binding.value === 0 ? "bondageRemoved" : "bondageChanged",
            target: target.id,
            binding: type.id,
            amount: binding.value - origLevel
        });
        if (binding.value === 0) {
            target.bindings.splice(target.bindings.indexOf(binding), 1);
        }
    };

    private addBuff(target: iEntity, buff: iBuff) {
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

    private removeBuff(target: iEntity, buff: iBuff) {
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


    private removeLinkedBuffs(target: iEntity, buff: iBuff) {
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


    private damageEnemy(actor: iEntity, target: iEnemy, amount: number) {
        const origHp = target.currHp;
        let modifiedAmount = amount;
        if (modifiedAmount > 0) {
            for (const buff of target.buffs) {
                if (buff.active && buff.modifyDamage) {
                    const result = buff.modifyDamage(target, buff, modifiedAmount);
                    modifiedAmount = result.value;
                    this.stack(result.effects);
                }
            }
            if (modifiedAmount < amount) {
                this.addEvent({
                    type: "damageBlocked",
                    target: target.id,
                    amount: amount - modifiedAmount
                });
            }
        }
        target.currHp -= modifiedAmount;
        target.currHp = Math.min(Math.max(0, target.currHp), target.maxHp);

        const newAmount = origHp - target.currHp;

        if (newAmount > 0) {
            this.addEvent({
                type: "enemyDamaged",
                target: target.id,
                amount: newAmount
            });
            this.effects.push({
                type: "enemy",
                operation: "check",
                target: target
            });

            if (target.definition.onDamage) {
                this.stack(target.definition.onDamage(this.state, actor, target, newAmount));
            }
        } else if (newAmount < 0) {
            this.addEvent({
                type: "enemyHealed",
                target: target.id,
                amount: -newAmount
            });
        }

        return;
    };

    private checkEnemy(target: iEnemy) {
        if (target.currHp <= 0) {
            this.effects.push({
                type: "enemy",
                operation: "defeat",
                target: target
            });

            if (target.definition.onDefeat) {
                this.stack(target.definition.onDefeat(this.state, target));
            }
        }
    }

    private defeatEnemy(target: iEnemy) {
        this.addEvent({
            type: "enemyDefeated",
            target: target.id,
        });

        this.state.enemies.splice(this.state.enemies.indexOf(target), 1);
        return;
    };

    private spawnEnemy(definition: EnemyDef, options?: { buff?: iBuff; id?: EntityId; hp?: number }) {
        if (!options?.id) {
            this.state.nextId[definition.id] = (this.state.nextId[definition.id] ?? 0) + 1;
        }
        const name = options?.id ? options.id : definition.id + this.state.nextId[definition.id];
        const hpRatio = Math.min(1, Math.max(0.1, (options?.hp ?? 1)));
        const enemy = {
            definition: definition,
            buffs: [],
            id: name,
            rank: definition.rank,
            maxHp: definition.hp,
            currHp: definition.hp * hpRatio,
            currDef: definition.defense,
            intentions: [],
            preview: [],
            cooldowns: {},
            data: {}
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

    private setCooldown(target: iEnemy, move: MoveDef, value: number) {
        target.cooldowns[move.id] = value;
        this.addEvent({
            type: "cooldownChanged",
            target: target.id,
            move: move.id,
            value: value
        });
        return;
    };

    private addTrap(actor: iEntity, trap: iTrap, amount: number) {
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
        });

        return;
    };

    private removeTrap(actor: iEntity, trap: iTrap, amount: number) {
        const origLevel = trap.amount;

        trap.amount -= amount;
        if (trap.amount < 0) {
            trap.amount = 0;
        }

        return;
    };

    private setStance(target: iCharacter, stance: StanceId) {
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

    private addIntention(actor: iEntity, move: iMove, targets: iEntity[]) {
        if (!isEnemy(actor)) {
            return;
        }
        const targetStates = [];
        const moveState = { ...move, roll: this.rng.random() };
        if (moveState.definition.targets === "all") {
            if (moveState.definition.targetSide === "either" || moveState.definition.targetSide === "enemy") {
                targetStates.push(...this.state.enemies);
            }
            if (moveState.definition.targetSide === "either" || moveState.definition.targetSide === "player") {
                targetStates.push(...getValidTargets(this.state.characters));
            }
        } else {
            targetStates.push(...targets);
        }
        const iTargets: iIntentionRoll[] = [];
        for (const target of targetStates) {
            iTargets.push({
                target: target,
                roll: this.rng.accuracy()
            });
        }
        if (moveState.definition.targets === 0) {
            iTargets.push({
                target: null,
                roll: this.rng.accuracy()
            });
        }
        actor.intentions.push({
            actor: actor,
            move: moveState,
            rolls: iTargets,
        });
    };

    private refreshCharacter(target: iCharacter) {
        if (target.acted) {
            this.addEvent({
                type: "actionRefreshed",
                target: target.id,
            });
            target.acted = false;
        }
    }

    private retargetIntention(target: iEnemy, destination: iCharacter) {
        let retargetted = false;
        for (const intention of target.intentions) {
            if ((intention.move.definition.targetSide === "either" ||
                intention.move.definition.targetSide === "player")
                && intention.move.definition.targets === 1
                && intention.rolls[0].target !== destination) {
                intention.rolls[0].target = destination;
                retargetted = true;
            }
        }
        if (retargetted) {
            this.addEvent({
                type: "targetChanged",
                target: target.id,
                destination: destination.id
            });
        }
    }

    private cancelIntentions(target: iEnemy, amount: number) {
        if (target.rank !== "boss") {
            target.intentions.length = 0;
            this.addEvent({
                type: "intentionCancelled",
                target: target.id,
            });
        }
        else {
            for (const intention of target.intentions) {
                if (intention.move.roll) {
                    intention.move.roll = Math.max(0, intention.move.roll - amount);
                }
                for (const roll of intention.rolls) {
                    roll.roll = Math.max(0, roll.roll - amount * 100);
                }
            }
            this.addEvent({
                type: "intentionWeakened",
                target: target.id,
            });
        }
    }

    private setData(target: iEntity, name: string, amount: number) {
        target.data[name] = Math.max(0, (target.data[name] ?? 0) + amount);
    }
};
