import { describe, expect, it } from "vitest";
import type {
    BindingDef,
    CharacterDef,
    EncounterDef,
    EnemyDef,
    PassiveDef,
    StatusDef,
    TrapDef,
} from "../../src/engine/protected/definitions";
import { makeBehavioralMove, makeEnemyWaitMove } from "../helpers/behavioralHelpers";
import { createTestEngine } from "../helpers/testCatalog";

describe("public content library", () => {
    it("serializes executable definitions into structured-cloneable metadata with isolated nested values", () => {
        const focus: StatusDef = {
            id: "blinded",
            levels: [{}, {
                modifiers: { hit: 2 },
                flags: ["blocksAssist"],
                allowedMoveTypes: ["arms"],
                blockedMoveTypes: ["mouth"],
            }],
        };
        const passive: PassiveDef = {
            id: "trained",
            status: { modifiers: { defense: 1 } },
            immunities: [focus],
        };
        const restraint: BindingDef = {
            id: "restraint",
            status: { light: [{ definition: focus, value: 1 }] },
        };
        const strike = makeBehavioralMove("strike", "arms", {
            baseHits: 2,
            baseDamage: 12,
            accuracy: { miss: 20, hit: 80 },
            modifiers: { potency: 1 },
            cooldown: { strike: 3 },
            bindings: [restraint],
        });
        const empowered = makeBehavioralMove("empowered", "arms");
        const hero: CharacterDef = {
            id: "hero",
            moves: [strike],
            empoweredMoves: [empowered],
            passives: [passive],
        };
        const wait = makeEnemyWaitMove();
        const foe: EnemyDef = {
            id: "foe",
            rank: "enemy",
            hp: 40,
            defense: 2,
            moves: [wait],
            passives: [passive],
            ai: (_state, actor) => [{
                type: "move",
                actor,
                move: { definition: wait },
                targets: [],
            }],
        };
        const trap: TrapDef = {
            id: "snare",
            onTrigger: () => [],
        };
        const encounter: EncounterDef = {
            id: "library-encounter",
            enemies: [foe.id],
            bindings: [restraint],
            traps: [{ definition: trap, amount: 25 }],
        };
        const engine = createTestEngine([encounter], [hero], 1, { enemies: [foe] });

        const library = engine.getLibrary();
        expect(library.characters.hero).toEqual({
            id: hero.id,
            moves: [strike.id],
            empoweredMoves: [empowered.id],
            passives: [passive.id],
        });
        expect(library.enemies.foe).toEqual({
            id: foe.id,
            rank: foe.rank,
            hp: foe.hp,
            defense: foe.defense,
            moves: [wait.id],
            passives: [passive.id],
        });
        expect(library.moves.strike).toMatchObject({
            id: strike.id,
            hits: 2,
            baseDamage: 12,
            accuracy: { miss: 20, hit: 80 },
            modifiers: { potency: 1 },
            cooldown: { strike: 3 },
            bindings: [restraint.id],
        });
        expect(library.passives.trained).toEqual({
            id: passive.id,
            status: { modifiers: { defense: 1 } },
            immunities: [focus.id],
        });
        expect(library.bindings.restraint.status?.light).toEqual([
            { id: focus.id, level: 1 },
        ]);
        expect(library.statuses.blinded.modifiers[1]).toEqual({
            modifiers: { hit: 2 },
            flags: ["blocksAssist"],
            allowedMoveTypes: ["arms"],
            blockedMoveTypes: ["mouth"],
        });
        expect(library.encounters[encounter.id]).toEqual({
            id: encounter.id,
            enemies: [foe.id],
            bindings: [restraint.id],
            traps: { [trap.id]: 25 },
        });
        expect(() => structuredClone(library)).not.toThrow();

        library.characters.hero.moves.push("client-only");
        library.enemies.foe.passives.length = 0;
        library.moves.strike.accuracy!.hit = 1;
        library.moves.strike.modifiers!.potency = 99;
        library.passives.trained.immunities!.push("stunned");
        library.bindings.restraint.status!.light![0].level = 4;
        library.statuses.blinded.modifiers[1].flags!.push("skipsTurn");
        library.encounters[encounter.id].traps[trap.id] = 0;

        const fresh = engine.getLibrary();
        expect(fresh.characters.hero.moves).toEqual([strike.id]);
        expect(fresh.enemies.foe.passives).toEqual([passive.id]);
        expect(fresh.moves.strike.accuracy).toEqual({ miss: 20, hit: 80 });
        expect(fresh.moves.strike.modifiers).toEqual({ potency: 1 });
        expect(fresh.passives.trained.immunities).toEqual([focus.id]);
        expect(fresh.bindings.restraint.status?.light).toEqual([{ id: focus.id, level: 1 }]);
        expect(fresh.statuses.blinded.modifiers[1].flags).toEqual(["blocksAssist"]);
        expect(fresh.encounters[encounter.id].traps).toEqual({ [trap.id]: 25 });
    });
});
