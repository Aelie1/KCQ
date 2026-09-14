import { describe, expect, it } from "vitest";
import { skunk } from "../src/content/skunk/skunk";
import {
    latexArms,
    latexHead,
    latexLegs,
    latexTorso,
} from "../src/content/skunk/latex";
import { trapPuddle } from "../src/content/skunk/puddles";
import { GameEngine } from "../src/engine/public/engine";
import type { iGameState } from "../src/engine/protected/types";
import type { EncounterDef } from "../src/engine/protected/definitions";
import type { BindingDef } from "../src/engine/protected/definitions";
import { makeBindingDef, makeCharacterDef } from "./helpers";

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
}): GameEngine {
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
            if (options.hp !== undefined) state.enemies[0].currHp = options.hp;
            addInitialBindings(state, options.bindings ?? {});
        },
    };
    const engine = new GameEngine([encounter], options.seed);
    for (const id of characterIds) engine.loadCharacter(makeCharacterDef(id));
    engine.loadEncounter(encounter.id);
    return engine;
}

function addInitialBindings(
    state: iGameState,
    byCharacter: Record<string, InitialBinding[]>,
) {
    for (const [characterId, bindings] of Object.entries(byCharacter)) {
        const character = state.characters.find(({ id }) => id === characterId);
        if (!character) throw new Error(`Missing setup character ${characterId}`);
        for (const { definition, value, peak = value } of bindings) {
            character.bindings.push({
                id: definition.id,
                definition,
                value,
                data: { ...definition.data, peak },
            });
        }
    }
}

function endTurn(engine: GameEngine) {
    const result = engine.executeAction({ type: "endTurn" });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected end turn success");
    return result;
}

describe("normal Latex Skunk", () => {
    it("loads its authored identity, stats, and a usable intention", () => {
        const engine = loadSkunk({ seed: 1 });
        const enemy = engine.getGameState().enemies[0];

        expect(skunk.id).toBe("skunk");
        expect(enemy).toMatchObject({
            id: "skunk1",
            maxHp: 300,
            currHp: 300,
            currDef: 0,
            intention: { move: "latexSpray" },
        });
        expect(enemy.intention?.targets).toHaveLength(1);
    });

    it("creates puddles with a no-target move using its accuracy effectiveness", () => {
        const engine = loadSkunk({ seed: 4096, trapAmount: 0 });
        const preview = engine.getGameState().enemies[0].intention;
        const previewEffect = preview?.effects.find((effect) => effect.type === "trap");

        expect(preview).toMatchObject({ move: "latexPuddle", targets: [] });
        expect(previewEffect).toEqual({ type: "trap", trap: trapPuddle.id, amount: 10 });

        const result = endTurn(engine);
        expect(result.events).toContainEqual({
            type: "trapAdded", actor: "skunk1", trap: trapPuddle.id, amount: 10,
        });
        expect(result.state.traps).toEqual([{ id: trapPuddle.id, amount: 10 }]);
    });

    it.each([
        [1, "miss", 0, 0],
        [132, "graze", 5, 13],
        [128, "hit", 20, 25],
        [141, "crit", 38, 50],
    ] as const)(
        "applies Spray effectiveness for a %s seed (%s)",
        (seed, band, minAmount, maxAmount) => {
            const engine = loadSkunk({ seed, trapAmount: 100 });
            const preview = engine.getGameState().enemies[0].intention;
            expect(preview?.move).toBe("latexSpray");
            expect(preview?.targets[0]?.band).toBe(band);

            const result = endTurn(engine);
            const bondage = result.events.find((event) => event.type === "bondageAdded");
            if (band === "miss") {
                expect(bondage).toBeUndefined();
                expect(result.state.characters[0].bindings).toEqual([]);
            } else {
                expect(bondage?.type).toBe("bondageAdded");
                if (bondage?.type !== "bondageAdded") throw new Error("Expected Spray bondage");
                expect(BODY_LATEX.map(({ id }) => id)).toContain(bondage.binding);
                expect(bondage.amount).toBeGreaterThanOrEqual(minAmount);
                expect(bondage.amount).toBeLessThanOrEqual(maxAmount);
            }
        },
    );

    it("prioritizes regeneration for the character with the most recoverable Latex", () => {
        const engine = loadSkunk({
            seed: 1,
            characterIds: ["first", "second"],
            bindings: {
                first: [{ definition: latexHead, value: 40, peak: 50 }],
                second: [{ definition: latexArms, value: 10, peak: 50 }],
            },
        });
        const intention = engine.getGameState().enemies[0].intention;

        expect(intention).toMatchObject({
            move: "latexRegeneration",
            targets: [{
                target: "second",
                band: "graze",
                effects: [{ type: "binding", binding: latexArms.id }],
            }],
        });

        const result = endTurn(engine);
        const first = result.state.characters.find(({ id }) => id === "first")!;
        const second = result.state.characters.find(({ id }) => id === "second")!;
        expect(first.bindings[0]).toMatchObject({ value: 40, data: { peak: 50 } });
        expect(second.bindings[0]).toMatchObject({ value: 18, data: { peak: 50 } });
        expect(result.events.filter((event) =>
            event.type.startsWith("bondage") && "binding" in event && event.binding === latexArms.id,
        )).toHaveLength(1);
    });

    it("restores only the selected binding to its peak on a Hit", () => {
        const engine = loadSkunk({
            seed: 2,
            bindings: {
                hero: [
                    { definition: latexHead, value: 20, peak: 50 },
                    { definition: latexArms, value: 30, peak: 30 },
                ],
            },
        });
        expect(engine.getGameState().enemies[0].intention).toMatchObject({
            move: "latexRegeneration",
            targets: [{ target: "hero", band: "hit" }],
        });

        const result = endTurn(engine);
        expect(result.state.characters[0].bindings).toEqual([
            expect.objectContaining({ id: latexHead.id, value: 50, data: { peak: 50 } }),
            expect.objectContaining({ id: latexArms.id, value: 30, data: { peak: 30 } }),
        ]);
    });

    it("restores every eligible partially escaped Latex binding on a Crit", () => {
        const engine = loadSkunk({
            seed: 135,
            bindings: {
                hero: [
                    { definition: latexHead, value: 10, peak: 30 },
                    { definition: latexArms, value: 20, peak: 50 },
                    { definition: latexTorso, value: 40, peak: 40 },
                ],
            },
        });
        expect(engine.getGameState().enemies[0].intention).toMatchObject({
            move: "latexRegeneration",
            targets: [{ target: "hero", band: "crit" }],
        });

        const result = endTurn(engine);
        expect(result.state.characters[0].bindings.map(({ id, value, data }) => ({ id, value, peak: data.peak })))
            .toEqual([
                { id: latexHead.id, value: 30, peak: 30 },
                { id: latexArms.id, value: 50, peak: 50 },
                { id: latexTorso.id, value: 40, peak: 40 },
            ]);
    });

    it("runs regenerated Latex through onAdd and can complete transformation", () => {
        const engine = loadSkunk({
            seed: 2,
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
        const hero = result.state.characters[0];
        expect(hero.bindings.find(({ id }) => id === latexHead.id)).toMatchObject({
            value: 80,
            data: { peak: 80 },
        });
        expect(hero.buffs).toContainEqual(expect.objectContaining({
            id: "skunked",
            linkedEntity: "skunketteHero",
            statuses: [{ id: "incapacitated", value: 1 }],
        }));
        expect(result.state.enemies.map(({ id }) => id)).toContain("skunketteHero");
    });

    it("does not regenerate when no Latex has a recoverable peak", () => {
        const engine = loadSkunk({ seed: 1 });
        expect(engine.getGameState().enemies[0].intention?.move).toBe("latexSpray");
    });

    it("leaves recoverable Latex unchanged when Regeneration misses", () => {
        const engine = loadSkunk({
            seed: 3,
            bindings: { hero: [{ definition: latexHead, value: 20, peak: 50 }] },
        });
        expect(engine.getGameState().enemies[0].intention).toMatchObject({
            move: "latexRegeneration",
            targets: [{ target: "hero", band: "miss", effects: [] }],
        });

        const result = endTurn(engine);
        expect(result.state.characters[0].bindings[0]).toMatchObject({
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

        expect(engine.getGameState().enemies[0].intention).toMatchObject({
            move: "latexExplosion",
            targets: [{ target: "moreBound" }],
        });
    });

    it("falls back to a valid character for low-HP Explosion when nobody is bound", () => {
        const engine = loadSkunk({
            seed: 1,
            hp: 60,
            characterIds: ["first", "second"],
        });
        expect(engine.getGameState().enemies[0].intention).toMatchObject({
            move: "latexExplosion",
            targets: [{ target: "first" }],
        });
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
            expect(engine.getGameState().enemies[0].intention).toMatchObject({
                move: "latexExplosion",
                targets: [{ target: "hero", band: "miss", effects: [] }],
            });

            const result = endTurn(engine);
            expect(result.state.enemies.some(({ id }) => id === "skunk1")).toBe(false);
            expect(result.events).toContainEqual({
                type: "enemyDefeated", target: "skunk1",
            });
            if (withTrap) {
                expect(result.state.traps).toEqual([{ id: trapPuddle.id, amount: 25 }]);
            } else {
                expect(result.state.traps).toEqual([]);
            }
        },
    );

    it("applies all four Latex bindings and kills the Skunk on a non-Crit Explosion hit", () => {
        const rope = makeBindingDef("rope");
        const engine = loadSkunk({
            seed: 51,
            hp: 60,
            bindings: { hero: [{ definition: rope, value: 1 }] },
        });
        expect(engine.getGameState().enemies[0].intention).toMatchObject({
            move: "latexExplosion",
            targets: [{ target: "hero", band: "hit" }],
        });

        const result = endTurn(engine);
        expect(result.state.enemies.some(({ id }) => id === "skunk1")).toBe(false);
        expect(BODY_LATEX.map(({ id }) => id)).toEqual(
            result.state.characters[0].bindings.slice(1).map(({ id }) => id),
        );
    });

    it("applies all four bindings and heals instead of dying on a Crit Explosion", () => {
        const rope = makeBindingDef("rope");
        const engine = loadSkunk({
            seed: 62,
            hp: 60,
            bindings: { hero: [{ definition: rope, value: 1 }] },
        });
        expect(engine.getGameState().enemies[0].intention).toMatchObject({
            move: "latexExplosion",
            targets: [{ target: "hero", band: "crit" }],
        });

        const result = endTurn(engine);
        expect(result.state.enemies.find(({ id }) => id === "skunk1")).toMatchObject({ currHp: 120 });
        expect(result.events).toContainEqual({
            type: "enemyDamaged", target: "skunk1", amount: -60,
        });
        expect(BODY_LATEX.map(({ id }) => id)).toEqual(
            result.state.characters[0].bindings.slice(1).map(({ id }) => id),
        );
    });
});
