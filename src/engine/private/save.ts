import type { iBinding, iBuff, iCharacter, iEffect, iEnemy, iGameState, iIntention } from "../protected/types";
import { SaveBinding, SaveBuff, SaveCharacter, SaveEnemy, SaveIntention, SaveState } from "../public/save";
import type { Effect } from "../public/types";
import { serializeMoveList, serializeStatus, serializeTraps } from "./serialize";

export function saveGameState(state: iGameState, seed: number, aiRng: number, accRng: number): SaveState {
    return {
        seed: seed,
        aiRng: aiRng,
        accRng: accRng,
        nextId: state.nextId,
        turn: {
            round: state.turn.round,
            step: state.turn.step,
            phase: state.turn.phase,
        },
        characters: state.characters.map(saveCharacter),
        enemies: state.enemies.map(saveEnemy),
        traps: state.traps.map(serializeTraps),
        encounter: state.encounter ? state.encounter.id : null,
        difficulty: state.difficulty.id
    }
};

function saveCharacter(character: iCharacter): SaveCharacter {
    return {
        id: character.id,
        acted: character.acted,
        standing: character.standing,
        bonusEscapes: character.bonusEscapes,
        bindings: character.bindings.map(saveBinding),
        buffs: character.buffs.map(saveBuff),
        cooldowns: { ...character.cooldowns },
        data: { ...character.data }
    };
}

function saveEnemy(enemy: iEnemy): SaveEnemy {
    return {
        id: enemy.id,
        defId: enemy.defId,
        currHp: enemy.currHp,
        intentions: enemy.intentions.map(saveIntention),
        buffs: enemy.buffs.map(saveBuff),
        cooldowns: { ...enemy.cooldowns },
    };
}

function saveIntention(intention: iIntention): SaveIntention {
    return {
        actor: intention.actor.id,
        move: {
            definition: intention.move.definition.id,
            binding: intention.move.binding?.id,
            band: intention.move.band,
            effectiveness: intention.move.effectiveness,
            roll: intention.move.roll,
            data: intention.move.data
                ? { ...intention.move.data }
                : undefined,
        },
        rolls: intention.rolls.map(x => ({
            target: x.target?.id ?? null,
            roll: x.roll,
        })),
        resolved: intention.resolved,
    };
}

export function saveEffects(effects: iEffect[]): Effect[] {
    return effects.map(saveEffect).filter(x => x !== undefined);
}

function saveEffect(effect: iEffect): Effect | undefined {
    switch (effect.type) {
        case "binding":
            return {
                type: effect.type,
                target: effect.target.id,
                binding: effect.binding.id,
                amount: effect.amount
            };
        case "buff":
            return {
                type: effect.type,
                target: effect.target.id,
                buff: saveBuff(effect.buff),
                operation: effect.operation
            }
        case "damage":
            return {
                type: effect.type,
                target: effect.target.id,
                amount: effect.amount
            }
        case "enemy":
            return {
                type: effect.type,
                target: (effect.operation === "spawn") ? effect.definition : effect.target.id,
                operation: effect.operation
            }
        case "trap":
            return {
                type: effect.type,
                trap: effect.trap.id,
                amount: effect.amount
            }
        case "move":
            return {
                type: effect.type,
                move: effect.move.definition.id
            }
        case "data":
            if (effect.visible) {
                return {
                    type: effect.type,
                    target: effect.target.id,
                    name: effect.name,
                    amount: effect.amount
                }
            }
            break;
        case "intention":
            if (effect.operation === "cancel") {
                return {
                    type: effect.type,
                    operation: effect.operation,
                    target: effect.target.id,
                    amount: effect.amount
                }
            } else if (effect.operation === "target") {
                return {
                    type: effect.type,
                    operation: effect.operation,
                    target: effect.target.id,
                    destination: effect.destination.id
                }
            }
        case "refresh":
            return {
                type: effect.type,
                target: effect.target.id,
            }
    }
}

function saveBuff(buff: iBuff): SaveBuff {
    return {
        id: buff.id,
        icon: buff.icon,
        severity: buff.severity,
        duration: buff.duration,
        statuses: buff.statuses?.map(serializeStatus),
        modifiers: { ...buff.modifiers },
        moveList: serializeMoveList(buff.moveList),
        linkedEntity: buff.linkedEntity,
        active: buff.active,
        callback: buff.callback?.id,
    };
}

function saveBinding(binding: iBinding): SaveBinding {
    return {
        id: binding.id,
        value: binding.value,
        data: { ...binding.data }
    }
}