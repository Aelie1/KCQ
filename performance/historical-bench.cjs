const path = require("node:path");
const { performance } = require("node:perf_hooks");

const [checkoutText, encounterId, policyId, runsText, maxActionsText = "1000", seedText = "12345"] = process.argv.slice(2);
if (!checkoutText || !encounterId || !policyId || !runsText) {
    throw new Error("usage: node historical-bench.cjs <checkout> <encounter> <policy> <runs> [maxActions] [masterSeed]");
}
const checkout = path.resolve(checkoutText);
const { runSingleFight } = require(path.join(checkout, "dist/harness/harness.js"));
const { getPolicy } = require(path.join(checkout, "dist/harness/policies.js"));
const policy = getPolicy(policyId);
if (!policy) throw new Error(`unknown policy ${policyId}`);

const runs = Number(runsText);
const masterSeed = Number(seedText);
const maxActions = Number(maxActionsText);
let decisions = 0;
const terminations = {};
const started = performance.now();
for (let runIndex = 0; runIndex < runs; runIndex++) {
    const { engineSeed, policySeed } = deriveRunSeeds(masterSeed, runIndex);
    const result = runSingleFight({
        encounterId,
        engineSeed,
        policySeed,
        maxActions,
        policy,
        replay: false,
    });
    const actionCount = result.metrics?.decisions ?? result.actionCount ?? result.trace.length;
    decisions += actionCount;
    terminations[result.termination] = (terminations[result.termination] ?? 0) + 1;
}
const elapsedMs = performance.now() - started;

console.log(JSON.stringify({
    checkout: path.basename(checkout),
    encounterId,
    policyId,
    runs,
    masterSeed,
    elapsedMs,
    runsPerSecond: runs / (elapsedMs / 1000),
    meanDecisions: decisions / runs,
    decisionsPerSecond: decisions / (elapsedMs / 1000),
    decisions,
    terminations,
}));

function deriveRunSeeds(master, runIndex) {
    const mask = 0xffff_ffff_ffff_ffffn;
    const indexed = (BigInt.asUintN(64, BigInt(master)) + BigInt(runIndex) * 0x9e37_79b9_7f4a_7c15n) & mask;
    return {
        engineSeed: Number(mix64(indexed ^ 0x243f_6a88_85a3_08d3n) & 0xffff_ffffn),
        policySeed: Number(mix64(indexed ^ 0x1319_8a2e_0370_7344n) & 0xffff_ffffn),
    };
}

function mix64(input) {
    const mask = 0xffff_ffff_ffff_ffffn;
    let value = input & mask;
    value = ((value ^ (value >> 30n)) * 0xbf58_476d_1ce4_e5b9n) & mask;
    value = ((value ^ (value >> 27n)) * 0x94d0_49bb_1331_11ebn) & mask;
    return (value ^ (value >> 31n)) & mask;
}
