const { performance } = require("node:perf_hooks");

const [encounterId, policyId, runsText, maxActionsText = "1000", seedText = "12345"] = process.argv.slice(2);
if (!encounterId || !policyId || !runsText) {
    throw new Error("usage: node .perf/current-bench.cjs <encounter> <policy> <runs> [maxActions] [seed]");
}

const { runBatch } = require("../dist/harness/batch/batch.js");
const { getPolicy } = require("../dist/harness/policies.js");
const policy = getPolicy(policyId);
if (!policy) throw new Error(`unknown policy ${policyId}`);

const input = {
    encounterId,
    policy,
    masterSeed: Number(seedText),
    runs: Number(runsText),
    maxActions: Number(maxActionsText),
    replay: false,
};

const started = performance.now();
const result = runBatch(input);
const elapsedMs = performance.now() - started;
const decisions = result.runs.reduce((sum, run) => sum + run.result.metrics.decisions, 0);
const terminations = result.runs.reduce((counts, run) => {
    const key = run.result.termination;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
}, {});

console.log(JSON.stringify({
    encounterId,
    policyId,
    runs: input.runs,
    maxActions: input.maxActions,
    masterSeed: input.masterSeed,
    elapsedMs,
    runsPerSecond: input.runs / (elapsedMs / 1000),
    meanDecisions: decisions / input.runs,
    decisionsPerSecond: decisions / (elapsedMs / 1000),
    decisions,
    terminations,
}));
