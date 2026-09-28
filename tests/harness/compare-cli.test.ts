import { describe, expect, it } from "vitest";
import {
    parseCompareCommandArguments,
    resolveReplayEncounterIds,
} from "../../src/harness/cli/compare-cli";

describe("comparison CLI replay level filter", () => {
    it("defaults automatic replays to every simulated level", () => {
        const parsed = parseCompareCommandArguments([
            "plains_1,forest_1", "4", "basic", "100",
        ]);

        expect(parsed.replayEncounterIds).toEqual(["plains_1", "forest_1"]);
        expect(parsed.maxActions).toBe(1_000);
        expect(parsed.workers).toBe(8);
    });

    it("accepts a comma-separated subset in either named-option form", () => {
        const prefix = ["plains_1,plains_2,forest_1", "4", "basic", "100"];

        expect(parseCompareCommandArguments([
            "--replay-levels", "forest_1,plains_1", ...prefix,
        ]).replayEncounterIds).toEqual(["plains_1", "forest_1"]);
        expect(parseCompareCommandArguments([
            ...prefix, "1000", "4", "--replay-levels=plains_2",
        ]).replayEncounterIds).toEqual(["plains_2"]);
    });

    it("supports all and none explicitly", () => {
        const encounters = ["plains_1", "forest_1"];
        expect(resolveReplayEncounterIds("all", encounters)).toEqual(encounters);
        expect(resolveReplayEncounterIds("none", encounters)).toEqual([]);
    });

    it("rejects replay levels that are not part of the comparison", () => {
        expect(() => resolveReplayEncounterIds(
            "forest_2",
            ["plains_1", "forest_1"],
        )).toThrow(/must be included in encounters.*forest_2/);
    });

    it("rejects missing, duplicate, and unknown options", () => {
        const prefix = ["plains_1", "4", "basic", "100"];
        expect(() => parseCompareCommandArguments([...prefix, "--replay-levels"]))
            .toThrow(/requires a value/);
        expect(() => parseCompareCommandArguments([
            ...prefix,
            "--replay-levels=all",
            "--replay-levels=none",
        ])).toThrow(/only once/);
        expect(() => parseCompareCommandArguments([...prefix, "--unknown=x"]))
            .toThrow(/Unknown option/);
    });
});
