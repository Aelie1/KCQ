import { describe, expect, it } from "vitest";
import { latexArms, latexHead, latexLegs, latexTorso } from "../src/content/skunk/latex";
import { skunkette } from "../src/content/skunk/skunkette";
import { GameEngine } from "../src/engine/engine";
import {
    bindingState,
    buffState,
    characterState,
    enemyState,
    execute,
    makeBehavioralCharacter,
    makeBehavioralEngine,
    makeBehavioralMove,
} from "./behavioralHelpers";

const POUNCE_ID = "pounce";
const THROW_OFF_ID = "throwOff";
const LATEX_MIST_ID = "latexMist";

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

describe("Skunkette behavior through GameEngine", () => {
    it.each([
        [3, 2, ["immobilized"]],
        [6, 4, ["immobilized"]],
        [4, 6, ["immobilized", "stunned"]],
        [10, 8, ["immobilized", "helpless"]],
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
        const { engine, pounceTurn } = setupPounce(26);
        const bindingEvent = pounceTurn.events.find(
            (event) => event.type === "bondageAdded",
        );

        expect(bindingEvent).toMatchObject({ type: "bondageAdded", target: "victim" });
        expect([latexHead.id, latexArms.id, latexTorso.id, latexLegs.id])
            .toContain(bindingEvent?.type === "bondageAdded" ? bindingEvent.binding : undefined);
        expect(characterState(engine, "victim").bindings).toHaveLength(1);
    });

    it("weakens both linked Pounce buffs when another character damages Skunkette", () => {
        const { engine, strike } = setupPounce(10, true);
        expect(buffState(engine, POUNCE_ID, "skunkette1")?.modifiers?.hit).toBe(8);

        const result = execute(engine, {
            type: "attack",
            actor: "attacker",
            move: strike.id,
            targets: ["skunkette1"],
        });

        expect(result.events.slice(1)).toEqual([
            { type: "damage", target: "skunkette1", amount: 1 },
            { type: "buffUpdated", target: "victim", buff: POUNCE_ID },
            { type: "buffUpdated", target: "skunkette1", buff: POUNCE_ID },
        ]);
        expect(buffState(engine, POUNCE_ID, "skunkette1")?.modifiers?.hit).toBe(6);
        expect(buffState(engine, POUNCE_ID, "victim")?.statuses?.map(({ id }) => id))
            .toEqual(["immobilized", "stunned"]);
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
        ], [skunkette], 10);
        execute(engine, { type: "endTurn" });

        const result = execute(engine, {
            type: "attack",
            actor: "attacker",
            move: lethal.id,
            targets: ["skunkette1"],
        });

        expect(result.events.slice(1)).toEqual([
            { type: "damage", target: "skunkette1", amount: skunkette.hp },
            { type: "buffUpdated", target: "victim", buff: POUNCE_ID },
            { type: "buffUpdated", target: "skunkette1", buff: POUNCE_ID },
            { type: "enemyDefeated", target: "skunkette1" },
            { type: "buffRemoved", target: "victim", buff: POUNCE_ID },
        ]);
        expect(buffState(engine, POUNCE_ID, "victim")).toBeUndefined();
        expect(engine.getGameState().enemies).toEqual([]);
    });

    it("keeps Pounce on a Throw Off miss and removes both sides on a hit", () => {
        const missed = setupPounce(3).engine;
        expect(enemyState(missed, "skunkette1").cooldowns[POUNCE_ID]).toBe(1);
        const missResult = execute(missed, {
            type: "attack",
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

        const hit = setupPounce(18).engine;
        const hitResult = execute(hit, {
            type: "attack",
            actor: "victim",
            move: THROW_OFF_ID,
            targets: [],
        });
        expect(hitResult.events).toEqual([
            { type: "moveUsed", actor: "victim", move: THROW_OFF_ID, targets: [] },
            { type: "buffRemoved", target: "victim", buff: POUNCE_ID },
            { type: "buffRemoved", target: "skunkette1", buff: POUNCE_ID },
        ]);
        expect(buffState(hit, POUNCE_ID, "victim")).toBeUndefined();
        expect(buffState(hit, POUNCE_ID, "skunkette1")).toBeUndefined();
        expect(enemyState(hit, "skunkette1").cooldowns[POUNCE_ID]).toBe(2);
        expect(characterState(hit, "victim").standing).toBe(true);

        execute(hit, { type: "endTurn" });
        expect(characterState(hit, "victim").standing).toBe(false);
    });

    it("follows a Pounce with a dynamically selected Spray binding", () => {
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero"),
        ], [skunkette], 3);

        expect(enemyState(engine, "skunkette1").intention?.move).toBe(POUNCE_ID);
        execute(engine, { type: "endTurn" });
        const nextIntention = enemyState(engine, "skunkette1").intention;
        const bindingEffect = nextIntention?.targets[0].effects.find(
            (effect) => effect.type === "binding",
        );

        expect(nextIntention?.move).toBe("latexSpray");
        expect(bindingEffect?.type).toBe("binding");
        expect([latexHead.id, latexArms.id, latexTorso.id, latexLegs.id])
            .toContain(bindingEffect?.type === "binding" ? bindingEffect.binding : undefined);
    });

    it("does not select an Impossible latex location for Spray", () => {
        const prepare = makeBehavioralMove("prepare-impossible", "mouth", {
            side: "none",
            targets: 0,
            resolve: (state) => [latexHead, latexArms, latexTorso].map((binding) => ({
                type: "binding" as const,
                target: state.characters[0],
                binding,
                amount: 80,
            })),
        });
        const encounter = { id: "select-latex", enemies: [skunkette], bindings: [] };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(makeBehavioralCharacter("hero", [prepare]));
        execute(engine, {
            type: "attack",
            actor: "hero",
            move: prepare.id,
            targets: [],
        });
        engine.loadEncounter(encounter.id);
        execute(engine, { type: "endTurn" });

        const intention = enemyState(engine, "skunkette1").intention;
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
            side: "none",
            targets: 0,
            resolve: (state) => [
                {
                    type: "binding",
                    target: state.characters[0],
                    binding: latexArms,
                    amount: 10,
                },
                {
                    type: "binding",
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
        const encounter = { id: "mist", enemies: [skunkette], bindings: [] };
        const engine = new GameEngine([encounter], 2);
        engine.loadCharacter(makeBehavioralCharacter("first", [prepare]));
        engine.loadCharacter(makeBehavioralCharacter("second"));
        execute(engine, { type: "attack", actor: "first", move: prepare.id, targets: [] });
        engine.loadEncounter(encounter.id);

        const preview = enemyState(engine, "skunkette1").intention;
        expect(preview?.move).toBe(LATEX_MIST_ID);
        expect(preview?.targets.map(({ target, band: result }) => ({ target, result }))).toEqual([
            { target: "first", result: "miss" },
            { target: "second", result: "hit" },
        ]);

        execute(engine, { type: "endTurn" });
        expect(buffState(engine, LATEX_MIST_ID, "first")).toMatchObject({
            id: LATEX_MIST_ID,
            modifiers: { spread: 1 },
            active: true,
            duration: 1,
        });
        expect(buffState(engine, LATEX_MIST_ID, "second")).toMatchObject({
            id: LATEX_MIST_ID,
            modifiers: { spread: 1 },
            active: true,
            duration: 1,
        });
        expect(bindingState(engine, latexArms.id, "first")?.value).toBe(10);
        expect(bindingState(engine, latexHead.id, "second")?.value).toBeGreaterThan(10);
    });
});
