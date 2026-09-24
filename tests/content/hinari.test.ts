import { describe, expect, it } from "vitest";
import { hinari } from "../../src/content/characters/hinari";
import { EMPOWERMENT_BUFF } from "../../src/content/characters/ko";
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
        [0, 4, ["rockfall", "store", "brace"]],
        [25, 3, ["rockfall", "store", "brace", "release"]],
        [50, 2, ["rockfall", "store", "brace", "release"]],
        [75, 1, ["rockfall", "store", "brace", "release"]],
        [100, 0, ["release"]],
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
                    buff: { id: EMPOWERMENT_BUFF, active: true },
                },
            ],
        });

        expect(moveIds(engine)).toContain("fairyRockfall");
        expect(moveIds(engine)).toContain("rockfall");

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
            buff: EMPOWERMENT_BUFF,
        }]);
        expect(buffState(engine, EMPOWERMENT_BUFF, hinari.id)).toBeUndefined();
        expect(moveIds(engine)).toContain("rockfall");
        expect(moveIds(engine)).not.toContain("fairyRockfall");
    });

    it("does not consume Fairy Empowerment when Hinari uses a normal move", () => {
        const engine = loadHinariEncounter({
            setup: (state) => [{
                type: "buff",
                operation: "add",
                target: state.characters[0],
                buff: { id: EMPOWERMENT_BUFF, active: true },
            }],
        });

        const result = execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "brace",
            targets: [],
        });

        expect(result.events.some(({ type }) => type === "buffRemoved")).toBe(false);
        expect(buffState(engine, EMPOWERMENT_BUFF, hinari.id)).toBeDefined();
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
    it("previews the strongest binding separately for each target", () => {
        const ropeAlly = makeBehavioralCharacter("rope-ally");
        const tapeAlly = makeBehavioralCharacter("tape-ally");
        const engine = loadHinariEncounter({
            allies: [ropeAlly, tapeAlly],
            setup: (state) => [
                { type: "binding", source: state.characters[0], target: state.characters[1], binding: rope, amount: 30 },
                { type: "binding", source: state.characters[0], target: state.characters[1], binding: tape, amount: 20 },
                { type: "binding", source: state.characters[0], target: state.characters[2], binding: tape, amount: 10 },
            ],
        });
        const targets = action(engine, "store")?.targets;

        expect(targets?.find(({ target }) => target === ropeAlly.id)).toEqual({
            valid: true, target: ropeAlly.id, damage: undefined,
            effects: [{ type: "binding", target: ropeAlly.id, binding: rope.id, amount: -30 }],
        });
        expect(targets?.find(({ target }) => target === tapeAlly.id)).toEqual({
            valid: true, target: tapeAlly.id, damage: undefined,
            effects: [{ type: "binding", target: tapeAlly.id, binding: tape.id, amount: -10 }],
        });
    });

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

    it("uses twice normal severity-scaled potency at Impossible without Hinari's escape modifier", () => {
        const ally = makeBehavioralCharacter("ally");
        const engine = loadHinariEncounter({
            allies: [ally],
            setup: (state) => [
                { type: "binding", source: state.characters[0], target: state.characters[1], binding: tape, amount: 80 },
                {
                    type: "buff",
                    operation: "add",
                    target: state.characters[0],
                    buff: { id: "escapePenalty", active: true, modifiers: { escape: -5 } },
                },
            ],
        });

        storeFromAlly(engine);

        expect(bindingState(engine, tape.id, ally.id)?.value).toBe(70);
        expect(characterState(engine, hinari.id).data.subspace).toBe(25);
    });

    it("stores from the highest binding using scaled potency and remembers each latest type", () => {
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
            type: "bondageRemoved",
            target: ally.id,
            binding: rope.id,
            amount: -30,
        });
        expect(bindingState(engine, rope.id, ally.id)).toBeUndefined();
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
        expect(bindingState(engine, rope.id, ally.id)).toBeUndefined();
        expect(bindingState(engine, tape.id, ally.id)).toBeUndefined();
        expect(characterState(engine, hinari.id).data).toMatchObject({
            subspace: 50,
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

        expect(bindingState(engine, tape.id, ally.id)?.value).toBe(15);
        expect(bindingState(engine, tape.id, hinari.id)?.value).toBe(15);
        expect(characterState(engine, hinari.id).data).toMatchObject({
            subspace: 100,
            subspaceBinding: 1,
        });
    });

    it("does not offer Store at full Subspace", () => {
        const ally = makeBehavioralCharacter("ally");
        const engine = loadHinariEncounter({
            allies: [ally],
            setup: (state) => [
                ...hinariData(state, 100),
                {
                    type: "binding",
                    source: state.characters[0],
                    target: state.characters[1],
                    binding: tape,
                    amount: 25,
                },
            ],
        });

        expect(action(engine, "store")).toBeUndefined();
        expect(moveIds(engine)).not.toContain("store");

        expect(engine.executeAction({
            type: "move",
            actor: hinari.id,
            move: "store",
            targets: [ally.id],
        })).toEqual({
            success: false,
            reason: "invalidMove",
        });

        expect(bindingState(engine, tape.id, ally.id)?.value).toBe(25);
        expect(characterState(engine, hinari.id).data.subspace).toBe(100);
    });

    it("still offers Store while Subspace has room", () => {
        const ally = makeBehavioralCharacter("ally");
        const engine = loadHinariEncounter({
            allies: [ally],
            setup: (state) => [
                ...hinariData(state, 99),
                {
                    type: "binding",
                    source: state.characters[0],
                    target: state.characters[1],
                    binding: tape,
                    amount: 10,
                },
            ],
        });

        expect(action(engine, "store")).toBeDefined();

        execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "store",
            targets: [ally.id],
        });

        expect(bindingState(engine, tape.id, ally.id)?.value).toBe(9);
        expect(bindingState(engine, tape.id, hinari.id)?.value).toBe(24);
        expect(characterState(engine, hinari.id).data.subspace).toBe(100);
    });

    it("offers Store again after Subspace falls below full", () => {
        const engine = loadHinariEncounter({
            setup: (state) => hinariData(state, 100),
        });

        expect(action(engine, "store")).toBeUndefined();
        expect(action(engine, "release")).toBeDefined();

        execute(engine, {
            type: "move",
            actor: hinari.id,
            move: "release",
            targets: ["foe1"],
        });

        expect(characterState(engine, hinari.id).data.subspace).toBe(75);
        expect(action(engine, "store")).toBeDefined();
    });

    it("limits removal to Subspace room while applying the fixed overflow to Hinari", () => {
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
        expect(allyRemoved).toBe(10);
        expect(subspaceGained).toBe(10);
        expect(bodyBindingGained).toBe(6);
        expect(afterHinariBinding).toBe(thresholds.impossible + 1);
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
                expect.objectContaining({ valid: true, target: bound.id, effects: [{ type: "binding", target: bound.id, binding: rope.id, amount: -10 }] }),
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
    it("previews enemy clutter and state-scaled ally binding without an accuracy roll", () => {
        const build = (subspace: number) => loadHinariEncounter({
            allies: [makeBehavioralCharacter("ally")],
            setup: (state) => hinariData(state, subspace, 1),
        });
        const low = build(25);
        const high = build(60);
        const target = (engine: Engine, id: string) => action(engine, "release")?.targets.find((entry) => entry.target === id);

        expect(target(low, "ally")).toEqual({
            valid: true, target: "ally", damage: undefined,
            effects: [{ type: "binding", target: "ally", binding: tape.id, amount: 13 }],
        });
        expect(target(high, "ally")).toEqual({
            valid: true, target: "ally", damage: undefined,
            effects: [{ type: "binding", target: "ally", binding: tape.id, amount: 25 }],
        });
        expect(target(low, "foe1")).toEqual({
            valid: true, target: "foe1", damage: undefined,
            effects: [{ type: "buff", target: "foe1", buff: "subspaceClutter", effects: { defense: -1, hit: -1 }, operation: "add" }],
        });
        const result = execute(low, { type: "move", actor: hinari.id, move: "release", targets: ["foe1"] });
        expect(moveEvent(result).targets).toEqual([{ target: "foe1", result: "none" }]);
    });

    it("debuffs an enemy and spends 25 Subspace", () => {
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

        expect(result.events).toContainEqual({ type: "buffAdded", target: "foe1", buff: "subspaceClutter" });
        expect(buffState(engine, "subspaceClutter", "foe1")).toMatchObject({
            duration: 2,
            modifiers: { defense: -1, hit: -1 },
        });
        expect(engine.getGameView().enemies[0].currHp).toBe(2_000);
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

    it("spends the minimum available Subspace and scales friendly Release", () => {
        const lowSubspace = (withAlly: boolean) => loadHinariEncounter({
            allies: withAlly ? [makeBehavioralCharacter("ally")] : [],
            setup: (state) => hinariData(state, 25),
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
        expect(bindingState(allyRelease, rope.id, "ally")?.value).toBe(13);
        expect(action(enemyRelease, "release")).toBeUndefined();
        expect(action(allyRelease, "release")).toBeUndefined();
    });
});
