import { describe, expect, it } from "vitest";
import { latexArms, latexCollar, latexHead, latexLegs, latexTorso } from "../../src/content/skunk/latex";
import { skunkette } from "../../src/content/skunk/skunkette";
import { createCustomEngine } from "../../src/engine/protected/engine";
import {
    bindingState,
    buffState,
    characterState,
    enemyState,
    execute,
    makeBehavioralCharacter,
    makeBehavioralEngine,
    makeBehavioralMove,
} from "../helpers/behavioralHelpers";
import { actionView } from "../helpers/gameView";

const POUNCE_ID = "pounce";
const SKUNKED_ID = "skunked";
const THROW_OFF_ID = "throwOff";
const LATEX_MIST_ID = "latexMist";
const LATEX_BODY_BINDINGS = [latexHead, latexArms, latexTorso, latexLegs];
const SKUNKED_CHARACTER_ID = "victim";
const LINKED_SKUNKETTE_ID = "skunketteVictim";

function setupPounce(seed: number, withAttacker = false) {
    const strike = makeBehavioralMove("strike", "arms", {
        resolve: (state, actor) => [{
            type: "damage",
            source: actor,
            target: state.enemies[0],
            amount: 1,
        }],
    });
    const characters = [makeBehavioralCharacter("victim")];
    if (withAttacker) characters.push(makeBehavioralCharacter("attacker", [strike]));
    const engine = makeBehavioralEngine(characters, [skunkette], seed);
    const pounceTurn = execute(engine, { type: "endTurn" });
    return { engine, pounceTurn, strike };
}

function setupSkunkingLifecycle() {
    const victimMove = makeBehavioralMove("victim-action", "none", {
        targetSide: "none",
        targets: 0,
        accuracy: undefined,
    });
    const fullySkunk = makeBehavioralMove("fully-skunk", "none", {
        targetSide: "none",
        targets: 0,
        accuracy: undefined,
        freeOnHit: true,
        resolve: (state, actor) => [
            {
                type: "binding",
                source: actor,
                target: state.characters[0],
                binding: latexCollar,
                amount: 30,
            },
            ...LATEX_BODY_BINDINGS.map((binding) => ({
                type: "binding" as const,
                source: actor,
                target: state.characters[0],
                binding,
                amount: 80,
            })),
        ],
    });
    const defeatSkunkette = makeBehavioralMove("defeat-skunkette", "arms", {
        freeOnHit: true,
        resolve: (state, actor, _move, targets) => {
            const target = state.enemies.find((enemy) => enemy === targets[0]?.target);
            return target ? [{
                type: "damage",
                source: actor,
                target,
                amount: skunkette.hp,
            }] : [];
        },
    });
    const engine = makeBehavioralEngine([
        makeBehavioralCharacter(SKUNKED_CHARACTER_ID, [victimMove]),
        makeBehavioralCharacter("rescuer", [fullySkunk, defeatSkunkette]),
    ], [skunkette], 3);

    execute(engine, { type: "endTurn" });
    const skunking = execute(engine, {
        type: "move",
        actor: "rescuer",
        move: fullySkunk.id,
        targets: [],
    });

    return { defeatSkunkette, engine, skunking, victimMove };
}

describe("Skunkette behavior through GameEngine", () => {
    it.each([
        [9, 2, ["immobilized"]],
        [4, 4, ["immobilized"]],
        [2, 6, ["immobilized", "stunned"]],
        [3, 8, ["immobilized", "helpless"]],
    ] as const)(
        "creates the expected linked Pounce severity with seed %s",
        (seed, enemyHit, statusIds) => {
            const { engine, pounceTurn } = setupPounce(seed);

            expect(pounceTurn.events[1]).toMatchObject({
                type: "moveUsed",
                actor: "skunkette1",
                move: POUNCE_ID,
                targets: [{ target: "victim" }],
            });
            expect(buffState(engine, POUNCE_ID, "victim")?.statuses?.map(({ id }) => id))
                .toEqual(statusIds);
            expect(buffState(engine, POUNCE_ID, "skunkette1")?.modifiers).toMatchObject({
                defense: -2,
                hit: enemyHit,
            });
            expect(buffState(engine, POUNCE_ID, "victim")?.linkedEntity).toBe("skunkette1");
            expect(buffState(engine, POUNCE_ID, "skunkette1")?.linkedEntity).toBe("victim");
        },
    );

    it("adds the linked Spray binding on a sufficiently strong Pounce crit", () => {
        const { engine, pounceTurn } = setupPounce(64);
        const bindingEvent = pounceTurn.events.find(
            (event) => event.type === "bondageAdded",
        );

        expect(bindingEvent).toMatchObject({ type: "bondageAdded", target: "victim" });
        expect([latexHead.id, latexArms.id, latexTorso.id, latexLegs.id])
            .toContain(bindingEvent?.type === "bondageAdded" ? bindingEvent.binding : undefined);
        expect(characterState(engine, "victim").bindings).toHaveLength(1);
    });

    it("weakens both linked Pounce buffs when another character damages Skunkette", () => {
        const { engine, strike } = setupPounce(3, true);
        expect(buffState(engine, POUNCE_ID, "skunkette1")?.modifiers?.hit).toBe(8);

        const result = execute(engine, {
            type: "move",
            actor: "attacker",
            move: strike.id,
            targets: ["skunkette1"],
        });

        expect(result.events.slice(1)).toEqual([
            { type: "enemyDamaged", target: "skunkette1", amount: 1 },
            { type: "buffUpdated", target: "victim", buff: POUNCE_ID },
            { type: "buffUpdated", target: "skunkette1", buff: POUNCE_ID },
        ]);
        expect(buffState(engine, POUNCE_ID, "skunkette1")?.modifiers?.hit).toBe(6);
        expect(buffState(engine, POUNCE_ID, "victim")?.statuses?.map(({ id }) => id))
            .toEqual(["immobilized", "stunned"]);
    });

    it("removes both linked Pounce buffs and restores cooldown when damage breaks it", () => {
        const { engine, strike } = setupPounce(32, true);

        const result = execute(engine, {
            type: "move",
            actor: "attacker",
            move: strike.id,
            targets: ["skunkette1"],
        });

        expect(result.events.slice(1)).toEqual([
            { type: "enemyDamaged", target: "skunkette1", amount: 1 },
            { type: "buffRemoved", target: "skunkette1", buff: POUNCE_ID },
            { type: "buffRemoved", target: "victim", buff: POUNCE_ID },
            {
                type: "cooldownChanged",
                target: "skunkette1",
                move: POUNCE_ID,
                value: 2,
            },
        ]);
        expect(buffState(engine, POUNCE_ID, "victim")).toBeUndefined();
        expect(buffState(engine, POUNCE_ID, "skunkette1")).toBeUndefined();
        expect(enemyState(engine, "skunkette1").cooldowns[POUNCE_ID]).toBe(2);
    });

    it("removes the surviving linked Pounce after damage callbacks and defeat", () => {
        const lethal = makeBehavioralMove("lethal", "arms", {
            resolve: (state, actor) => [{
                type: "damage",
                source: actor,
                target: state.enemies[0],
                amount: skunkette.hp,
            }],
        });
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("victim"),
            makeBehavioralCharacter("attacker", [lethal]),
        ], [skunkette], 3);
        execute(engine, { type: "endTurn" });

        const result = execute(engine, {
            type: "move",
            actor: "attacker",
            move: lethal.id,
            targets: ["skunkette1"],
        });

        expect(result.events.slice(1)).toEqual([
            { type: "enemyDamaged", target: "skunkette1", amount: skunkette.hp },
            { type: "buffAdded", target: "skunkette1", buff: "resistance" },
            { type: "buffUpdated", target: "victim", buff: POUNCE_ID },
            { type: "buffUpdated", target: "skunkette1", buff: POUNCE_ID },
            { type: "buffRemoved", target: "skunkette1", buff: POUNCE_ID },
            { type: "buffRemoved", target: "victim", buff: POUNCE_ID },
            { type: "enemyDefeated", target: "skunkette1" },
        ]);
        expect(buffState(engine, POUNCE_ID, "victim")).toBeUndefined();
        expect(engine.getGameView().enemies).toEqual([]);
    });

    it("keeps Pounce on a Throw Off miss and removes both sides on a hit", () => {
        const missed = setupPounce(4).engine;
        expect(enemyState(missed, "skunkette1").cooldowns[POUNCE_ID]).toBe(1);
        const missResult = execute(missed, {
            type: "move",
            actor: "victim",
            move: THROW_OFF_ID,
            targets: [],
        });
        expect(missResult.events).toEqual([{
            type: "moveUsed",
            actor: "victim",
            move: THROW_OFF_ID,
            targets: [],
        }]);
        expect(buffState(missed, POUNCE_ID, "victim")).toBeDefined();
        expect(buffState(missed, POUNCE_ID, "skunkette1")).toBeDefined();
        expect(enemyState(missed, "skunkette1").cooldowns[POUNCE_ID]).toBe(1);

        const hit = setupPounce(2).engine;
        const hitResult = execute(hit, {
            type: "move",
            actor: "victim",
            move: THROW_OFF_ID,
            targets: [],
        });
        expect(hitResult.events).toEqual([
            { type: "moveUsed", actor: "victim", move: THROW_OFF_ID, targets: [] },
            { type: "buffRemoved", target: "victim", buff: POUNCE_ID },
            { type: "buffRemoved", target: "skunkette1", buff: POUNCE_ID },
            {
                type: "cooldownChanged",
                target: "skunkette1",
                move: POUNCE_ID,
                value: 2,
            },
        ]);
        expect(buffState(hit, POUNCE_ID, "victim")).toBeUndefined();
        expect(buffState(hit, POUNCE_ID, "skunkette1")).toBeUndefined();
        expect(enemyState(hit, "skunkette1").cooldowns[POUNCE_ID]).toBe(2);
        expect(characterState(hit, "victim").standing).toBe(true);

        execute(hit, { type: "endTurn" });
        expect(characterState(hit, "victim").standing).toBe(false);
    });

    it("fully skunks an incapacitated character and revives them when their linked Skunkette is defeated", () => {
        const { defeatSkunkette, engine, skunking, victimMove } = setupSkunkingLifecycle();

        expect(skunking.events).toEqual([
            { type: "moveUsed", actor: "rescuer", move: "fully-skunk", targets: [] },
            { type: "bondageAdded", target: SKUNKED_CHARACTER_ID, binding: latexCollar.id, amount: 30 },
            ...LATEX_BODY_BINDINGS.map((binding) => ({
                type: "bondageAdded" as const,
                target: SKUNKED_CHARACTER_ID,
                binding: binding.id,
                amount: 80,
            })),
            { type: "buffRemoved", target: SKUNKED_CHARACTER_ID, buff: POUNCE_ID },
            { type: "buffRemoved", target: "skunkette1", buff: POUNCE_ID },
            {
                type: "bondageRemoved",
                target: SKUNKED_CHARACTER_ID,
                binding: latexCollar.id,
                amount: -30,
            },
            { type: "buffAdded", target: SKUNKED_CHARACTER_ID, buff: SKUNKED_ID },
            { type: "enemySpawned", target: LINKED_SKUNKETTE_ID },
            { type: "buffAdded", target: LINKED_SKUNKETTE_ID, buff: SKUNKED_ID },
        ]);
        expect(LATEX_BODY_BINDINGS.map((binding) =>
            bindingState(engine, binding.id, SKUNKED_CHARACTER_ID)?.value,
        )).toEqual([80, 80, 80, 80]);
        expect(bindingState(engine, latexCollar.id, SKUNKED_CHARACTER_ID)).toBeUndefined();
        expect(buffState(engine, POUNCE_ID, SKUNKED_CHARACTER_ID)).toBeUndefined();
        expect(buffState(engine, POUNCE_ID, "skunkette1")).toBeUndefined();
        expect(buffState(engine, SKUNKED_ID, SKUNKED_CHARACTER_ID)).toMatchObject({
            linkedEntity: LINKED_SKUNKETTE_ID,
            statuses: [{ id: "incapacitated", value: 1 }],
        });
        expect(enemyState(engine, LINKED_SKUNKETTE_ID).id).toBe(LINKED_SKUNKETTE_ID);
        expect(buffState(engine, SKUNKED_ID, LINKED_SKUNKETTE_ID)).toMatchObject({
            linkedEntity: SKUNKED_CHARACTER_ID,
        });
        expect(actionView(engine, SKUNKED_CHARACTER_ID)).toMatchObject({
            id: SKUNKED_CHARACTER_ID,
            available: false,
            reason: "actorIncapacitated",
        });
        expect(actionView(engine, SKUNKED_CHARACTER_ID).moves).toContainEqual({
            move: {
                id: victimMove.id,
                targetSide: victimMove.targetSide,
                targets: victimMove.targets,
                type: victimMove.type,
            },
            available: false,
            targets: [{ target: null, valid: true, accuracy: null }],
            reason: "actorIncapacitated",
        });

        const ordinaryDefeat = execute(engine, {
            type: "move",
            actor: "rescuer",
            move: defeatSkunkette.id,
            targets: ["skunkette1"],
        });

        expect(ordinaryDefeat.events).toEqual([
            {
                type: "moveUsed",
                actor: "rescuer",
                move: defeatSkunkette.id,
                targets: [{ target: "skunkette1", result: "hit" }],
            },
            { type: "enemyDamaged", target: "skunkette1", amount: skunkette.hp },
            { type: "buffAdded", target: "skunkette1", buff: "resistance" },
            { type: "enemyDefeated", target: "skunkette1" },
        ]);
        expect(ordinaryDefeat.view.enemies.some(({ id }) => id === "skunkette1")).toBe(false);
        expect(enemyState(engine, LINKED_SKUNKETTE_ID).id).toBe(LINKED_SKUNKETTE_ID);
        expect(buffState(engine, SKUNKED_ID, SKUNKED_CHARACTER_ID)).toMatchObject({
            linkedEntity: LINKED_SKUNKETTE_ID,
            statuses: [{ id: "incapacitated", value: 1 }],
        });
        expect(LATEX_BODY_BINDINGS.map((binding) =>
            bindingState(engine, binding.id, SKUNKED_CHARACTER_ID)?.value,
        )).toEqual([80, 80, 80, 80]);
        expect(actionView(engine, SKUNKED_CHARACTER_ID)).toMatchObject({
            id: SKUNKED_CHARACTER_ID,
            available: false,
            reason: "actorIncapacitated",
        });

        const rescue = execute(engine, {
            type: "move",
            actor: "rescuer",
            move: defeatSkunkette.id,
            targets: [LINKED_SKUNKETTE_ID],
        });

        expect(rescue.events).toEqual([
            {
                type: "moveUsed",
                actor: "rescuer",
                move: defeatSkunkette.id,
                targets: [{ target: LINKED_SKUNKETTE_ID, result: "hit" }],
            },
            { type: "enemyDamaged", target: LINKED_SKUNKETTE_ID, amount: skunkette.hp },
            { type: "buffAdded", target: LINKED_SKUNKETTE_ID, buff: "resistance" },
            { type: "buffRemoved", target: LINKED_SKUNKETTE_ID, buff: SKUNKED_ID },
            { type: "buffRemoved", target: SKUNKED_CHARACTER_ID, buff: SKUNKED_ID },
            ...LATEX_BODY_BINDINGS.map((binding) => ({
                type: "bondageChanged" as const,
                target: SKUNKED_CHARACTER_ID,
                binding: binding.id,
                amount: -40,
            })),
            { type: "enemyDefeated", target: LINKED_SKUNKETTE_ID },
        ]);
        expect(rescue.view.enemies.some(({ id }) => id === LINKED_SKUNKETTE_ID)).toBe(false);
        expect(buffState(engine, SKUNKED_ID, SKUNKED_CHARACTER_ID)).toBeUndefined();
        expect(LATEX_BODY_BINDINGS.map((binding) =>
            bindingState(engine, binding.id, SKUNKED_CHARACTER_ID)?.value,
        )).toEqual([40, 40, 40, 40]);
        expect(actionView(engine, SKUNKED_CHARACTER_ID)).toMatchObject({
            id: SKUNKED_CHARACTER_ID,
            available: true,
        });
        expect(actionView(engine, SKUNKED_CHARACTER_ID).moves).toContainEqual({
            move: {
                id: victimMove.id,
                targetSide: victimMove.targetSide,
                targets: victimMove.targets,
                type: victimMove.type,
            },
            available: true,
            targets: [{ target: null, valid: true, accuracy: null }],
        });
    });

    it("does not rescue a skunked character when an ordinary unlinked Skunkette is defeated", () => {
        const { defeatSkunkette, engine } = setupSkunkingLifecycle();

        const result = execute(engine, {
            type: "move",
            actor: "rescuer",
            move: defeatSkunkette.id,
            targets: ["skunkette1"],
        });

        expect(result.events).toEqual([
            {
                type: "moveUsed",
                actor: "rescuer",
                move: defeatSkunkette.id,
                targets: [{ target: "skunkette1", result: "hit" }],
            },
            { type: "enemyDamaged", target: "skunkette1", amount: skunkette.hp },
            { type: "buffAdded", target: "skunkette1", buff: "resistance" },
            { type: "enemyDefeated", target: "skunkette1" },
        ]);
        expect(result.view.enemies.some(({ id }) => id === "skunkette1")).toBe(false);
        expect(enemyState(engine, LINKED_SKUNKETTE_ID).id).toBe(LINKED_SKUNKETTE_ID);
        expect(buffState(engine, SKUNKED_ID, SKUNKED_CHARACTER_ID)).toMatchObject({
            linkedEntity: LINKED_SKUNKETTE_ID,
            statuses: [{ id: "incapacitated", value: 1 }],
        });
        expect(buffState(engine, SKUNKED_ID, LINKED_SKUNKETTE_ID)).toMatchObject({
            linkedEntity: SKUNKED_CHARACTER_ID,
        });
        expect(LATEX_BODY_BINDINGS.map((binding) =>
            bindingState(engine, binding.id, SKUNKED_CHARACTER_ID)?.value,
        )).toEqual([80, 80, 80, 80]);
        expect(actionView(engine, SKUNKED_CHARACTER_ID)).toMatchObject({
            id: SKUNKED_CHARACTER_ID,
            available: false,
            reason: "actorIncapacitated",
        });
    });

    it("follows a Pounce with a dynamically selected Spray binding", () => {
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero"),
        ], [skunkette], 3);

        expect(enemyState(engine, "skunkette1").intentions[0]?.move).toBe(POUNCE_ID);
        execute(engine, { type: "endTurn" });
        const nextIntention = enemyState(engine, "skunkette1").intentions[0];
        const bindingEffect = nextIntention?.targets[0].effects.find(
            (effect) => effect.type === "binding",
        );

        expect(nextIntention?.move).toBe("latexSpray");
        expect(bindingEffect?.type).toBe("binding");
        expect([latexHead.id, latexArms.id, latexTorso.id, latexLegs.id])
            .toContain(bindingEffect?.type === "binding" ? bindingEffect.binding : undefined);
    });

    it("selects Latex Spray from fallback priority when Pounce is unavailable", () => {
        const { engine, strike } = setupPounce(32, true);
        execute(engine, {
            type: "move",
            actor: "attacker",
            move: strike.id,
            targets: ["skunkette1"],
        });

        expect(buffState(engine, POUNCE_ID, "victim")).toBeUndefined();
        expect(buffState(engine, POUNCE_ID, "skunkette1")).toBeUndefined();
        expect(enemyState(engine, "skunkette1").cooldowns[POUNCE_ID]).toBe(2);

        // Finish the already-previewed priority #1 Spray. The next intention must
        // use priority #3 because there is no Pounce relationship and its cooldown remains active.
        execute(engine, { type: "endTurn" });

        const state = engine.getGameView();
        const intention = enemyState(engine, "skunkette1").intentions[0];
        const bindingEffect = intention?.targets[0]?.effects.find(
            (effect) => effect.type === "binding",
        );
        expect(enemyState(engine, "skunkette1").cooldowns[POUNCE_ID]).toBe(1);
        expect(buffState(engine, POUNCE_ID, "victim")).toBeUndefined();
        expect(buffState(engine, POUNCE_ID, "skunkette1")).toBeUndefined();
        expect(intention?.move).toBe("latexSpray");
        expect(state.characters.map(({ id }) => id)).toContain(intention?.targets[0]?.target);
        expect(bindingEffect).toMatchObject({
            type: "binding",
            target: expect.any(String),
            binding: expect.any(String),
            amount: expect.any(Number),
        });
        expect(LATEX_BODY_BINDINGS.map(({ id }) => id)).toContain(
            bindingEffect?.type === "binding" ? bindingEffect.binding : undefined,
        );

        if (bindingEffect?.type !== "binding" || bindingEffect.amount === undefined) {
            throw new Error("Expected the fallback Spray preview to contain bondage");
        }
        const before = bindingState(engine, bindingEffect.binding, bindingEffect.target)?.value ?? 0;
        const fallbackTurn = execute(engine, { type: "endTurn" });

        expect(fallbackTurn.events).toContainEqual({
            type: "moveUsed",
            actor: "skunkette1",
            move: "latexSpray",
            targets: [{ target: bindingEffect.target, result: intention.targets[0].band }],
        });
        expect(fallbackTurn.events).toContainEqual(expect.objectContaining({
            type: before === 0 ? "bondageAdded" : "bondageChanged",
            target: bindingEffect.target,
            binding: bindingEffect.binding,
            amount: bindingEffect.amount,
        }));
        expect(bindingState(engine, bindingEffect.binding, bindingEffect.target)?.value)
            .toBe(before + bindingEffect.amount);
    });

    it("does not select an Impossible latex location for Spray", () => {
        const prepare = makeBehavioralMove("prepare-impossible", "mouth", {
            targetSide: "none",
            targets: 0,
            resolve: (state, actor) => [latexHead, latexArms, latexTorso].map((binding) => ({
                type: "binding" as const,
                source: actor,
                target: state.characters[0],
                binding,
                amount: 80,
            })),
        });
        const encounter = { id: "select-latex", enemies: [skunkette], bindings: [], traps: [] };
        const hero = makeBehavioralCharacter("hero", [prepare]);
        const engine = createCustomEngine([encounter], [hero], 1);
        engine.loadCharacter(hero.id);
        execute(engine, {
            type: "move",
            actor: "hero",
            move: prepare.id,
            targets: [],
        });
        engine.loadEncounter(encounter.id);
        execute(engine, { type: "endTurn" });

        const intention = enemyState(engine, "skunkette1").intentions[0];
        const bindingEffects = intention?.targets.flatMap(({ effects }) =>
            effects.filter((effect) => effect.type === "binding"));
        expect(intention?.move).toBe("latexSpray");
        expect(bindingEffects).toEqual([expect.objectContaining({ binding: latexLegs.id })]);

        execute(engine, { type: "endTurn" });
        expect(bindingState(engine, latexHead.id)?.value).toBe(80);
        expect(bindingState(engine, latexArms.id)?.value).toBe(80);
        expect(bindingState(engine, latexTorso.id)?.value).toBe(80);
        expect(bindingState(engine, latexLegs.id)?.value).toBeGreaterThan(0);
    });

    it("uses independent target rolls and one shared spread modifier for Latex Mist", () => {
        const prepare = makeBehavioralMove("prepare-mist", "mouth", {
            targetSide: "none",
            targets: 0,
            resolve: (state, actor) => [
                {
                    type: "binding",
                    source: actor,
                    target: state.characters[0],
                    binding: latexArms,
                    amount: 10,
                },
                {
                    type: "binding",
                    source: actor,
                    target: state.characters[1],
                    binding: latexHead,
                    amount: 10,
                },
                ...state.characters.map((target) => ({
                    type: "buff" as const,
                    target,
                    buff: { id: POUNCE_ID, active: true },
                    operation: "add" as const,
                })),
            ],
        });
        const encounter = { id: "mist", enemies: [skunkette], bindings: [], traps: [] };
        const first = makeBehavioralCharacter("first", [prepare]);
        const second = makeBehavioralCharacter("second");
        const engine = createCustomEngine([encounter], [first, second], 23);
        engine.loadCharacter(first.id);
        engine.loadCharacter(second.id);
        execute(engine, { type: "move", actor: "first", move: prepare.id, targets: [] });
        engine.loadEncounter(encounter.id);

        const preview = enemyState(engine, "skunkette1").intentions[0];
        expect(preview?.move).toBe(LATEX_MIST_ID);
        expect(preview?.targets.map(({ target, band: result }) => ({ target, result }))).toEqual([
            { target: "first", result: "miss" },
            { target: "second", result: "hit" },
        ]);

        execute(engine, { type: "endTurn" });
        expect(buffState(engine, LATEX_MIST_ID, "first")).toMatchObject({
            id: LATEX_MIST_ID,
            modifiers: { spread: 1 },
            duration: 1,
        });
        expect(buffState(engine, LATEX_MIST_ID, "second")).toMatchObject({
            id: LATEX_MIST_ID,
            modifiers: { spread: 1 },
            duration: 1,
        });
        expect(bindingState(engine, latexArms.id, "first")?.value).toBe(10);
        expect(bindingState(engine, latexHead.id, "second")?.value).toBeGreaterThan(10);
    });

    it("adds bondage to every existing latex binding on a Latex Mist crit", () => {
        const existingBindings = [latexHead, latexArms, latexTorso];
        const startingValues = [10, 20, 30];
        const prepare = makeBehavioralMove("prepare-mist-crit", "mouth", {
            targetSide: "none",
            targets: 0,
            resolve: (state, actor) => [
                ...existingBindings.map((binding, index) => ({
                    type: "binding" as const,
                    source: actor,
                    target: state.characters[0],
                    binding,
                    amount: startingValues[index],
                })),
                {
                    type: "buff" as const,
                    target: state.characters[0],
                    buff: { id: POUNCE_ID, active: true },
                    operation: "add" as const,
                },
            ],
        });
        const encounter = { id: "mist-crit", enemies: [skunkette], bindings: [], traps: [] };
        const hero = makeBehavioralCharacter("hero", [prepare]);
        const engine = createCustomEngine([encounter], [hero], 428);
        engine.loadCharacter(hero.id);
        execute(engine, {
            type: "move",
            actor: "hero",
            move: prepare.id,
            targets: [],
        });
        engine.loadEncounter(encounter.id);

        expect(enemyState(engine, "skunkette1").intentions).toMatchObject([{
            move: LATEX_MIST_ID,
            targets: [{ target: "hero", band: "crit" }],
        }]);

        const result = execute(engine, { type: "endTurn" });

        expect(result.events).toEqual([
            { type: "phaseChanged", phase: "enemy" },
            {
                type: "moveUsed",
                actor: "skunkette1",
                move: LATEX_MIST_ID,
                targets: [{ target: "hero", result: "crit" }],
            },
            { type: "buffAdded", target: "hero", buff: LATEX_MIST_ID },
            ...existingBindings.map((binding) => ({
                type: "bondageChanged" as const,
                target: "hero",
                binding: binding.id,
                amount: 10,
            })),
            { type: "phaseChanged", phase: "player" },
        ]);
        expect(existingBindings.map((binding) =>
            bindingState(engine, binding.id)?.value,
        )).toEqual([20, 30, 40]);
        expect(buffState(engine, LATEX_MIST_ID)).toMatchObject({
            id: LATEX_MIST_ID,
            modifiers: { spread: 1 },
            duration: 1,
        });
        expect(buffState(engine, SKUNKED_ID)).toBeUndefined();
        expect(engine.getGameView().enemies.map(({ id }) => id)).toEqual(["skunkette1"]);
    });
});
