import { executePolicyComparison, formatPolicyComparison } from "../batch/comparison";
import { effectiveWorkerCount } from "../batch/parallel-batch";
import { createBatchRunOutput, formatSavedSummaries, writeBatchSummary } from "../output";
import { getPolicy, policies } from "../policies";
import { formatCompletion } from "./progress";

const DEFAULT_MAX_ACTIONS = 1_000;
const DEFAULT_WORKERS = 8;

async function main(): Promise<void> {
    const [
        encounterId,
        masterSeedArg,
        policyArg,
        runsArg,
        maxActionsArg,
        workersArg,
    ] = process.argv.slice(2);

    if (!encounterId || !masterSeedArg || !policyArg || !runsArg) {
        fail(
            "Usage: npm run compare -- <encounterId> <masterSeed> <policies> <runs> "
            + "[maxActions] [workers]",
        );
    }

    const masterSeed = parseInteger(masterSeedArg, "masterSeed");
    const runs = parseInteger(runsArg, "runs", true);
    const maxActions = maxActionsArg === undefined
        ? DEFAULT_MAX_ACTIONS
        : parseInteger(maxActionsArg, "maxActions", true);
    const workers = workersArg === undefined
        ? DEFAULT_WORKERS
        : parseInteger(workersArg, "workers", true);

    const policyIds = policyArg === "all"
        ? Object.keys(policies)
        : policyArg.split(",").map((id) => id.trim()).filter(Boolean);

    const selectedPolicies = policyIds.map((id) => {
        const policy = getPolicy(id);
        if (!policy) {
            fail(
                `Unknown policy: ${id}. Available policies: `
                + Object.keys(policies).join(", "),
            );
        }
        return policy;
    });
    const output = createBatchRunOutput({
        masterSeed,
        runsPerEncounter: runs,
        maxActions,
        parallelWorkers: effectiveWorkerCount(workers, runs),
        encounters: [encounterId],
        policies: selectedPolicies.map((policy) => policy.id),
    });

    const result = await executePolicyComparison({
        encounterId,
        policies: selectedPolicies,
        masterSeed,
        runs,
        maxActions,
        workers,
    });
    result.policies.forEach((entry) => {
        const policy = selectedPolicies.find((candidate) => candidate.id === entry.policyId)!;
        writeBatchSummary({
            encounterId,
            policy,
            masterSeed,
            runs,
            maxActions,
            replay: false,
        }, entry.summary, output.directoryPath);
    });

    console.log(formatPolicyComparison(result).join("\n"));
    console.log(formatCompletion(selectedPolicies.length * runs, result.overallElapsedMs, "fights"));
    console.log(formatSavedSummaries(result.policies.length, output.directoryPath));
}

function parseInteger(value: string, name: string, positive = false): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || (positive && parsed <= 0)) {
        fail(`${name} must be a ${positive ? "positive " : ""}safe integer.`);
    }
    return parsed;
}

function fail(message: string): never {
    throw new Error(message);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
