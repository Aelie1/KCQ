import { describe, expect, it } from "vitest";
import { trapPuddle } from "../src/content/skunk/puddles";
import type { BindingDef, EncounterDef, StatusDef, TrapDef } from "../src/engine/protected/definitions";
import { GameEngine } from "../src/engine/public/engine";
import type { PlayerAction } from "../src/engine/public/types";
import {
    makeBindingDef,
    makeCharacterDef,
    makeMove,
} from "./helpers";

function trapThatConsumes(
    id: string,
    consumed: number,
    binding?: BindingDef,
): TrapDef {
    return {
        id,
        onTrigger: (target, trap) => [
            ...(binding ? [{
                type: "binding" as const,
                target,
                binding,
                amount: 10,
            }] : []),
            {
                type: "trap" as const,
                actor: target,
                trap,
                amount: -Math.min(consumed, trap.amount),
            },
        ],
    };
}

function makeTrapEngine(
    traps: EncounterDef["traps"],
    moves = [makeMove("act", "none", { targetSide: "none", targets: 0, accuracy: undefined })],
    seed = 1,
    setup?: EncounterDef["setup"],
    characterIds = ["hero"],
): GameEngine {
    const encounter: EncounterDef = {
        id: "trap-test",
        enemies: [],
        bindings: [],
        traps,
        setup,
    };
    const engine = new GameEngine([encounter], seed);
    for (const id of characterIds) engine.loadCharacter(makeCharacterDef(id, moves));
    engine.loadEncounter(encounter.id);
    return engine;
}

function attack(actor = "hero", move = "act"): PlayerAction {
    return { type: "attack", actor, move, targets: [] };
}

describe("generic traps through GameEngine", () => {
    it("loads authored traps and exposes only their public ids and amounts", () => {
        const first = trapThatConsumes("firstTrap", 1);
        const second = trapThatConsumes("secondTrap", 1);
        const engine = makeTrapEngine([
            { definition: first, amount: 12 },
            { definition: second, amount: 34 },
        ]);

        expect(engine.getGameState().traps).toEqual([
            { id: first.id, amount: 12 },
            { id: second.id, amount: 34 },
        ]);
        expect(engine.getEncounter()).toEqual({
            id: "trap-test",
            enemies: [],
            bindings: [],
            traps: [first.id, second.id],
        });
        expect(engine.getGameState().traps[0]).not.toHaveProperty("definition");
    });

    it("normalizes generated amounts, caps additions, and clamps removals at zero", () => {
        const trap = trapThatConsumes("meter", 0);
        const add = makeMove("add", "none", {
            targetSide: "none",
            targets: 0,
            accuracy: undefined,
            freeOnHit: true,
            resolve: (state, actor) => [{ type: "trap", actor, trap: state.traps[0], amount: 1.2 }],
        });
        const fill = makeMove("fill", "none", {
            targetSide: "none",
            targets: 0,
            accuracy: undefined,
            freeOnHit: true,
            resolve: (state, actor) => [{ type: "trap", actor, trap: state.traps[0], amount: 200 }],
        });
        const remove = makeMove("remove", "none", {
            targetSide: "none",
            targets: 0,
            accuracy: undefined,
            freeOnHit: true,
            resolve: (state, actor) => [{ type: "trap", actor, trap: state.traps[0], amount: -200.8 }],
        });
        const engine = makeTrapEngine([{ definition: trap, amount: 0 }], [add, fill, remove]);
        engine.executeAction({ type: "stance", actor: "hero" });

        const added = engine.executeAction(attack("hero", add.id));
        expect(added).toMatchObject({
            success: true,
            state: { traps: [{ id: trap.id, amount: 2 }] },
        });
        if (!added.success) throw new Error("Expected add action to succeed");
        expect(added.events).toContainEqual({
            type: "trapAdded", actor: "hero", trap: trap.id, amount: 2,
        });

        const filled = engine.executeAction(attack("hero", fill.id));
        expect(filled).toMatchObject({
            success: true,
            state: { traps: [{ id: trap.id, amount: 100 }] },
        });
        if (!filled.success) throw new Error("Expected fill action to succeed");
        expect(filled.events).toContainEqual({
            type: "trapAdded", actor: "hero", trap: trap.id, amount: 98,
        });

        const removed = engine.executeAction(attack("hero", remove.id));
        expect(removed).toMatchObject({
            success: true,
            state: { traps: [{ id: trap.id, amount: 0 }] },
        });
        if (!removed.success) throw new Error("Expected remove action to succeed");
        expect(removed.events.some((event) => event.type === "trapRemoved")).toBe(false);
    });

    it("triggers before a moving attack and reports exactly what state consumed", () => {
        const snare = makeBindingDef("snare");
        const attackMarker = makeBindingDef("attackMarker");
        const trap = trapThatConsumes("snareTrap", 7, snare);
        const act = makeMove("act", "none", {
            targetSide: "none",
            targets: 0,
            accuracy: undefined,
            resolve: (state) => [{
                type: "binding", target: state.characters[0], binding: attackMarker, amount: 1,
            }],
        });
        const engine = makeTrapEngine([{ definition: trap, amount: 100 }], [act]);

        const result = engine.executeAction(attack());
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected action success");
        expect(result.events.map(({ type }) => type)).toEqual([
            "bondageAdded", "trapTriggered", "moveUsed", "bondageAdded",
        ]);
        expect(result.events).toContainEqual({
            type: "trapTriggered", actor: "hero", trap: trap.id, amount: 7,
        });
        expect(result.state.traps).toEqual([{ id: trap.id, amount: 93 }]);
        expect(result.state.characters[0].bindings.map(({ id }) => id)).toEqual([
            snare.id, attackMarker.id,
        ]);
        expect(result.events.some((event) => event.type === "trapRemoved")).toBe(false);
    });

    it("does not trigger movement traps while the actor is standing", () => {
        const trap = trapThatConsumes("standingTrap", 10, makeBindingDef("snare"));
        const engine = makeTrapEngine([{ definition: trap, amount: 100 }]);
        expect(engine.executeAction({ type: "stance", actor: "hero" }).success).toBe(true);

        const result = engine.executeAction(attack());
        expect(result).toMatchObject({ success: true, state: { traps: [{ amount: 100 }] } });
        if (!result.success) throw new Error("Expected action success");
        expect(result.events.map(({ type }) => type)).toEqual(["moveUsed"]);
    });

    it("rejects invalid commands before traps without mutating state or consuming RNG", () => {
        const marker = makeBindingDef("marker");
        const trap = trapThatConsumes("rngTrap", 7, marker);
        const rolledMove = makeMove("rolled", "none", {
            targetSide: "none", targets: 0, accuracy: { miss: 50, hit: 50 },
        });
        const build = () => makeTrapEngine([{ definition: trap, amount: 100 }], [rolledMove], 12345);
        const challenged = build();
        const control = build();
        const before = challenged.getGameState();

        expect(challenged.executeAction(attack("hero", "missing")))
            .toEqual({ success: false, reason: "invalidMove" });
        expect(challenged.getGameState()).toEqual(before);
        expect(challenged.executeAction(attack("hero", rolledMove.id)))
            .toEqual(control.executeAction(attack("hero", rolledMove.id)));
    });

    it.each(["bindingRestriction", "attackUnavailable"] as const)(
        "commits trap effects and interrupts an attack for %s",
        (reason) => {
            const restriction = reason === "bindingRestriction"
                ? { blockedMoveTypes: ["arms" as const] }
                : { blocksAttack: true };
            const status: StatusDef = { id: "bound", levels: [{}, restriction] };
            const blocker = makeBindingDef(`${reason}-source`, {
                easy: [{ definition: status, value: 1 }],
            });
            const trap = trapThatConsumes(`${reason}-trap`, 9, blocker);
            const move = makeMove("arms-action", "arms", {
                targetSide: "none", targets: 0, accuracy: undefined,
            });
            const engine = makeTrapEngine([{ definition: trap, amount: 100 }], [move]);

            const result = engine.executeAction(attack("hero", move.id));
            expect(result.success).toBe(true);
            if (!result.success) throw new Error("Expected committed interruption");
            expect(result.events).toContainEqual({
                type: "actionInterrupted", actor: "hero", reason,
            });
            expect(result.events.some((event) => event.type === "moveUsed")).toBe(false);
            expect(result.state.characters[0].acted).toBe(true);
            expect(result.state.traps[0].amount).toBe(91);
        },
    );

    it.each([
        ["self", "escapeUnavailable", { blocksEscape: true }],
        ["ally", "assistUnavailable", { blocksAssist: true }],
    ] as const)("triggers before a %s escape and can interrupt it for %s", (targetId, reason, restriction) => {
        const rope = makeBindingDef("rope");
        const status: StatusDef = { id: "bound", levels: [{}, restriction] };
        const blocker = makeBindingDef(`${reason}-source`, {
            easy: [{ definition: status, value: 1 }],
        });
        const trap = trapThatConsumes(`${reason}-trap`, 6, blocker);
        const engine = makeTrapEngine(
            [{ definition: trap, amount: 100 }],
            [],
            1,
            (state) => {
                const target = state.characters.find(({ id }) => id === targetId)!;
                target.bindings.push({
                    id: rope.id, definition: rope, value: 30, data: {},
                });
            },
            ["self", "ally"],
        );

        const result = engine.executeAction({
            type: "escape", actor: "self", target: targetId, binding: rope.id,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected committed interruption");
        expect(result.events).toContainEqual({
            type: "actionInterrupted", actor: "self", reason,
        });
        expect(result.events.some((event) =>
            event.type.startsWith("bondage") && "binding" in event && event.binding === rope.id,
        )).toBe(false);
        expect(result.state.characters[0].acted).toBe(true);
        expect(result.state.traps[0].amount).toBe(94);
    });

    it("triggers before a moving assist and then completes the legal escape", () => {
        const rope = makeBindingDef("rope");
        const harmless = makeBindingDef("harmlessTrapBinding");
        const trap = trapThatConsumes("assistTrap", 4, harmless);
        const engine = makeTrapEngine(
            [{ definition: trap, amount: 100 }],
            [],
            1,
            (state) => {
                state.characters[1].bindings.push({
                    id: rope.id, definition: rope, value: 30, data: {},
                });
            },
            ["helper", "ally"],
        );

        const result = engine.executeAction({
            type: "escape", actor: "helper", target: "ally", binding: rope.id,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected assist success");
        expect(result.events.map(({ type }) => type)).toEqual([
            "bondageAdded", "trapTriggered", "bondageChanged",
        ]);
        expect(result.events.at(-1)).toMatchObject({
            target: "ally", binding: rope.id, amount: expect.any(Number),
        });
        expect(result.state.characters[1].bindings[0].value).toBeLessThan(30);
        expect(result.state.traps[0].amount).toBe(96);
    });

    it("resolves multiple authored traps independently in catalogue order", () => {
        const firstBinding = makeBindingDef("firstBinding");
        const secondBinding = makeBindingDef("secondBinding");
        const first = trapThatConsumes("firstTrap", 3, firstBinding);
        const second = trapThatConsumes("secondTrap", 5, secondBinding);
        const engine = makeTrapEngine([
            { definition: first, amount: 100 },
            { definition: second, amount: 100 },
        ]);

        const result = engine.executeAction(attack());
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected action success");
        expect(result.events.filter((event) => event.type === "trapTriggered")).toEqual([
            { type: "trapTriggered", actor: "hero", trap: first.id, amount: 3 },
            { type: "trapTriggered", actor: "hero", trap: second.id, amount: 5 },
        ]);
        expect(result.state.traps).toEqual([
            { id: first.id, amount: 97 },
            { id: second.id, amount: 95 },
        ]);
        expect(result.state.characters[0].bindings.map(({ id }) => id)).toEqual([
            firstBinding.id, secondBinding.id,
        ]);
    });
});

describe("authored Latex puddles", () => {
    it.each([
        [3, [20, 20, 20, 20], 80],
        [2, [20, 20, 0, 0], 40],
        [1, [20, 0, 0, 0], 20],
        [5, [10, 0, 0, 0], 10],
    ] as const)("applies its authored severity region with seed %s", (seed, amounts, consumed) => {
        const engine = makeTrapEngine([{ definition: trapPuddle, amount: 100 }], undefined, seed);

        const result = engine.executeAction(attack());
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected puddle action success");
        const bindings = Object.fromEntries(
            result.state.characters[0].bindings.map((binding) => [binding.id, binding]),
        );
        expect([
            bindings.latexLegs?.value ?? 0,
            bindings.latexArms?.value ?? 0,
            bindings.latexTorso?.value ?? 0,
            bindings.latexHead?.value ?? 0,
        ]).toEqual(amounts);
        expect(result.state.characters[0].bindings.map(({ id }) => id)).toEqual(
            ["latexLegs", "latexArms", "latexTorso", "latexHead"].slice(0, amounts.filter(Boolean).length),
        );
        expect(result.state.characters[0].bindings.every((binding) => binding.data.peak === binding.value))
            .toBe(true);
        expect(result.state.traps[0].amount).toBe(100 - consumed);
        expect(result.events).toContainEqual({
            type: "trapTriggered", actor: "hero", trap: trapPuddle.id, amount: consumed,
        });
    });

    it("consumes only the remaining puddle amount and never drops below zero", () => {
        const engine = makeTrapEngine([{ definition: trapPuddle, amount: 15 }], undefined, 3);

        const result = engine.executeAction(attack());
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected puddle action success");
        expect(result.state.traps).toEqual([{ id: trapPuddle.id, amount: 0 }]);
        expect(result.state.characters[0].bindings).toEqual([
            expect.objectContaining({ id: "latexLegs", value: 15, data: { peak: 15 } }),
        ]);
        expect(result.events).toContainEqual({
            type: "trapTriggered", actor: "hero", trap: trapPuddle.id, amount: 15,
        });
    });
});
