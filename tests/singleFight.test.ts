import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createEngine } from "../src/engine/public/engine";
import { runSingleFight } from "../src/harness/singleFight";

function stockEncounterId(): string {
    const encounterId = createEngine(1).listEncounters()[0];
    if (!encounterId) {
        throw new Error("The stock encounter catalogue is empty");
    }
    return encounterId;
}

describe("deterministic single-fight runner", () => {
    it("autonomously completes a real discovered encounter", () => {
        const result = runSingleFight({
            encounterId: stockEncounterId(),
            engineSeed: 12345,
            maxActions: 1_000,
        });

        expect(["victory", "defeat"]).toContain(result.termination);
        expect(result.finalState.turn.outcome).toBe(result.termination);
        expect(result.actionCount).toBe(result.trace.length);
        expect(result.actionCount).toBeGreaterThan(0);
    });

    it("replays the same real fight exactly for the same inputs", () => {
        const input = {
            encounterId: stockEncounterId(),
            engineSeed: 24680,
            maxActions: 1_000,
        };

        expect(runSingleFight(input)).toEqual(runSingleFight(input));
    });

    it.each([1, 2, 3, 0xffffffff])(
        "terminates cleanly for engine seed %s",
        (engineSeed) => {
            const result = runSingleFight({
                encounterId: stockEncounterId(),
                engineSeed,
                maxActions: 300,
            });

            expect(["victory", "defeat", "maxActions"]).toContain(result.termination);
            expect(result.error).toBeUndefined();
        },
    );

    it("uses an explicit safety-limit termination before exceeding maxActions", () => {
        const result = runSingleFight({
            encounterId: stockEncounterId(),
            engineSeed: 7,
            maxActions: 0,
        });

        expect(result.termination).toBe("maxActions");
        expect(result.finalState.turn.outcome).toBe("ongoing");
        expect(result.actionCount).toBe(0);
        expect(result.trace).toEqual([]);
    });

    it("returns a structured error for an encounter absent from the public catalogue", () => {
        const result = runSingleFight({
            encounterId: "not-a-stock-encounter",
            engineSeed: 1,
            maxActions: 10,
        });

        expect(result).toMatchObject({
            encounterId: "not-a-stock-encounter",
            engineSeed: 1,
            termination: "error",
            actionCount: 0,
            trace: [],
            error: { message: "Unknown encounter ID: not-a-stock-encounter" },
        });
    });

    it("discovers characters and encounters through the public engine API", () => {
        const source = readFileSync(
            resolve(process.cwd(), "src/harness/singleFight.ts"),
            "utf8",
        );

        expect(source).toContain("engine.listCharacters()");
        expect(source).toContain("engine.loadCharacter(id)");
        expect(source).toContain("engine.listEncounters()");
        expect(source).toContain("engine.loadEncounter(input.encounterId)");
        expect(source).not.toMatch(/\b(?:ko|matsuko|hinari)\b/);
    });

    it("keeps harness production imports behind the public engine boundary", () => {
        const harnessDirectory = resolve(process.cwd(), "src/harness");
        const sources = readdirSync(harnessDirectory, { recursive: true })
            .filter((entry) => entry.toString().endsWith(".ts"))
            .map((entry) => readFileSync(resolve(harnessDirectory, entry.toString()), "utf8"));
        const imports = sources.flatMap((source) =>
            [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]),
        );
        const productionImports = imports.filter((specifier) => specifier.startsWith(".."));

        expect(productionImports.length).toBeGreaterThan(0);
        expect(productionImports.every((specifier) => specifier.includes("engine/public/")))
            .toBe(true);
        expect(sources.join("\n")).not.toMatch(
            /(?:content|console|engine\/(?:private|protected))\//,
        );
    });
});
