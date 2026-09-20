import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import {
    deriveRunSeeds,
    runBatch,
} from "../../src/harness/batch";
import { runSingleFight } from "../../src/harness/harness";
import { firstPolicy } from "../../src/harness/policy/first";

function stockEncounterId(): string {
    const encounterId = createEngine(1).listEncounters()[0];
    if (!encounterId) {
        throw new Error("The stock encounter catalogue is empty");
    }
    return encounterId;
}

describe("batch harness", () => {
    it("locks deterministic engine and policy seed allocation", () => {
        expect(deriveRunSeeds(0, 0)).toEqual({
            engineSeed: 1001238326,
            policySeed: 1374832201,
        });
        expect(deriveRunSeeds(123456789, 0)).toEqual({
            engineSeed: 252023243,
            policySeed: 1964667339,
        });
        expect(deriveRunSeeds(123456789, 1)).toEqual({
            engineSeed: 1882599659,
            policySeed: 2888711279,
        });
        expect(deriveRunSeeds(-123456789, 42)).toEqual({
            engineSeed: 3500777660,
            policySeed: 1865937615,
        });
    });

    it("derives each index directly and independently of lookup order", () => {
        const ascending = [0, 1, 2, 3, 4].map((runIndex) => ({
            runIndex,
            seeds: deriveRunSeeds(987654321, runIndex),
        }));
        const descending = [4, 3, 2, 1, 0].map((runIndex) => ({
            runIndex,
            seeds: deriveRunSeeds(987654321, runIndex),
        })).reverse();

        expect(descending).toEqual(ascending);
        expect(new Set(ascending.map(({ seeds }) => seeds.engineSeed)).size).toBe(5);
        expect(new Set(ascending.map(({ seeds }) => seeds.policySeed)).size).toBe(5);
        expect(ascending.every(({ seeds }) => seeds.engineSeed !== seeds.policySeed)).toBe(true);
    });

    it("runs every index through the single-fight behavior with its assigned seeds", () => {
        const input = {
            encounterId: stockEncounterId(),
            policy: firstPolicy,
            masterSeed: 24680,
            runs: 3,
            maxActions: 2,
            replay: true,
        };

        const batch = runBatch(input);

        expect(batch).toMatchObject({
            encounterId: input.encounterId,
            policyId: firstPolicy.id,
            masterSeed: input.masterSeed,
        });
        expect(batch.runs).toHaveLength(input.runs);
        batch.runs.forEach((run, runIndex) => {
            const seeds = deriveRunSeeds(input.masterSeed, runIndex);
            expect(run).toEqual({
                runIndex,
                ...seeds,
                result: runSingleFight({
                    encounterId: input.encounterId,
                    policy: input.policy,
                    maxActions: input.maxActions,
                    replay: input.replay,
                    ...seeds,
                }),
            });
            expect(run.result.replay).toBeDefined();
        });
    });

    it("returns an empty factual result for a zero-run batch", () => {
        expect(runBatch({
            encounterId: "unused",
            policy: firstPolicy,
            masterSeed: 1,
            runs: 0,
            maxActions: 10,
        })).toEqual({
            encounterId: "unused",
            policyId: firstPolicy.id,
            masterSeed: 1,
            runs: [],
        });
    });

    it("reports each completed run with the stable total", () => {
        const updates: Array<[number, number]> = [];
        runBatch({
            encounterId: stockEncounterId(),
            policy: firstPolicy,
            masterSeed: 1,
            runs: 3,
            maxActions: 1,
        }, { onProgress: (completed, total) => updates.push([completed, total]) });

        expect(updates).toEqual([[1, 3], [2, 3], [3, 3]]);
    });

    it("keeps deterministic results identical with and without a progress callback", () => {
        const input = {
            encounterId: stockEncounterId(),
            policy: firstPolicy,
            masterSeed: 456,
            runs: 4,
            maxActions: 5,
        };

        expect(runBatch(input, { onProgress: () => {} })).toEqual(runBatch(input));
    });

    it.each([
        [Number.NaN, 0, "masterSeed"],
        [1.5, 0, "masterSeed"],
        [1, -1, "runIndex"],
        [1, 1.5, "runIndex"],
    ])("rejects invalid seed derivation input (%s, %s)", (masterSeed, runIndex, name) => {
        expect(() => deriveRunSeeds(masterSeed, runIndex)).toThrow(
            new RegExp(`${name} must`),
        );
    });

    it.each([-1, 1.5, Number.POSITIVE_INFINITY])(
        "rejects an invalid run count of %s",
        (runs) => {
            expect(() => runBatch({
                encounterId: "unused",
                policy: firstPolicy,
                masterSeed: 1,
                runs,
                maxActions: 10,
            })).toThrow(/runs must/);
        },
    );
});
