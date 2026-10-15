import type { ContentCatalog, iBinding, iBuff, iCharacter, iEnemy, iEntity, iGameState, iIntention } from "../protected/types";
import { SaveBinding, SaveBuff, SaveCharacter, SaveEnemy, SaveIntention, SaveState } from "../public/save";
import type { CampaignId } from "../public/types";
import { isValidEntity } from "../protected/helpers";
import { serializeMoveList, serializeStatus, serializeTraps } from "./serialize";
import { difficulties } from "./constants";

export function loadGameState(save: SaveState, catalog: ContentCatalog): iGameState {
    const resolve = <T extends { id: string }>(definitions: T[], id: string, kind: string): T => {
        const definition = definitions.find(x => x.id === id);
        if (!definition) {
            throw new Error(`Unknown ${kind} reference in save: ${id}`);
        }
        return definition;
    };
    const loadCooldowns = (cooldowns: Record<string, number>) => {
        for (const id of Object.keys(cooldowns)) {
            resolve(catalog.moves, id, "cooldown move");
        }
        return { ...cooldowns };
    };
    const loadBuff = (buff: SaveBuff): iBuff => ({
        ...buff,
        statuses: buff.statuses?.map(status => ({
            definition: resolve(catalog.statuses, status.id, "status"),
            value: status.value,
        })),
        modifiers: { ...buff.modifiers },
        moveList: buff.moveList ? {
            addedMoves: buff.moveList.addedMoves?.map(id => resolve(catalog.moves, id, "added move")),
            blockedMoves: buff.moveList.blockedMoves?.map(id => resolve(catalog.moves, id, "blocked move")),
        } : undefined,
        callback: buff.callback === undefined ? undefined : resolve(catalog.callbacks, buff.callback, "callback"),
    });

    if (!Object.hasOwn(difficulties, save.difficulty)) {
        throw new Error(`Unknown difficulty reference in save: ${save.difficulty}`);
    }
    for (const id of Object.keys(save.nextId)) {
        resolve(catalog.enemies, id, "next-ID enemy");
    }
    const state: iGameState = {
        turn: { ...save.turn },
        nextId: { ...save.nextId },
        characters: save.characters.map(character => ({
            ...character,
            definition: resolve(catalog.characters, character.id, "character"),
            bindings: character.bindings.map(binding => ({
                ...binding,
                definition: resolve(catalog.bindings, binding.id, "binding"),
                data: { ...binding.data },
            })),
            buffs: character.buffs.map(loadBuff),
            cooldowns: loadCooldowns(character.cooldowns),
            data: { ...character.data },
        })),
        enemies: save.enemies.map(enemy => ({
            ...enemy,
            definition: resolve(catalog.enemies, enemy.defId, "enemy"),
            intentions: [],
            buffs: enemy.buffs.map(loadBuff),
            cooldowns: loadCooldowns(enemy.cooldowns),
            data: { ...enemy.data },
        })),
        traps: save.traps.map(trap => ({
            ...trap,
            definition: resolve(catalog.traps, trap.id, "trap"),
        })),
        encounter: save.encounter === null ? null : resolve(catalog.encounters, save.encounter, "encounter"),
        difficulty: difficulties[save.difficulty],
    };

    // Intentions must point to the restored objects, including enemies appearing later in the save.
    const entities = new Map<string, iEntity>();
    for (const entity of [...state.characters, ...state.enemies]) {
        if (entities.has(entity.id)) {
            throw new Error(`Duplicate entity ID in save: ${entity.id}`);
        }
        entities.set(entity.id, entity);
    }
    const resolveEntity = (id: string, kind: string): iEntity => {
        const entity = entities.get(id);
        if (!entity) {
            throw new Error(`Unknown intention ${kind} reference in save: ${id}`);
        }
        return entity;
    };
    state.enemies.forEach((enemy, index) => {
        enemy.intentions = save.enemies[index].intentions.map(intention => ({
            actor: resolveEntity(intention.actor, "actor"),
            move: {
                ...intention.move,
                definition: resolve(catalog.moves, intention.move.definition, "intention move"),
                binding: intention.move.binding === undefined ? undefined
                    : resolve(catalog.bindings, intention.move.binding, "intention binding"),
                data: intention.move.data ? { ...intention.move.data } : undefined,
            },
            rolls: intention.rolls.map(roll => ({
                target: roll.target === null ? null : resolveEntity(roll.target, "target"),
                roll: roll.roll,
            })),
            resolved: intention.resolved,
        }));
    });
    return state;
}

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
        enemies: state.enemies.map(enemy => saveEnemy(enemy, state)),
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

function saveEnemy(enemy: iEnemy, state: iGameState): SaveEnemy {
    return {
        id: enemy.id,
        defId: enemy.defId,
        currHp: enemy.currHp,
        intentions: enemy.intentions.map(intention => saveIntention(intention, state)),
        buffs: enemy.buffs.map(saveBuff),
        cooldowns: { ...enemy.cooldowns },
        data: { ...enemy.data }
    };
}

function saveIntention(intention: iIntention, state: iGameState): SaveIntention {
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
        // Removed targets are already ignored by combat and cannot be restored as live entities.
        rolls: intention.rolls.filter(x => x.target === null || isValidEntity(state, x.target)).map(x => ({
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