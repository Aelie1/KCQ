import { describe, expect, it } from "vitest";
import { hinari } from "../src/content/characters/hinari";
import type { BindingDef, EncounterDef, EnemyDef, MoveDef } from "../src/engine/protected/definitions";
import { isCharacter } from "../src/engine/protected/helpers";
import { GameEngine } from "../src/engine/public/engine";
import type { ActionInfo, ActionSuccess, DamageEvent } from "../src/engine/public/types";
import {
    bindingState,
    buffState,
    characterState,
    execute,
    makeBehavioralBinding,
    makeBehavioralCharacter,
    makeBehavioralEnemy,
    makeBehavioralMove,
} from "./behavioralHelpers";

const rope = makeBehavioralBinding("rope");
const tape = makeBehavioralBinding("tape");

function durableEnemy(id = "foe", moves?: MoveDef[]): EnemyDef {
    const enemy = makeBehavioralEnemy(id, moves);
    enemy.hp = 2_000;
    return enemy;
}

function bindingMove(binding: BindingDef, amount: number, selfSourced = false): MoveDef {
    return makeBehavioralMove(`apply-${binding.id}`, "none", {
        targetSide: "player",
        targets: 1,
        accuracy: undefined,
        resolve: (_state, actor, _move, targets) => targets.flatMap(({ target }) =>
            isCharacter(target) ? [{
                type: "binding" as const,
                source: selfSourced ? target : actor,
                target,
                binding,
                amount,
            }] : []),
    });
}

function enemyTargetingHinari(binding: BindingDef, amount: number): EnemyDef {
    const move = bindingMove(binding, amount);
    const enemy = durableEnemy("binder", [move]);
    enemy.ai = (state, actor) => [{
        type: "move",
        actor,
        move: { definition: move },
        targets: [state.characters[0]],
    }];
    return enemy;
}

function loadHinariEncounter(options: {
    bindings?: BindingDef[];
    enemies?: EnemyDef[];
    allies?: ReturnType<typeof makeBehavioralCharacter>[];
    setup?: EncounterDef["setup"];
    seed?: number;
} = {}): GameEngine {
    const encounter: EncounterDef = {
        id: "hinari-test",
        enemies: options.enemies ?? [durableEnemy()],
        bindings: options.bindings ?? [rope, tape],
        traps: [],
        setup: options.setup,
    };
    const engine = new GameEngine([encounter], options.seed ?? 1);
    engine.loadCharacter(hinari);
    for (const ally of options.allies ?? []) engine.loadCharacter(ally);
    engine.loadEncounter(encounter.id);
    return engine;
}

function action(engine: GameEngine, id: string): ActionInfo | undefined {
    return engine.getMoves(hinari.id).find(({ move }) => move.id === id);
}

function moveIds(engine: GameEngine): string[] {
    return engine.getMoves(hinari.id).map(({ move }) => move.id);
}

function moveEvent(result: ActionSuccess) {
    const event = result.events.find(({ type }) => type === "moveUsed");
    if (!event || event.type !== "moveUsed") throw new Error("Expected moveUsed event");
    return event;
}

describe("Hinari's dynamic move set and Rockfall", () => {
    it.each([
        [0, 4, ["store", "brace", "rockfall"]],
        [25, 3, ["store", "brace", "rockfall", "release"]],
        [50, 2, ["store", "brace", "rockfall", "release"]],
        [75, 1, ["store", "brace", "rockfall", "release"]],
        [100, 0, ["store", "release"]],
    ] as const)("offers %i Rockfall hits at %i Subspace", (subspace, hits, expectedMoves) => {
        const engine = loadHinariEncounter({
            seed: 2,
            setup: (state) => {
                state.characters[0].data.subspace = subspace;
                if (subspace > 0) state.characters[0].data.subspaceBinding = 0;
            },
        });

        expect(moveIds(engine)).toEqual(expectedMoves);
        expect(characterState(engine, hinari.id).data.subspace).toBe(subspace);

        if (hits > 0) {
            const result = execute(engine, {
                type: "move",
                actor: hinari.id,
                move: "rockfall",
                targets: ["foe1"],
            });
            expect(moveEvent(result).targets).toHaveLength(hits);
        } else {
            expect(action(engine, "rockfall")).toBeUndefined();
            expect(action(engine, "brace")).toBeUndefined();
        }
    });

    it("rolls and resolves Rockfall's four hits independently against one enemy", () => {
        const engine = loadHinariEncounter({ seed: 2 });
        const result = execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "rockfall",
            targets: ["foe1"],
        });
        const rolls = moveEvent(result).targets;
        const damage = result.events.filter(
            (event): event is DamageEvent => event.type === "enemyDamaged",
        );

        expect(rolls).toHaveLength(4);
        expect(new Set(rolls.map(({ result: band }) => band)).size).toBeGreaterThan(1);
        expect(damage).toHaveLength(rolls.filter(({ result: band }) => band !== "miss").length);
        expect(damage.length).toBeGreaterThan(1);
        expect(new Set(damage.map(({ amount }) => amount)).size).toBeGreaterThan(1);
        expect(engine.getGameState().enemies[0].currHp).toBe(
            2_000 - damage.reduce((total, { amount }) => total + amount, 0),
        );
    });
});

describe("Hinari's Store", () => {
    it("automatically stores up to 25 from the highest binding and remembers each latest type", () => {
        const ally = makeBehavioralCharacter("ally");
        const engine = loadHinariEncounter({
            allies: [ally],
            setup: (state) => state.characters[1].bindings.push(
                { id: rope.id, definition: rope, value: 30, data: {} },
                { id: tape.id, definition: tape, value: 20, data: {} },
            ),
        });

        const first = execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "store",
            targets: [ally.id],
        });
        expect(first.events).toContainEqual({
            type: "bondageChanged",
            target: ally.id,
            binding: rope.id,
            amount: -25,
        });
        expect(bindingState(engine, rope.id, ally.id)?.value).toBe(5);
        expect(bindingState(engine, tape.id, ally.id)?.value).toBe(20);
        expect(characterState(engine, hinari.id).data).toMatchObject({
            subspace: 25,
            subspaceBinding: 0,
        });

        execute(engine, { type: "endTurn" });
        execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "store",
            targets: [ally.id],
        });
        expect(bindingState(engine, rope.id, ally.id)?.value).toBe(5);
        expect(bindingState(engine, tape.id, ally.id)).toBeUndefined();
        expect(characterState(engine, hinari.id).data).toMatchObject({
            subspace: 45,
            subspaceBinding: 1,
        });
    });

    it("fills its remaining capacity and puts Store overflow on Hinari", () => {
        const ally = makeBehavioralCharacter("ally");
        const engine = loadHinariEncounter({
            allies: [ally],
            setup: (state) => {
                state.characters[0].data.subspace = 90;
                state.characters[0].data.subspaceBinding = 0;
                state.characters[1].bindings.push({
                    id: tape.id,
                    definition: tape,
                    value: 25,
                    data: {},
                });
            },
        });

        execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "store",
            targets: [ally.id],
        });

        expect(bindingState(engine, tape.id, ally.id)).toBeUndefined();
        expect(bindingState(engine, tape.id, hinari.id)?.value).toBe(15);
        expect(characterState(engine, hinari.id).data).toMatchObject({
            subspace: 100,
            subspaceBinding: 1,
        });
    });

    it("still relieves an ally at full capacity without replacing the remembered type", () => {
        const ally = makeBehavioralCharacter("ally");
        const engine = loadHinariEncounter({
            allies: [ally],
            setup: (state) => {
                state.characters[0].data.subspace = 100;
                state.characters[0].data.subspaceBinding = 0;
                state.characters[1].bindings.push({
                    id: tape.id,
                    definition: tape,
                    value: 10,
                    data: {},
                });
            },
        });

        execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "store",
            targets: [ally.id],
        });

        expect(bindingState(engine, tape.id, ally.id)).toBeUndefined();
        expect(bindingState(engine, tape.id, hinari.id)?.value).toBe(10);
        expect(characterState(engine, hinari.id).data).toMatchObject({
            subspace: 100,
            subspaceBinding: 0,
        });
    });

    it("refuses characters with no bindings while keeping bound characters valid", () => {
        const empty = makeBehavioralCharacter("empty");
        const bound = makeBehavioralCharacter("bound");
        const engine = loadHinariEncounter({
            allies: [empty, bound],
            setup: (state) => state.characters[2].bindings.push({
                id: rope.id,
                definition: rope,
                value: 10,
                data: {},
            }),
        });

        expect(action(engine, "store")).toMatchObject({
            available: true,
            targets: expect.arrayContaining([
                { valid: false, target: hinari.id, reason: "invalidTarget" },
                { valid: false, target: empty.id, reason: "invalidTarget" },
                { valid: true, target: bound.id, accuracy: null },
            ]),
        });
        expect(engine.executeAction({
            type: "move",
            actor: hinari.id,
            move: "store",
            targets: [empty.id],
        })).toEqual({ success: false, reason: "invalidTarget" });
    });
});

describe("Hinari's Brace", () => {
    it("adds a one-reaction Brace buff", () => {
        const engine = loadHinariEncounter();

        const result = execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "brace",
            targets: [],
        });

        expect(result.events).toContainEqual({
            type: "buffAdded",
            target: hinari.id,
            buff: "brace",
        });
        expect(buffState(engine, "brace", hinari.id)).toMatchObject({ duration: 1 });
    });

    it("absorbs enemy binding into free Subspace and remembers its type", () => {
        const engine = loadHinariEncounter({
            enemies: [enemyTargetingHinari(tape, 20)],
        });
        execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "brace",
            targets: [],
        });

        const result = execute(engine, { type: "endTurn" });

        expect(result.events).toContainEqual({
            type: "bondageBlocked",
            target: hinari.id,
            binding: tape.id,
            amount: 20,
        });
        expect(bindingState(engine, tape.id, hinari.id)).toBeUndefined();
        expect(characterState(engine, hinari.id).data).toMatchObject({
            subspace: 20,
            subspaceBinding: 1,
        });
        expect(buffState(engine, "brace", hinari.id)).toBeUndefined();
    });

    it("stores only free capacity and lets excess enemy binding overflow onto Hinari", () => {
        const engine = loadHinariEncounter({
            enemies: [enemyTargetingHinari(tape, 25)],
            setup: (state) => {
                state.characters[0].data.subspace = 90;
                state.characters[0].data.subspaceBinding = 0;
            },
        });
        execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "brace",
            targets: [],
        });

        const result = execute(engine, { type: "endTurn" });

        expect(result.events).toContainEqual({
            type: "bondageBlocked",
            target: hinari.id,
            binding: tape.id,
            amount: 10,
        });
        expect(bindingState(engine, tape.id, hinari.id)?.value).toBe(15);
        expect(characterState(engine, hinari.id).data).toMatchObject({
            subspace: 100,
            subspaceBinding: 1,
        });
    });

    it("does not absorb self-sourced binding or replace the remembered type", () => {
        const bindHinari = bindingMove(tape, 12, true);
        const ally = makeBehavioralCharacter("ally", [bindHinari]);
        const engine = loadHinariEncounter({
            allies: [ally],
            setup: (state) => {
                state.characters[0].data.subspace = 10;
                state.characters[0].data.subspaceBinding = 0;
            },
        });
        execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "brace",
            targets: [],
        });

        execute(engine, {
            type: "move",
            actor: ally.id,
            move: bindHinari.id,
            targets: [hinari.id],
        });

        expect(bindingState(engine, tape.id, hinari.id)?.value).toBe(12);
        expect(characterState(engine, hinari.id).data).toMatchObject({
            subspace: 10,
            subspaceBinding: 0,
        });
        expect(buffState(engine, "brace", hinari.id)).toMatchObject({ duration: 1 });
    });
});

describe("Hinari's Release", () => {
    it("damages an enemy and spends 25 Subspace", () => {
        const engine = loadHinariEncounter({
            seed: 2,
            setup: (state) => {
                state.characters[0].data.subspace = 60;
                state.characters[0].data.subspaceBinding = 1;
            },
        });

        const result = execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "release",
            targets: ["foe1"],
        });

        expect(result.events).toContainEqual(expect.objectContaining({
            type: "enemyDamaged",
            target: "foe1",
        }));
        expect(engine.getGameState().enemies[0].currHp).toBeLessThan(2_000);
        expect(characterState(engine, hinari.id).data.subspace).toBe(35);
    });

    it("applies up to 25 of the remembered binding to an ally and spends 50 Subspace", () => {
        const ally = makeBehavioralCharacter("ally");
        const engine = loadHinariEncounter({
            allies: [ally],
            setup: (state) => {
                state.characters[0].data.subspace = 60;
                state.characters[0].data.subspaceBinding = 1;
            },
        });

        execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "release",
            targets: [ally.id],
        });

        expect(bindingState(engine, tape.id, ally.id)?.value).toBe(25);
        expect(bindingState(engine, rope.id, ally.id)).toBeUndefined();
        expect(characterState(engine, hinari.id).data.subspace).toBe(10);
    });

    it("clamps low Subspace at zero for both enemy and ally releases", () => {
        const lowSubspace = (withAlly: boolean) => loadHinariEncounter({
            allies: withAlly ? [makeBehavioralCharacter("ally")] : [],
            setup: (state) => {
                state.characters[0].data.subspace = 10;
                state.characters[0].data.subspaceBinding = 0;
            },
        });
        const enemyRelease = lowSubspace(false);
        const allyRelease = lowSubspace(true);

        execute(enemyRelease, {
            type: "move",
            actor: hinari.id,
            move: "release",
            targets: ["foe1"],
        });
        execute(allyRelease, {
            type: "move",
            actor: hinari.id,
            move: "release",
            targets: ["ally"],
        });

        expect(characterState(enemyRelease, hinari.id).data.subspace).toBe(0);
        expect(characterState(allyRelease, hinari.id).data.subspace).toBe(0);
        expect(bindingState(allyRelease, rope.id, "ally")?.value).toBe(10);
        expect(action(enemyRelease, "release")).toBeUndefined();
        expect(action(allyRelease, "release")).toBeUndefined();
    });
});
