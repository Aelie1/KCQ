import type {
    BindingDef,
    CharacterDef,
    EncounterDef,
    EnemyDef,
    MoveDef,
    PassiveDef,
    StatusDef,
    TrapDef,
} from "../../src/engine/protected/definitions";
import { createGameEngine } from "../../src/engine/public/engine";
import type { ContentCatalog } from "../../src/engine/protected/types";

export interface TestCatalogContent {
    characters?: CharacterDef[];
    enemies?: EnemyDef[];
    moves?: MoveDef[];
    passives?: PassiveDef[];
    bindings?: BindingDef[];
    traps?: TrapDef[];
    statuses?: StatusDef[];
    encounters?: EncounterDef[];
}

function values<T>(record: Partial<Record<string, T[]>> | undefined): T[] {
    return record ? Object.values(record).flatMap(items => items ?? []) : [];
}

/**
 * Builds the smallest useful catalog for a test. Definitions referenced by the
 * supplied characters, enemies, moves, passives, bindings, and encounters are
 * included automatically, so callers only need to list their top-level content.
 */
export function createTestCatalog(content: TestCatalogContent = {}): ContentCatalog {
    const characters = content.characters ?? [];
    const enemies = content.enemies ?? [];
    const encounters = content.encounters ?? [];

    const moves = [
        ...(content.moves ?? []),
        ...characters.flatMap(character => [...character.moves, ...character.empoweredMoves]),
        ...enemies.flatMap(enemy => enemy.moves),
    ];
    const passives = [
        ...(content.passives ?? []),
        ...characters.flatMap(character => character.passives),
        ...enemies.flatMap(enemy => enemy.passives),
    ];
    const bindings = [
        ...(content.bindings ?? []),
        ...moves.flatMap(move => move.bindings ?? []),
        ...encounters.flatMap(encounter => encounter.bindings),
    ];
    const traps = [
        ...(content.traps ?? []),
        ...encounters.flatMap(encounter => encounter.traps.map(trap => trap.definition)),
    ];
    const statuses = [
        ...(content.statuses ?? []),
        ...passives.flatMap(passive => passive.immunities ?? []),
        ...bindings.flatMap(binding => values(binding.status)),
    ].map(status => "definition" in status ? status.definition : status);

    const unique = <T extends { id: string }>(items: T[]) =>
        [...new Map(items.map(item => [item.id, item])).values()];

    return {
        characters: unique(characters),
        enemies: unique(enemies),
        moves: unique(moves),
        passives: unique(passives),
        bindings: unique(bindings),
        traps: unique(traps),
        statuses: unique(statuses),
        encounters: unique(encounters),
    };
}

/** Compatibility-shaped test helper for the former encounter/character API. */
export function createTestEngine(
    encounters: EncounterDef[] = [],
    characters: CharacterDef[] = [],
    seed?: number,
    content: Omit<TestCatalogContent, "encounters" | "characters"> = {},
) {
    return createGameEngine(createTestCatalog({ ...content, encounters, characters }), seed);
}
