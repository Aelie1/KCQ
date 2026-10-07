import type { BindingDef, CharacterDef, EncounterDef, EnemyDef, MoveDef, PassiveDef, StatusDef, StatusLevelDef, TrapDef } from "../protected/definitions";
import type { ContentCatalog, iStatus } from "../protected/types";
import type { BindingReference, CharacterReference, ContentLibrary, EncounterReference, EnemyReference, MoveReference, PassiveReference, ModifierReference as StatusDataReference, StatusLevelReference, StatusReference, TrapReference } from "../public/library";

function mapToRecord<T extends { id: string }, R>(
    items: readonly T[],
    convert: (item: T) => R,
): Record<string, R> {
    return Object.fromEntries(
        items.map(item => [item.id, convert(item)]),
    );
}

export function serializeLibrary(catalog: ContentCatalog): ContentLibrary {
    return {
        characters: mapToRecord(catalog.characters, libraryCharacter),
        enemies: mapToRecord(catalog.enemies, libraryEnemy),
        moves: mapToRecord(catalog.moves, libraryMove),
        passives: mapToRecord(catalog.passives, libraryPassive),
        bindings: mapToRecord(catalog.bindings, libraryBinding),
        traps: mapToRecord(catalog.traps, libraryTrap),
        statuses: mapToRecord(catalog.statuses, libraryStatus),
        encounters: mapToRecord(catalog.encounters, libraryEncounter),
    };
}

function libraryCharacter(character: CharacterDef): CharacterReference {
    return {
        id: character.id,
        moves: character.moves.map(x => x.id),
        passives: character.passives.map(x => x.id),
        empoweredMoves: character.empoweredMoves.map(x => x.id),
    };
}

function libraryEnemy(enemy: EnemyDef): EnemyReference {
    return {
        id: enemy.id,
        rank: enemy.rank,
        hp: enemy.hp,
        defense: enemy.defense,
        moves: enemy.moves.map(x => x.id),
        passives: enemy.passives.map(x => x.id),
    };
}

export function libraryMove(move: MoveDef): MoveReference {
    return {
        id: move.id,
        targetSide: move.targetSide,
        targets: move.targets,
        hits: move.baseHits,
        type: move.type,
        accuracy: move.accuracy ? { ...move.accuracy } : undefined,
        check: move.check,
        alwaysAvailable: move.alwaysAvailable,
        baseDamage: move.baseDamage,
        cooldown: { ...move.cooldown },
        freeOnHit: move.freeOnHit,
        modifiers: move.modifiers ? { ...move.modifiers } : undefined,
        bindings: move.bindings ? move.bindings.map(x => x.id) : [],
    };
}

function libraryPassive(passive: PassiveDef): PassiveReference {
    return {
        id: passive.id,
        status: libraryStatusData(passive.status ?? {}),
        immunities: passive.immunities?.map(x => x.id) ?? []
    };
}

function libraryBinding(binding: BindingDef): BindingReference {
    return {
        id: binding.id,
        status: Object.fromEntries(Object.entries(binding.status ?? {}).map(([level, statuses]) => [level, statuses.map(libraryStatusLevel)])),
    };
}

function libraryStatusLevel(status: iStatus): StatusLevelReference {
    return {
        id: status.definition.id,
        level: status.value
    };
}

function libraryStatus(status: StatusDef): StatusReference {
    return {
        id: status.id,
        modifiers: status.levels.map(libraryStatusData)
    };
}

function libraryStatusData(status: StatusLevelDef): StatusDataReference {
    return {
        modifiers: status.modifiers ? { ...status.modifiers } : undefined,
        flags: status.flags ? [...status.flags] : undefined,
        allowedMoveTypes: status.allowedMoveTypes ? [...status.allowedMoveTypes] : undefined,
        blockedMoveTypes: status.blockedMoveTypes ? [...status.blockedMoveTypes] : undefined,
    };
}

function libraryTrap(trap: TrapDef): TrapReference {
    return {
        id: trap.id,
    }
}

function libraryEncounter(encounter: EncounterDef): EncounterReference {
    return {
        id: encounter.id,
        stars: encounter.stars,
        enemies: encounter.enemies.map(x => ({ ...x })),
        bindings: encounter.bindings.map(x => x.id),
        traps: encounter.traps.map(x => x.definition.id),
        setup: encounter.librarySetup ? encounter.librarySetup() : []
    }
}
