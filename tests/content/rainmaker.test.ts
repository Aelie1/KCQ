import { describe, expect, it } from "vitest";
import { latexArms, latexHead, latexLegs, latexTorso } from "../../src/content/skunk/latex";
import { trapPuddle } from "../../src/content/skunk/puddles";
import { rainmaker } from "../../src/content/skunk/rainmaker";
import type { BindingDef, EncounterDef } from "../../src/engine/protected/definitions";
import { isEnemy } from "../../src/engine/protected/helpers";
import { incapacitated } from "../../src/engine/protected/statuses";
import type { iEffect } from "../../src/engine/protected/types";
import type { DifficultyId, Engine } from "../../src/engine/public/types";
import {
    characterState,
    execute,
    makeBehavioralCharacter,
    makeBehavioralMove,
} from "../helpers/behavioralHelpers";
import { createTestEngine } from "../helpers/testCatalog";
import { makeEncounterDef } from "../helpers/helpers";

function loadRainmaker(
    seed: number,
    characterIds = ["hero"],
    setup?: EncounterDef["setup"],
    bindings: BindingDef[] = [],
): Engine {
    const encounter = makeEncounterDef("rainmaker-test", {
        enemies: [rainmaker.id],
        bindings,
        setup,
    });
    const characters = characterIds.map((id) => makeBehavioralCharacter(id));
    const engine = createTestEngine([encounter], characters, seed, { enemies: [rainmaker] });
    for (const character of characters) engine.loadCharacter(character.id);
    engine.loadEncounter(encounter.id);
    return engine;
}

describe("Rainmaker Latex Rain", () => {
    it.each([
        [1, "miss", []],
        [4, "graze", [latexTorso.id, latexLegs.id]],
        [2, "hit", [latexLegs.id, latexHead.id, latexArms.id]],
        [36, "crit", [latexTorso.id, latexLegs.id, latexHead.id, latexArms.id]],
    ] as const)(
        "applies the authored number and circular ordering of bindings on a %s band",
        (seed, band, expectedBindings) => {
            const engine = loadRainmaker(seed);
            const intention = engine.getGameState().enemies[0].intentions[0];

            expect(intention).toMatchObject({
                move: "latexRain",
                targets: [{ target: "hero", band }],
            });
            expect(intention.targets[0].effects
                .filter((effect) => effect.type === "binding")
                .map((effect) => effect.binding))
                .toEqual(expectedBindings);

            const result = execute(engine, { type: "endTurn" });
            const rain = result.frames.find(({ event }) =>
                event.type === "useMove" && event.actor === "rainmaker1");
            expect(rain?.event).toMatchObject({
                type: "useMove",
                actor: "rainmaker1",
                move: "latexRain",
                targets: [{ target: "hero", result: band }],
            });
            expect(characterState(engine).bindings.map(({ id }) => id))
                .toEqual(expectedBindings);
        },
    );

    it("resolves independent all-party rolls without giving missed targets another character's bindings", () => {
        const engine = loadRainmaker(1, ["first", "second"]);
        const intention = engine.getGameState().enemies[0].intentions[0];

        expect(intention.targets.map(({ target, band }) => ({ target, band }))).toEqual([
            { target: "first", band: "miss" },
            { target: "second", band: "hit" },
        ]);
        expect(intention.targets[0].effects).toEqual([]);
        expect(intention.targets[1].effects.filter((effect) => effect.type === "binding"))
            .toHaveLength(3);

        execute(engine, { type: "endTurn" });
        expect(characterState(engine, "first").bindings).toEqual([]);
        expect(characterState(engine, "second").bindings.map(({ id }) => id)).toEqual([
            latexArms.id,
            latexTorso.id,
            latexLegs.id,
        ]);
    });

    it("excludes a character incapacitated during encounter setup from its committed all-party intention", () => {
        const restraint: BindingDef = {
            id: "incapacitating-restraint",
            status: { light: [{ definition: incapacitated, value: 1 }] },
        };
        const setup: EncounterDef["setup"] = (state): iEffect[] => [{
            type: "binding",
            source: state.characters[1],
            target: state.characters[1],
            binding: restraint,
            amount: 10,
        }];
        const engine = loadRainmaker(2, ["active", "down"], setup, [restraint]);

        expect(engine.getGameState().enemies[0].intentions[0].targets.map(({ target }) => target))
            .toEqual(["active"]);
        expect(engine.getGameState().characters.find(({ id }) => id === "down"))
            .toMatchObject({ bindings: [expect.objectContaining({ id: restraint.id })] });
    });

    it.each([
        ["standard", 0],
        ["extreme", 50],
        ["mythic", 100],
    ] as const)("on %s creates a puddle of %s on death", (difficulty: DifficultyId, amount) => {
        const defeat = makeBehavioralMove("defeat-rainmaker", "arms", {
            freeOnHit: true,
            resolve: (_state, actor, _move, targets) => targets.flatMap(({ target }) =>
                isEnemy(target) ? [{
                    type: "damage" as const,
                    source: actor,
                    target,
                    amount: rainmaker.hp,
                }] : [],
            ),
        });
        const encounter = makeEncounterDef("rainmaker-defeat-test", {
            enemies: [rainmaker.id],
            traps: [{ definition: trapPuddle, amount: 0 }],
        });
        const hero = makeBehavioralCharacter("hero", [defeat]);
        const engine = createTestEngine([encounter], [hero], 1, { enemies: [rainmaker] });
        engine.setDifficulty(difficulty);
        engine.loadCharacter(hero.id);
        engine.loadEncounter(encounter.id);

        execute(engine, {
            type: "move",
            actor: hero.id,
            move: defeat.id,
            targets: ["rainmaker1"],
        });

        expect(engine.getGameState().traps).toEqual([{ id: trapPuddle.id, amount }]);
    });
});
