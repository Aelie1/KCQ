import { describe, expect, it } from "vitest";
import { hinari } from "../../src/content/characters/hinari";
import { latexLegs } from "../../src/content/skunk/latex";
import { trapPuddle } from "../../src/content/skunk/puddles";
import type { BindingDef, EncounterDef, EnemyDef, MoveDef } from "../../src/engine/protected/definitions";
import { createCustomEngine } from "../../src/engine/protected/engine";
import { isCharacter, thresholds } from "../../src/engine/protected/helpers";
import { s } from "../../src/engine/protected/status";
import { immobilized } from "../../src/engine/protected/statuses";
import type { iEffect, iGameState } from "../../src/engine/protected/types";
import type { ActionInfo, ActionSuccess, DamageEvent, Engine } from "../../src/engine/public/types";
import {
    bindingState,
    buffState,
    characterState,
    execute,
    makeBehavioralBinding,
    makeBehavioralCharacter,
    makeBehavioralEnemy,
    makeBehavioralMove,
} from "../helpers/behavioralHelpers";
import { actionView } from "../helpers/gameView";

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
    traps?: EncounterDef["traps"];
} = {}): Engine {
    const encounter: EncounterDef = {
        id: "hinari-test",
        enemies: options.enemies ?? [durableEnemy()],
        bindings: options.bindings ?? [rope, tape],
        traps: options.traps ?? [],
        setup: options.setup,
    };
    const allies = options.allies ?? [];
    const engine = createCustomEngine([encounter], [hinari, ...allies], options.seed ?? 1);
    engine.loadCharacter(hinari.id);
    for (const ally of allies) engine.loadCharacter(ally.id);
    engine.loadEncounter(encounter.id);
    return engine;
}

function hinariData(state: iGameState, subspace: number, binding = 0): iEffect[] {
    const target = state.characters[0];
    return [
        { type: "data", target, name: "subspace", amount: subspace },
        { type: "data", target, name: "subspaceBinding", amount: binding },
    ];
}

function action(engine: Engine, id: string): ActionInfo | undefined {
    return actionView(engine, hinari.id).moves.find(({ move }) => move.id === id);
}

function moveIds(engine: Engine): string[] {
    return actionView(engine, hinari.id).moves.map(({ move }) => move.id);
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
            setup: (state) => hinariData(state, subspace),
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
        expect(engine.getGameView().enemies[0].currHp).toBe(
            2_000 - damage.reduce((total, { amount }) => total + amount, 0),
        );
    });

    it.each([
        [0, 6],
        [17, 5],
        [34, 4],
        [50, 3],
        [67, 2],
        [84, 1],
    ] as const)("offers %i Subspace as %i Fairy Rockfall hits, then restores Rockfall", (
        subspace,
        hits,
    ) => {
        const engine = loadHinariEncounter({
            seed: 2,
            setup: (state) => [
                ...hinariData(state, subspace),
                {
                    type: "buff",
                    operation: "add",
                    target: state.characters[0],
                    buff: { id: "fairyEmpowerment", active: true },
                },
            ],
        });

        expect(moveIds(engine)).toContain("fairyRockfall");
        expect(moveIds(engine)).not.toContain("rockfall");

        const result = execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "fairyRockfall",
            targets: ["foe1"],
        });

        expect(moveEvent(result).targets).toHaveLength(hits);
        expect(result.events.filter(({ type }) => type === "buffRemoved")).toEqual([{
            type: "buffRemoved",
            target: hinari.id,
            buff: "fairyEmpowerment",
        }]);
        expect(buffState(engine, "fairyEmpowerment", hinari.id)).toBeUndefined();
        expect(moveIds(engine)).toContain("rockfall");
        expect(moveIds(engine)).not.toContain("fairyRockfall");
    });

    it("does not consume Fairy Empowerment when Hinari uses a normal move", () => {
        const engine = loadHinariEncounter({
            setup: (state) => [{
                type: "buff",
                operation: "add",
                target: state.characters[0],
                buff: { id: "fairyEmpowerment", active: true },
            }],
        });

        const result = execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "brace",
            targets: [],
        });

        expect(result.events.some(({ type }) => type === "buffRemoved")).toBe(false);
        expect(buffState(engine, "fairyEmpowerment", hinari.id)).toBeDefined();
        expect(moveIds(engine)).toContain("fairyRockfall");
    });
});

describe("Hinari's Spatial Movement", () => {
    it("removes the consequences of Hobbled while leaving the binding intact", () => {
        const ordinary = makeBehavioralCharacter("ordinary");
        const engine = loadHinariEncounter({
            allies: [ordinary],
            bindings: [latexLegs],
            setup: (state) => [
                {
                    type: "binding",
                    source: state.characters[0],
                    target: state.characters[0],
                    binding: latexLegs,
                    amount: thresholds.extreme,
                },
                {
                    type: "binding",
                    source: state.characters[0],
                    target: state.characters[1],
                    binding: latexLegs,
                    amount: thresholds.extreme,
                },
            ],
        });

        const hinariState = characterState(engine, hinari.id);
        const ordinaryState = characterState(engine, ordinary.id);
        expect(bindingState(engine, latexLegs.id, hinari.id)?.value).toBe(thresholds.extreme);
        expect(hinariState.modifiers).toEqual({});
        expect(hinariState.blockedMoveTypes).toEqual([]);
        expect(ordinaryState.modifiers).toEqual({ defense: -3, traps: -3, hitlegs: -6 });
        expect(ordinaryState.blockedMoveTypes).toEqual(["legs"]);
    });

    it("still prevents movement while Immobilized", () => {
        const engine = loadHinariEncounter({
            setup: (state) => [{
                type: "stance",
                actor: state.characters[0],
                stance: "standing",
            }, {
                type: "buff",
                operation: "add",
                target: state.characters[0],
                buff: {
                    id: "immobilized",
                    active: true,
                    statuses: [s(immobilized, 1)],
                },
            }],
        });

        expect(characterState(engine, hinari.id)).toMatchObject({
            standing: true,
            buffs: [expect.objectContaining({
                id: "immobilized",
                statuses: [{ id: immobilized.id, value: 1 }],
            })],
        });
        expect(actionView(engine, hinari.id).stance)
            .toEqual({ available: false, reason: "actorImmobilized" });
        expect(engine.executeAction({ type: "stance", actor: hinari.id }))
            .toEqual({ success: false, reason: "actorImmobilized" });
    });

    it("skips a guaranteed movement trap while resolving Rockfall", () => {
        const engine = loadHinariEncounter({
            seed: 2,
            traps: [{ definition: trapPuddle, amount: 100 }],
        });
        expect(characterState(engine, hinari.id).standing).toBe(false);

        const result = execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "rockfall",
            targets: ["foe1"],
        });

        expect(result.events.some(({ type }) => type === "trapTriggered")).toBe(false);
        expect(result.events).toContainEqual(expect.objectContaining({
            type: "moveUsed",
            actor: hinari.id,
            move: "rockfall",
        }));
        expect(result.events).toContainEqual(expect.objectContaining({
            type: "enemyDamaged",
            target: "foe1",
        }));
        expect(result.view.characters[0].bindings).toEqual([]);
        expect(result.view.traps).toEqual([{ id: trapPuddle.id, amount: 100 }]);
    });

    it("skips a guaranteed movement trap while Escaping", () => {
        const engine = loadHinariEncounter({
            bindings: [rope],
            traps: [{ definition: trapPuddle, amount: 100 }],
            setup: (state) => [{
                type: "binding",
                source: state.characters[0],
                target: state.characters[0],
                binding: rope,
                amount: 30,
            }],
        });

        const result = execute(engine, {
            type: "escape",
            actor: hinari.id,
            target: hinari.id,
            binding: rope.id,
        });

        expect(result.events.some(({ type }) => type === "trapTriggered")).toBe(false);
        expect(result.events).toContainEqual(expect.objectContaining({
            type: "bondageChanged",
            target: hinari.id,
            binding: rope.id,
        }));
        expect(bindingState(engine, rope.id, hinari.id)?.value).toBeLessThan(30);
        expect(result.view.characters[0].bindings.map(({ id }) => id)).toEqual([rope.id]);
        expect(result.view.traps).toEqual([{ id: trapPuddle.id, amount: 100 }]);
    });
});

describe("Hinari's Store", () => {
    function constrainedStoreEngine(subspace: number, hinariBinding: number, allyBinding = 25) {
        const ally = makeBehavioralCharacter("ally");
        return loadHinariEncounter({
            allies: [ally],
            bindings: [tape],
            setup: (state) => [
                ...hinariData(state, subspace, 0),
                {
                    type: "binding",
                    source: state.characters[0],
                    target: state.characters[0],
                    binding: tape,
                    amount: hinariBinding,
                },
                {
                    type: "binding",
                    source: state.characters[0],
                    target: state.characters[1],
                    binding: tape,
                    amount: allyBinding,
                },
            ],
        });
    }

    function storeFromAlly(engine: Engine) {
        return execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "store",
            targets: ["ally"],
        });
    }

    it("automatically stores up to 25 from the highest binding and remembers each latest type", () => {
        const ally = makeBehavioralCharacter("ally");
        const engine = loadHinariEncounter({
            allies: [ally],
            setup: (state) => [
                { type: "binding", source: state.characters[0], target: state.characters[1], binding: rope, amount: 30 },
                { type: "binding", source: state.characters[0], target: state.characters[1], binding: tape, amount: 20 },
            ],
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
            setup: (state) => [
                ...hinariData(state, 90),
                { type: "binding", source: state.characters[0], target: state.characters[1], binding: tape, amount: 25 },
            ],
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
            setup: (state) => [
                ...hinariData(state, 100),
                { type: "binding", source: state.characters[0], target: state.characters[1], binding: tape, amount: 10 },
            ],
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

    it("removes only the body room available when Subspace is full", () => {
        const initialHinariBinding = thresholds.impossible - 5;
        const engine = constrainedStoreEngine(100, initialHinariBinding);
        const beforeAlly = bindingState(engine, tape.id, "ally")!.value;
        const beforeSubspace = characterState(engine, hinari.id).data.subspace;

        storeFromAlly(engine);

        const afterAlly = bindingState(engine, tape.id, "ally")!.value;
        const afterHinariBinding = bindingState(engine, tape.id, hinari.id)!.value;
        const afterSubspace = characterState(engine, hinari.id).data.subspace;
        const allyRemoved = beforeAlly - afterAlly;
        const subspaceGained = afterSubspace - beforeSubspace;
        const bodyBindingGained = afterHinariBinding - initialHinariBinding;
        expect(allyRemoved).toBe(5);
        expect(afterHinariBinding).toBe(thresholds.impossible);
        expect(afterSubspace).toBe(100);
        expect(allyRemoved).toBe(subspaceGained + bodyBindingGained);
    });

    it("does not remove ally bondage when full Subspace and the body track have no room", () => {
        const engine = constrainedStoreEngine(100, thresholds.impossible);

        const result = storeFromAlly(engine);

        expect(result.events).toContainEqual(expect.objectContaining({
            type: "moveUsed",
            actor: hinari.id,
            move: "store",
        }));
        expect(bindingState(engine, tape.id, "ally")?.value).toBe(25);
        expect(bindingState(engine, tape.id, hinari.id)?.value).toBe(thresholds.impossible);
        expect(characterState(engine, hinari.id).data.subspace).toBe(100);
    });

    it("conserves bondage across partial Subspace and body-track capacity", () => {
        const initialHinariBinding = thresholds.impossible - 5;
        const engine = constrainedStoreEngine(90, initialHinariBinding);
        const beforeAlly = bindingState(engine, tape.id, "ally")!.value;

        storeFromAlly(engine);

        const afterAlly = bindingState(engine, tape.id, "ally")!.value;
        const afterHinariBinding = bindingState(engine, tape.id, hinari.id)!.value;
        const afterSubspace = characterState(engine, hinari.id).data.subspace;
        const allyRemoved = beforeAlly - afterAlly;
        const subspaceGained = afterSubspace - 90;
        const bodyBindingGained = afterHinariBinding - initialHinariBinding;
        expect(allyRemoved).toBe(15);
        expect(subspaceGained).toBe(10);
        expect(bodyBindingGained).toBe(5);
        expect(afterHinariBinding).toBe(thresholds.impossible);
        expect(allyRemoved).toBe(subspaceGained + bodyBindingGained);
    });

    it("refuses characters with no bindings while keeping bound characters valid", () => {
        const empty = makeBehavioralCharacter("empty");
        const bound = makeBehavioralCharacter("bound");
        const engine = loadHinariEncounter({
            allies: [empty, bound],
            setup: (state) => [{
                type: "binding",
                source: state.characters[0],
                target: state.characters[2],
                binding: rope,
                amount: 10,
            }],
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
            setup: (state) => hinariData(state, 90),
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
            setup: (state) => hinariData(state, 10),
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
            setup: (state) => hinariData(state, 60, 1),
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
        expect(engine.getGameView().enemies[0].currHp).toBeLessThan(2_000);
        expect(characterState(engine, hinari.id).data.subspace).toBe(35);
    });

    it("applies up to 25 of the remembered binding to an ally and spends 50 Subspace", () => {
        const ally = makeBehavioralCharacter("ally");
        const engine = loadHinariEncounter({
            allies: [ally],
            setup: (state) => hinariData(state, 60, 1),
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
            setup: (state) => hinariData(state, 10),
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
