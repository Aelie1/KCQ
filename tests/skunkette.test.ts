import { describe, expect, it } from "vitest";
import { latexArms, latexHead, latexLegs, latexTorso } from "../src/content/skunk/latex";
import { latexMist, pounce, skunkette, throwOff } from "../src/content/skunk/skunkette";
import type { EnemyDef } from "../src/engine/itypes";
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
                move: pounce.id,
                targets: [{ target: "victim" }],
            });
            expect(buffState(engine, pounce.id, "victim")?.statuses?.map(({ id }) => id))
                .toEqual(statusIds);
            expect(buffState(engine, pounce.id, "skunkette1")?.modifiers).toMatchObject({
                defense: -2,
                hit: enemyHit,
            });
            expect(buffState(engine, pounce.id, "victim")?.linkedEntity).toBe("skunkette1");
            expect(buffState(engine, pounce.id, "skunkette1")?.linkedEntity).toBe("victim");
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
        expect(buffState(engine, pounce.id, "skunkette1")?.modifiers?.hit).toBe(8);

        const result = execute(engine, {
            type: "attack",
            actor: "attacker",
            move: strike.id,
            targets: ["skunkette1"],
        });

        expect(result.events.slice(1)).toEqual([
            { type: "damage", target: "skunkette1", amount: 1 },
            { type: "buffUpdated", target: "victim", buff: pounce.id },
            { type: "buffUpdated", target: "skunkette1", buff: pounce.id },
        ]);
        expect(buffState(engine, pounce.id, "skunkette1")?.modifiers?.hit).toBe(6);
        expect(buffState(engine, pounce.id, "victim")?.statuses?.map(({ id }) => id))
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
            { type: "buffUpdated", target: "victim", buff: pounce.id },
            { type: "buffUpdated", target: "skunkette1", buff: pounce.id },
            { type: "enemyDefeated", target: "skunkette1" },
            { type: "buffRemoved", target: "victim", buff: pounce.id },
        ]);
        expect(buffState(engine, pounce.id, "victim")).toBeUndefined();
        expect(engine.getGameState().enemies).toEqual([]);
    });

    it("keeps Pounce on a Throw Off miss and removes both sides on a hit", () => {
        const missed = setupPounce(3).engine;
        expect(enemyState(missed, "skunkette1").cooldowns[pounce.id]).toBe(1);
        const missResult = execute(missed, {
            type: "attack",
            actor: "victim",
            move: throwOff.id,
            targets: [],
        });
        expect(missResult.events).toEqual([{
            type: "moveUsed",
            actor: "victim",
            move: throwOff.id,
            targets: [],
        }]);
        expect(buffState(missed, pounce.id, "victim")).toBeDefined();
        expect(buffState(missed, pounce.id, "skunkette1")).toBeDefined();
        expect(enemyState(missed, "skunkette1").cooldowns[pounce.id]).toBe(1);

        const hit = setupPounce(18).engine;
        const hitResult = execute(hit, {
            type: "attack",
            actor: "victim",
            move: throwOff.id,
            targets: [],
        });
        expect(hitResult.events).toEqual([
            { type: "moveUsed", actor: "victim", move: throwOff.id, targets: [] },
            { type: "buffRemoved", target: "victim", buff: pounce.id },
            { type: "buffRemoved", target: "skunkette1", buff: pounce.id },
        ]);
        expect(buffState(hit, pounce.id, "victim")).toBeUndefined();
        expect(buffState(hit, pounce.id, "skunkette1")).toBeUndefined();
        expect(enemyState(hit, "skunkette1").cooldowns[pounce.id]).toBe(pounce.cooldown);
    });

    it("follows a Pounce with a dynamically selected Spray binding", () => {
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("hero"),
        ], [skunkette], 3);

        expect(enemyState(engine, "skunkette1").intention?.move).toBe(pounce.id);
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

    it("uses independent target rolls and one shared spread modifier for Latex Mist", () => {
        const mistEnemy: EnemyDef = {
            ...skunkette,
            id: "mist-skunkette",
            ai: (_state, actor) => ({
                actor,
                move: { definition: latexMist },
                targets: [],
            }),
        };
        const bindFirst = makeBehavioralMove("bind-first", "mouth", {
            target: "none",
            targets: 0,
            resolve: (state) => [{
                type: "binding",
                target: state.characters[0],
                binding: latexArms,
                amount: 10,
            }],
        });
        const bindSecond = makeBehavioralMove("bind-second", "mouth", {
            target: "none",
            targets: 0,
            resolve: (state) => [{
                type: "binding",
                target: state.characters[1],
                binding: latexHead,
                amount: 10,
            }],
        });
        const engine = makeBehavioralEngine([
            makeBehavioralCharacter("first", [bindFirst]),
            makeBehavioralCharacter("second", [bindSecond]),
        ], [mistEnemy], 3);
        execute(engine, { type: "attack", actor: "first", move: bindFirst.id, targets: [] });
        execute(engine, { type: "attack", actor: "second", move: bindSecond.id, targets: [] });

        const preview = enemyState(engine, "mist-skunkette1").intention;
        expect(preview?.move).toBe(latexMist.id);
        expect(preview?.targets.map(({ target, result }) => ({ target, result }))).toEqual([
            { target: "first", result: "miss" },
            { target: "second", result: "hit" },
        ]);

        execute(engine, { type: "endTurn" });
        expect(characterState(engine, "first").buffs[0]).toMatchObject({
            id: latexMist.id,
            modifiers: { spread: 1 },
            active: true,
            duration: 1,
        });
        expect(characterState(engine, "second").buffs[0]).toMatchObject({
            id: latexMist.id,
            modifiers: { spread: 1 },
            active: true,
            duration: 1,
        });
        expect(bindingState(engine, latexArms.id, "first")?.value).toBe(10);
        expect(bindingState(engine, latexHead.id, "second")?.value).toBeGreaterThan(10);
    });
});
