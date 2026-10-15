import type { iBinding, iBuff, iCharacter, iEnemy, iGameState, iIntention } from "../protected/types";
import { SaveBinding, SaveBuff, SaveCharacter, SaveEnemy, SaveIntention, SaveState } from "../public/save";
import type { CampaignId } from "../public/types";
import { serializeMoveList, serializeStatus, serializeTraps } from "./serialize";

export function saveGameState(campaign: CampaignId, state: iGameState, seed: number, aiRng: number, accRng: number): SaveState {
    return {
        campaign: campaign,
        seed: seed,
        aiRng: aiRng,
        accRng: accRng,
        nextId: { ...state.nextId },
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
        data: { ...enemy.data }
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