import { describe, expect, it, vi } from "vitest";
import type { ConsoleReplayInput } from "../../src/console/replay";
import type { BatchResult } from "../../src/harness/batch/batch";
import {
    encounterSets,
    executeEncounterSet,
} from "../../src/harness/batch/encounter-sets";
import { runSingleFight } from "../../src/harness/harness";
import {
    launcherDefaults,
    parseIntegerPrompt,
    resolveMultipleChoices,
    resolveNumberedChoice,
    runHarnessLauncher,
    type LauncherIO,
} from "../../src/harness/cli/launcher";
import { policies } from "../../src/harness/policies";
import { firstPolicy } from "../../src/harness/policy/first";

describe("interactive launcher helpers", () => {
    it("defines the named encounter sets as extensible data", () => {
        expect(encounterSets).toEqual({
            n123: ["plains_1", "plains_2", "plains_3"],
            h123: ["forest_1", "forest_2", "forest_3"],
            all6: ["plains_1", "plains_2", "plains_3", "forest_1", "forest_2", "forest_3"],
        });
    });

    it("accepts blank defaults and validates integer prompts", () => {
        expect(parseIntegerPrompt("", "Runs", { defaultValue: launcherDefaults.runs, positive: true }))
            .toBe(1_000);
        expect(parseIntegerPrompt(" -7 ", "Seed")).toBe(-7);
        expect(parseIntegerPrompt("", "Parallel workers", {
            defaultValue: launcherDefaults.parallelWorkers,
            positive: true,
        })).toBe(launcherDefaults.parallelWorkers);
        expect(parseIntegerPrompt("8", "Parallel workers", { positive: true })).toBe(8);
        expect(() => parseIntegerPrompt("0", "Runs", { positive: true })).toThrow("positive safe integer");
        expect(() => parseIntegerPrompt("1.5", "Seed")).toThrow("safe integer");
    });
    it("selects choices by number or exact ID", () => {
        const encounters = ["plains_1", "forest_1"] as const;
        const choices = ["alpha", "beta", "gamma"] as const;

        expect(resolveNumberedChoice("2", encounters)).toBe("forest_1");
        expect(resolveNumberedChoice("plains_1", encounters)).toBe("plains_1");
        expect(resolveNumberedChoice("3", encounters)).toBeUndefined();

        expect(resolveNumberedChoice("3", choices)).toBe("gamma");
        expect(resolveNumberedChoice("beta", choices)).toBe("beta");

        expect(resolveMultipleChoices("1,3", choices)).toEqual(["alpha", "gamma"]);
        expect(resolveMultipleChoices("a", choices)).toEqual(choices);
        expect(resolveMultipleChoices("3,1,3", choices)).toEqual(["alpha", "gamma"]);
        expect(resolveMultipleChoices("9", choices)).toBeUndefined();
    });
});

describe("encounter-set execution", () => {
    it("runs every encounter-policy pair and produces one comparison per encounter", async () => {
        const seen: string[] = [];
        const fakeRunBatch = vi.fn((input): BatchResult => {
            seen.push(`${input.encounterId}/${input.policy.id}`);
            return { encounterId: input.encounterId, policyId: input.policy.id, masterSeed: input.masterSeed, runs: [] };
        });
        const result = await executeEncounterSet({
            encounterIds: encounterSets.n123,
            policies: [policies.first, policies.random],
            masterSeed: 1,
            runsPerEncounter: 0,
            maxActions: 1_000,
        }, { runBatch: fakeRunBatch, now: () => 0 });

        expect(seen).toEqual(encounterSets.n123.flatMap((encounterId) => [
            `${encounterId}/first`, `${encounterId}/random`,
        ]));
        expect(result.encounters.map(({ encounterId }) => encounterId)).toEqual([...encounterSets.n123]);
        expect(result.encounters.every(({ comparison }) => comparison.policies.length === 2)).toBe(true);
        expect(fakeRunBatch).toHaveBeenCalledTimes(6);
    });

    it("keeps encounters isolated when their batches use parallel workers", async () => {
        const result = await executeEncounterSet({
            encounterIds: ["plains_1", "plains_2"],
            policies: [firstPolicy],
            masterSeed: 11,
            runsPerEncounter: 2,
            maxActions: 0,
            workers: 2,
        });
        expect(result.encounters.map(({ encounterId }) => encounterId))
            .toEqual(["plains_1", "plains_2"]);
        expect(result.encounters.map(({ comparison }) => comparison.parallelWorkers))
            .toEqual([2, 2]);
        expect(result.encounters[0].comparison.policies[0].batch.encounterId).toBe("plains_1");
        expect(result.encounters[1].comparison.policies[0].batch.encounterId).toBe("plains_2");
    });
});

describe("replay launcher path", () => {
    it("generates replay data and launches the existing console viewer", async () => {
        const answers = ["4", "1", "2149783249", "1", "1543602598", ""];
        const close = vi.fn();
        const io: LauncherIO = {
            question: vi.fn(async () => answers.shift() ?? ""),
            write: vi.fn(),
            close,
        };
        const viewer = vi.fn(async (_input: ConsoleReplayInput) => { });

        await runHarnessLauncher(io, { runConsoleReplay: viewer });

        expect(close).toHaveBeenCalledOnce();
        expect(viewer).toHaveBeenCalledOnce();
        const replayInput = viewer.mock.calls[0]![0];
        expect(replayInput.encounter).toBe("plains_1");
        expect(replayInput.seed).toBe(2149783249);
        expect(replayInput.replay.steps.length).toBeGreaterThan(0);
        expect(replayInput.replay.steps.at(-1)?.success).toBe(true);
        const finalStep = replayInput.replay.steps.at(-1);
        if (!finalStep?.success) throw new Error("Expected a successful final replay step");
        expect(finalStep.state.turn.outcome).not.toBe("ongoing");
        expect(finalStep.state.turn.round).toBeGreaterThan(0);

        const direct = runSingleFight({
            encounterId: "plains_1",
            engineSeed: 2149783249,
            policy: firstPolicy,
            policySeed: 1543602598,
            maxActions: 1_000,
            replay: true,
        });
        expect(replayInput.replay).toEqual(direct.replay);
    });
});
