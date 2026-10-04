import type { EncounterDef, MoveDef } from "../protected/definitions";
import { getBindingLevel } from "../protected/mechanics";
import { GameStatus, getStatus, StatusMap } from "../protected/status";
import type { iBinding, iBuff, iCharacter, iEffect, iEnemy, iEntity, iGameState, iIntention, iMoveListModifier, iStatus, iTrap } from "../protected/types";
import type { Binding, Buff, Character, Effect, Encounter, Enemy, GameState, Intention, Move, MoveListModifier, PreviewInfo, Status, TargetInfo, Trap } from "../public/types";
import { evaluateBattleState, evaluateIntention, resolveMove } from "./combat";
import { iPreviewInfo } from "./types";

export function serializeGameState(state: iGameState, statuses: StatusMap): GameState {
    return {
        turn: {
            ...state.turn,
            outcome: evaluateBattleState(state, statuses)
        },
        characters: state.characters.map(x => serializeCharacter(x, getStatus(statuses, x))),
        enemies: state.enemies.map(x => serializeEnemy(state, x, statuses)),
        traps: state.traps.map(serializeTraps),
        encounter: state.encounter ? serializeEncounter(state.encounter) : null,
        difficulty: {
            ...state.difficulty,
            playerModifiers: { ...state.difficulty.playerModifiers },
            enemyModifiers: { ...state.difficulty.enemyModifiers },
        }
    };
}

function serializeCharacter(character: iCharacter, status: GameStatus): Character {
    return {
        id: character.id,
        acted: character.acted,
        standing: character.standing,
        bonusEscapes: character.bonusEscapes,
        modifiers: status.getModifiers(),
        bindings: character.bindings.map(x => serializeBinding(character, x)),
        buffs: character.buffs.filter(x => x.active).map(serializeBuff),
        cooldowns: { ...character.cooldowns },
        blockedMoveTypes: status.getBlockedMoveTypes(),
        data: { ...character.data }
    };
}

function serializeEnemy(state: iGameState, enemy: iEnemy, statuses: StatusMap): Enemy {
    return {
        id: enemy.id,
        defId: enemy.defId,
        rank: enemy.rank,
        maxHp: enemy.maxHp,
        currHp: enemy.currHp,
        currDef: enemy.currDef,
        intentions: enemy.intentions.map(x => (serializeIntention(state, statuses, x))),
        buffs: enemy.buffs.filter(x => x.active).map(serializeBuff),
        cooldowns: { ...enemy.cooldowns },
    };
}

function serializeIntention(state: iGameState, statuses: StatusMap, intention: iIntention): Intention {
    const preview = {
        ...intention,
        move: { ...intention.move }
    };
    const iTargets = evaluateIntention(state, preview, getStatus(statuses, intention.actor), statuses);
    const targets: TargetInfo[] = [];
    const result = resolveMove(state, preview.move, preview.actor, iTargets);
    for (const iTarget of iTargets) {
        const effects = (result.targets.find(x => x.target === iTarget.target)?.effects) ?? [];
        targets.push({ target: iTarget.target.id, band: iTarget.band, effects: serializeEffects(effects) });
    }
    return {
        move: intention.move.definition.id,
        targets: targets,
        effects: serializeEffects(result.effects)
    };
}


export function serializeEffects(effects: iEffect[]): Effect[] {
    return effects.map(serializeEffect).filter(x => x !== undefined);
}

function serializeEffect(effect: iEffect): Effect | undefined {
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
                buff: serializeBuff(effect.buff),
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

function serializeBuff(buff: iBuff): Buff {
    return {
        id: buff.id,
        duration: buff.duration,
        statuses: buff.statuses?.map(serializeStatus),
        modifiers: { ...buff.modifiers },
        moveList: serializeMoveList(buff.moveList),
        linkedEntity: buff.linkedEntity
    };
}

function serializeMoveList(list: iMoveListModifier | undefined): MoveListModifier | undefined {
    if (!list) {
        return undefined;
    }
    return {
        addedMoves: list.addedMoves?.map(x => x.id),
        blockedMoves: list.blockedMoves?.map(x => x.id)
    }
}

function serializeBinding(target: iCharacter, binding: iBinding): Binding {
    const level = getBindingLevel(binding);
    const status = binding.definition.status;
    return {
        id: binding.id,
        data: { ...binding.data },
        value: binding.value,
        level: level,
        status: status ? (status[level] ?? []).map(serializeStatus) : [],
        tickEffects: serializeEffects(binding.definition.onTick?.(target, binding) ?? [])
    };
}

function serializeTraps(trap: iTrap): Trap {
    return {
        id: trap.id,
        amount: trap.amount
    }
}

function serializeStatus(status: iStatus): Status {
    return {
        id: status.definition.id,
        value: status.value
    };
}

export function serializeMove(actor: iEntity, move: MoveDef): Move {
    return {
        id: move.id,
        targetSide: move.targetSide,
        targets: move.targets,
        hits: move.getHits?.(actor, move) ?? move.baseHits,
        type: move.type,
        ...(move.traits ? { traits: [...move.traits] } : {}),
    };
}

export function serializePreview(info: iPreviewInfo): PreviewInfo {
    const target = info.target === null ? null : info.target.id;

    if (!info.valid) {
        return {
            valid: false,
            target,
            reason: info.reason
        };
    }

    return {
        valid: true,
        target,
        ...(info.accuracy ? { accuracy: info.accuracy } : {}),
        damage: info.damage,
        effects: serializeEffects(info.effects)
    };
}

function serializeEncounter(encounter: EncounterDef): Encounter {
    return {
        id: encounter.id,
        enemies: [...encounter.enemies],
        bindings: encounter.bindings.map(x => x.id),
        traps: encounter.traps.map(x => x.definition.id)
    }
}
