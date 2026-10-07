import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import { difficulties } from "../../src/engine/private/constants";

describe("public difficulty references", () => {
    it("exposes all five authoritative definitions as structured-cloneable metadata", () => {
        const references = createEngine().getLibrary().difficulties;
        expect(Object.keys(references)).toEqual(["casual", "standard", "veteran", "extreme", "mythic"]);
        expect(references).toEqual(difficulties);
        expect(structuredClone(references)).toEqual(references);
        expect(references.casual).toEqual({
            id: "casual", playerModifiers: { hit: 2, escape: 2 }, enemyModifiers: {},
        });
        expect(references.standard).toEqual({
            id: "standard", playerModifiers: {}, enemyModifiers: {},
        });
        for (const id of ["veteran", "extreme", "mythic"] as const) {
            expect(references[id]).toEqual({ id, playerModifiers: {}, enemyModifiers: { potency: 2 } });
        }
    });

    it("isolates every public modifier set from authoritative definitions and subsequent reads", () => {
        const engine = createEngine();
        const references = engine.getLibrary().difficulties;
        for (const id of Object.keys(references) as (keyof typeof references)[]) {
            expect(references[id]).not.toBe(difficulties[id]);
            expect(references[id].playerModifiers).not.toBe(difficulties[id].playerModifiers);
            expect(references[id].enemyModifiers).not.toBe(difficulties[id].enemyModifiers);
            references[id].playerModifiers.hit = 99;
            references[id].enemyModifiers.potency = 99;
        }
        expect(engine.getLibrary().difficulties).toEqual(difficulties);
        expect(engine.getLibrary().difficulties.casual.playerModifiers).toEqual({ hit: 2, escape: 2 });
        expect(engine.getGameState().difficulty.playerModifiers).toEqual({});
        engine.setDifficulty("casual");
        expect(engine.getGameState().difficulty.playerModifiers).toEqual({ hit: 2, escape: 2 });
        engine.setDifficulty("mythic");
        expect(engine.getGameState().difficulty.enemyModifiers).toEqual({ potency: 2 });
    });
});
