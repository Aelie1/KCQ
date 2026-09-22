import { describe, expect, it } from "vitest";
import {
    executePolicyComparison,
    formatPolicyComparison,
    formatRuntime,
} from "../../src/harness/batch/comparison";
import { firstPolicy } from "../../src/harness/policy/first";
import { randomPolicy } from "../../src/harness/policy/random";

describe("policy comparison", () => {
    it("uses identical engine and policy seed mappings at equal run indexes", async () => {
        const result = await executePolicyComparison({
            encounterId: "plains_1",
            policies: [firstPolicy, randomPolicy],
            masterSeed: 123,
            runs: 3,
            maxActions: 0,
            workers: 2,
        });
        const [first, random] = result.policies;
        expect(first.batch.runs.map(({ runIndex, engineSeed, policySeed }) => ({ runIndex, engineSeed, policySeed })))
            .toEqual(random.batch.runs.map(({ runIndex, engineSeed, policySeed }) => ({ runIndex, engineSeed, policySeed })));
        expect(result.parallelWorkers).toBe(2);
    });

    it("includes mean timing in each policy metric row without a second timing table", async () => {
        const times = [0, 100, 300, 400, 1_000, 1_200];
        const result = await executePolicyComparison({
            encounterId: "plains_1",
            policies: [firstPolicy, randomPolicy],
            masterSeed: 1,
            runs: 2,
            maxActions: 0,
        }, { now: () => times.shift()! });
        const output = formatPolicyComparison(result).join("\n");

        expect(result.policies.map(({ policyId }) => policyId)).toEqual(["first", "random"]);
        expect(result.policies[0].timing).toEqual({ runtimeMs: 200, meanPerRunMs: 100 });
        expect(result.policies[1].timing).toEqual({ runtimeMs: 600, meanPerRunMs: 300 });
        expect(result.policyRuntimeTotalMs).toBe(800);
        expect(result.overallElapsedMs).toBe(1_200);
        expect(output).toContain("===== plains_1 =====");
        expect(output).toContain("meanDecisions");
        expect(output).toContain("meanPeakBondage");
        expect(output).toContain("ms/run");
        expect(output).not.toContain("Timing:");
        expect(output).not.toContain("runtime");
        expect(output).not.toContain("share");
        expect(output.match(/\| first\s+\|/g)).toHaveLength(1);
        expect(output.match(/\| random\s+\|/g)).toHaveLength(1);
        expect(output).toMatch(/\| first\s+\|[^\n]*\| 100\.0\s+\|/);
        expect(output).toMatch(/\| random\s+\|[^\n]*\| 300\.0\s+\|/);
        expect(output).not.toMatch(/engineSeed|policySeed|shortestDefeat/);
        expect(result.policies[0].summary).not.toHaveProperty("timing");
        expect(result.policies[0].summary).not.toHaveProperty("parallelWorkers");
    });

    it("reports deterministic policy-aware progress without changing results", async () => {
        const updates: string[] = [];
        const input = {
            encounterId: "plains_1",
            policies: [firstPolicy, randomPolicy],
            masterSeed: 7,
            runs: 2,
            maxActions: 0,
        };
        const withProgress = await executePolicyComparison(input, {
            now: () => 0,
            onProgress: (progress) => updates.push(
                `${progress.encounterId}/${progress.policyId}:${progress.policyCompleted}/${progress.policyTotal}:${progress.overallCompleted}/${progress.overallTotal}`,
            ),
        });
        const withoutProgress = await executePolicyComparison(input, { now: () => 0 });

        expect(updates).toEqual([
            "plains_1/first:1/2:1/4", "plains_1/first:2/2:2/4",
            "plains_1/random:1/2:3/4", "plains_1/random:2/2:4/4",
        ]);
        expect(withProgress).toEqual(withoutProgress);
    });

    it("formats subsecond, second, and minute timing values", () => {
        expect(formatRuntime(12.345)).toBe("12.3 ms");
        expect(formatRuntime(1_234)).toBe("1.2 s");
        expect(formatRuntime(61_250)).toBe("1m 1.3s");
    });
});
