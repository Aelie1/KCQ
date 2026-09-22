import { describe, expect, it } from "vitest";
import { latexArms, latexHead, latexLegs, latexTorso } from "../../src/content/skunk/latex";
import { trapPuddle } from "../../src/content/skunk/puddles";
import { skunk } from "../../src/content/skunk/skunk";
import type { BindingDef, EncounterDef, MoveDef } from "../../src/engine/protected/definitions";
import { createCustomEngine } from "../../src/engine/protected/engine";
import { isEnemy } from "../../src/engine/protected/helpers";
import type { iEffect, iGameState } from "../../src/engine/protected/types";
import type { Engine } from "../../src/engine/public/types";
import { makeBindingDef, makeCharacterDef, makeMove } from "../helpers/helpers";

const BODY_LATEX = [latexHead, latexArms, latexTorso, latexLegs];

type InitialBinding = {
    definition: BindingDef;
    value: number;
    peak?: number;
};

function loadSkunk(options: {
    seed: number;
    characterIds?: string[];
    trapAmount?: number | null;
    hp?: number;
    bindings?: Record<string, InitialBinding[]>;
    moves?: MoveDef[];
}): Engine {
    const characterIds = options.characterIds ?? ["hero"];
    const encounter: EncounterDef = {
        id: "skunk-test",
        enemies: [skunk],
        bindings: BODY_LATEX,
        traps: options.trapAmount === null ? [] : [{
            definition: trapPuddle,
            amount: options.trapAmount ?? 100,
        }],
        setup: (state) => {
            const effects: iEffect[] = [];
            if (options.hp !== undefined) {
                state.enemies[0].currHp = options.hp;
            }
            effects.push(...initialBindingEffects(state, options.bindings ?? {}));
            return effects;
        },
    };
    const characters = characterIds.map((id) => makeCharacterDef(id, options.moves));
    const engine = createCustomEngine([encounter], characters, options.seed);
    for (const character of characters) engine.loadCharacter(character.id);
    engine.loadEncounter(encounter.id);
    return engine;
}

function initialBindingEffects(
    state: iGameState,
    byCharacter: Record<string, InitialBinding[]>,
): iEffect[] {
    const effects: iEffect[] = [];
    for (const [characterId, bindings] of Object.entries(byCharacter)) {
        const character = state.characters.find(({ id }) => id === characterId);
        if (!character) throw new Error(`Missing setup character ${characterId}`);
        for (const { definition, value, peak = value } of bindings) {
            effects.push({
                type: "binding",
                source: character,
                target: character,
                binding: definition,
                amount: peak,
            });
            if (value < peak) {
                effects.push({
                    type: "binding",
                    source: character,
                    target: character,
                    binding: definition,
                    amount: value - peak,
                });
            }
        }
    }
    return effects;
}

function endTurn(engine: Engine) {
    const result = engine.executeAction({ type: "endTurn" });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected end turn success");
    return result;
}

describe("normal Latex Skunk", () => {
    it("loads its authored identity, stats, and a usable intention", () => {
        const engine = loadSkunk({ seed: 1 });
        const enemy = engine.getGameView().enemies[0];

        expect(skunk.id).toBe("skunk");
        expect(enemy).toMatchObject({
            id: "skunk1",
            maxHp: 300,
            currHp: 300,
            currDef: 0,
            intentions: [{ move: "latexSpray" }],
        });
        expect(enemy.intentions[0]?.targets).toHaveLength(1);
    });

    it("creates puddles with a no-target move using its accuracy effectiveness", () => {
        const engine = loadSkunk({ seed: 16, trapAmount: 0 });
        const preview = engine.getGameView().enemies[0].intentions[0];
        const previewEffect = preview?.effects.find((effect) => effect.type === "trap");

        expect(preview).toMatchObject({ move: "latexPuddle", targets: [] });
        expect(previewEffect).toMatchObject({ type: "trap", trap: trapPuddle.id });
        if (!previewEffect || previewEffect.type !== "trap") throw new Error("Expected Puddle trap effect");
        expect(previewEffect.amount).toBeGreaterThan(0);

        const result = endTurn(engine);
        expect(result.events).toContainEqual({
            type: "trapAdded", actor: "skunk1", trap: trapPuddle.id, amount: previewEffect.amount,
        });
        expect(result.view.traps).toEqual([{ id: trapPuddle.id, amount: previewEffect.amount }]);
    });

    it.each([
        [1, "miss"],
        [4, "graze"],
        [2, "hit"],
        [36, "crit"],
    ] as const)(
        "applies Spray effectiveness for a %s seed (%s)",
        (seed, band) => {
            const engine = loadSkunk({ seed, trapAmount: 100 });
            const preview = engine.getGameView().enemies[0].intentions[0];
            expect(preview?.move).toBe("latexSpray");
            expect(preview?.targets[0]?.band).toBe(band);
            const previewBinding = preview?.targets[0]?.effects.find(
                (effect) => effect.type === "binding",
            );

            const result = endTurn(engine);
            const bondage = result.events.find((event) => event.type === "bondageAdded");
            if (band === "miss") {
                expect(previewBinding).toBeUndefined();
                expect(bondage).toBeUndefined();
                expect(result.view.characters[0].bindings).toEqual([]);
            } else {
                expect(previewBinding?.type).toBe("binding");
                if (!previewBinding || previewBinding.type !== "binding" || previewBinding.amount === undefined) {
                    throw new Error("Expected Spray binding preview");
                }
                expect(previewBinding.amount).toBeGreaterThan(0);
                expect(bondage?.type).toBe("bondageAdded");
                if (bondage?.type !== "bondageAdded") throw new Error("Expected Spray bondage");
                expect(BODY_LATEX.map(({ id }) => id)).toContain(bondage.binding);
                expect(bondage.binding).toBe(previewBinding.binding);
                expect(bondage.amount).toBe(previewBinding.amount);
            }
        },
    );

    it("scales Spray bondage upward from Graze through Hit and Crit", () => {
        const amountForSeed = (seed: number): number => {
            const preview = loadSkunk({ seed, trapAmount: 100 })
                .getGameView().enemies[0].intentions[0];
            const effect = preview?.targets[0]?.effects.find(
                (candidate) => candidate.type === "binding",
            );
            if (!effect || effect.type !== "binding" || effect.amount === undefined) {
                throw new Error(`Expected Spray binding preview for seed ${seed}`);
            }
            return effect.amount;
        };

        const graze = amountForSeed(4);
        const hit = amountForSeed(2);
        const crit = amountForSeed(36);
        expect(hit).toBeGreaterThan(graze);
        expect(crit).toBeGreaterThan(hit);
    });

    it("prioritizes regeneration for the character with the most recoverable Latex", () => {
        const engine = loadSkunk({
            seed: 9,
            characterIds: ["first", "second"],
            bindings: {
                first: [{ definition: latexHead, value: 40, peak: 50 }],
                second: [{ definition: latexArms, value: 10, peak: 50 }],
            },
        });
        const intention = engine.getGameView().enemies[0].intentions[0];

        expect(intention).toMatchObject({
            move: "latexRegeneration",
            targets: [{
                target: "second",
                band: "graze",
                effects: [{ type: "binding", binding: latexArms.id }],
            }],
        });

        const result = endTurn(engine);
        const first = result.view.characters.find(({ id }) => id === "first")!;
        const second = result.view.characters.find(({ id }) => id === "second")!;
        const previewBinding = intention.targets[0]?.effects.find(
            (effect) => effect.type === "binding" && effect.binding === latexArms.id,
        );
        if (!previewBinding || previewBinding.type !== "binding" || previewBinding.amount === undefined) {
            throw new Error("Expected Regeneration binding preview");
        }
        expect(first.bindings[0]).toMatchObject({ value: 40, data: { peak: 50 } });
        expect(second.bindings[0]).toMatchObject({
            value: 10 + previewBinding.amount,
            data: { peak: 50 },
        });
        expect(result.events.filter((event) =>
            event.type.startsWith("bondage") && "binding" in event && event.binding === latexArms.id,
        )).toHaveLength(1);
    });

    it("restores only the selected binding to its peak on a Hit", () => {
        const engine = loadSkunk({
            seed: 81,
            bindings: {
                hero: [
                    { definition: latexHead, value: 20, peak: 50 },
                    { definition: latexArms, value: 30, peak: 30 },
                ],
            },
        });
        expect(engine.getGameView().enemies[0].intentions).toMatchObject([{
            move: "latexRegeneration",
            targets: [{ target: "hero", band: "hit" }],
        }]);

        const result = endTurn(engine);
        expect(result.view.characters[0].bindings).toEqual([
            expect.objectContaining({ id: latexHead.id, value: 50, data: { peak: 50 } }),
            expect.objectContaining({ id: latexArms.id, value: 30, data: { peak: 30 } }),
        ]);
    });

    it("restores every eligible partially escaped Latex binding on a Crit", () => {
        const engine = loadSkunk({
            seed: 199,
            bindings: {
                hero: [
                    { definition: latexHead, value: 10, peak: 30 },
                    { definition: latexArms, value: 20, peak: 50 },
                    { definition: latexTorso, value: 40, peak: 40 },
                ],
            },
        });
        expect(engine.getGameView().enemies[0].intentions).toMatchObject([{
            move: "latexRegeneration",
            targets: [{ target: "hero", band: "crit" }],
        }]);

        const result = endTurn(engine);
        expect(result.view.characters[0].bindings.map(({ id, value, data }) => ({ id, value, peak: data.peak })))
            .toEqual([
                { id: latexHead.id, value: 30, peak: 30 },
                { id: latexArms.id, value: 50, peak: 50 },
                { id: latexTorso.id, value: 40, peak: 40 },
            ]);
    });

    it("runs regenerated Latex through onAdd and can complete transformation", () => {
        const engine = loadSkunk({
            seed: 81,
            bindings: {
                hero: [
                    { definition: latexHead, value: 70, peak: 80 },
                    { definition: latexArms, value: 80, peak: 80 },
                    { definition: latexTorso, value: 80, peak: 80 },
                    { definition: latexLegs, value: 80, peak: 80 },
                ],
            },
        });

        const result = endTurn(engine);
        const hero = result.view.characters[0];
        expect(hero.bindings.find(({ id }) => id === latexHead.id)).toMatchObject({
            value: 80,
            data: { peak: 80 },
        });
        expect(hero.buffs).toContainEqual(expect.objectContaining({
            id: "skunked",
            linkedEntity: "skunketteHero",
            statuses: [{ id: "incapacitated", value: 1 }],
        }));
        expect(result.view.enemies.map(({ id }) => id)).toContain("skunketteHero");
    });

    it("does not regenerate when no Latex has a recoverable peak", () => {
        const engine = loadSkunk({ seed: 1 });
        expect(engine.getGameView().enemies[0].intentions[0]?.move).toBe("latexSpray");
    });

    it("leaves recoverable Latex unchanged when Regeneration misses", () => {
        const engine = loadSkunk({
            seed: 16,
            bindings: { hero: [{ definition: latexHead, value: 20, peak: 50 }] },
        });
        expect(engine.getGameView().enemies[0].intentions).toMatchObject([{
            move: "latexRegeneration",
            targets: [{ target: "hero", band: "miss", effects: [] }],
        }]);

        const result = endTurn(engine);
        expect(result.view.characters[0].bindings[0]).toMatchObject({
            value: 20, data: { peak: 50 },
        });
    });

    it("gives low-HP Explosion top priority and targets greatest total bondage", () => {
        const rope = makeBindingDef("rope");
        const engine = loadSkunk({
            seed: 1,
            hp: 60,
            characterIds: ["lessBound", "moreBound"],
            bindings: {
                lessBound: [{ definition: rope, value: 10 }],
                moreBound: [{ definition: rope, value: 30 }],
            },
        });

        expect(engine.getGameView().enemies[0].intentions).toMatchObject([{
            move: "latexExplosion",
            targets: [{ target: "moreBound" }],
        }]);
    });

    it("falls back to a valid character for low-HP Explosion when nobody is bound", () => {
        const engine = loadSkunk({
            seed: 1,
            hp: 60,
            characterIds: ["first", "second"],
        });
        expect(engine.getGameView().enemies[0].intentions).toMatchObject([{
            move: "latexExplosion",
            targets: [{ target: "first" }],
        }]);
    });

    it("cancels its old intention and targets the threshold-crossing attacker with Explosion", () => {
        const crossThreshold = makeMove("cross-threshold", "arms", {
            resolve: (_state, actor, _move, targets) => targets.flatMap(({ target }) =>
                isEnemy(target)
                    ? [{ type: "damage" as const, source: actor, target, amount: 2 }]
                    : [],
            ),
        });
        const engine = loadSkunk({
            seed: 1,
            hp: 76,
            characterIds: ["alpha", "beta"],
            moves: [crossThreshold],
        });
        const oldIntention = engine.getGameView().enemies[0].intentions[0];
        expect(oldIntention).toMatchObject({
            move: "latexSpray",
            targets: [{ target: expect.any(String) }],
        });
        const oldTarget = oldIntention.targets[0]?.target;
        const attacker = oldTarget === "alpha" ? "beta" : "alpha";

        const result = engine.executeAction({
            type: "move",
            actor: attacker,
            move: crossThreshold.id,
            targets: ["skunk1"],
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected threshold-crossing attack to succeed");
        expect(result.events).toContainEqual({ type: "intentionCancelled", target: "skunk1" });
        expect(result.view.enemies[0]).toMatchObject({
            currHp: 74,
            intentions: [{
                move: "latexExplosion",
                targets: [{ target: attacker }],
            }],
        });
        expect(result.view.enemies[0].intentions).toHaveLength(1);
    });

    it.each([true, false])(
        "kills the Skunk cleanly on an Explosion miss when puddles are %s",
        (withTrap) => {
            const rope = makeBindingDef("rope");
            const engine = loadSkunk({
                seed: 1,
                hp: 60,
                trapAmount: withTrap ? 0 : null,
                bindings: { hero: [{ definition: rope, value: 1 }] },
            });
            const intention = engine.getGameView().enemies[0].intentions[0];
            expect(intention).toMatchObject({
                move: "latexExplosion",
                targets: [{ target: "hero", band: "miss", effects: [] }],
            });
            const trapEffect = intention.effects.find((effect) => effect.type === "trap");

            const result = endTurn(engine);
            expect(result.view.enemies.some(({ id }) => id === "skunk1")).toBe(false);
            expect(result.events).toContainEqual({
                type: "enemyDefeated", target: "skunk1",
            });
            if (withTrap) {
                expect(trapEffect?.type).toBe("trap");
                if (!trapEffect || trapEffect.type !== "trap") {
                    throw new Error("Expected Explosion trap effect");
                }
                expect(trapEffect.amount).toBeGreaterThan(0);
                expect(result.view.traps).toEqual([{ id: trapPuddle.id, amount: trapEffect.amount }]);
            } else {
                expect(trapEffect).toBeUndefined();
                expect(result.view.traps).toEqual([]);
            }
        },
    );

    it("applies all four Latex bindings and kills the Skunk on a non-Crit Explosion hit", () => {
        const rope = makeBindingDef("rope");
        const engine = loadSkunk({
            seed: 2,
            hp: 60,
            bindings: { hero: [{ definition: rope, value: 1 }] },
        });
        expect(engine.getGameView().enemies[0].intentions).toMatchObject([{
            move: "latexExplosion",
            targets: [{ target: "hero", band: "hit" }],
        }]);

        const result = endTurn(engine);
        expect(result.view.enemies.some(({ id }) => id === "skunk1")).toBe(false);
        expect(BODY_LATEX.map(({ id }) => id)).toEqual(
            result.view.characters[0].bindings.slice(1).map(({ id }) => id),
        );
    });

    it("applies all four bindings and heals instead of dying on a Crit Explosion", () => {
        const rope = makeBindingDef("rope");
        const engine = loadSkunk({
            seed: 36,
            hp: 60,
            bindings: { hero: [{ definition: rope, value: 1 }] },
        });
        expect(engine.getGameView().enemies[0].intentions).toMatchObject([{
            move: "latexExplosion",
            targets: [{ target: "hero", band: "crit" }],
        }]);

        const result = endTurn(engine);
        expect(result.view.enemies.find(({ id }) => id === "skunk1")).toMatchObject({ currHp: 120 });
        expect(result.events).toContainEqual({
            type: "enemyHealed", target: "skunk1", amount: 60,
        });
        expect(BODY_LATEX.map(({ id }) => id)).toEqual(
            result.view.characters[0].bindings.slice(1).map(({ id }) => id),
        );
    });
});
