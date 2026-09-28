import { formatEncounterComparisons, formatPolicyComparison } from "../batch/comparison";
import { executeEncounterSet } from "../batch/encounter-sets";
import { effectiveWorkerCount } from "../batch/parallel-batch";
import { captureReplaySamples } from "../batch/replay-samples";
import {
    createBatchRunOutput,
    formatReplaySamples,
    formatSavedSummaries,
    type SavedReplaySample,
    writeBatchSummary,
    writeReplaySamples,
} from "../output";
import { getPolicy, policies } from "../policies";
import { formatCompletion } from "./progress";

const DEFAULT_MAX_ACTIONS = 1_000;
const DEFAULT_WORKERS = 8;

async function main(): Promise<void> {
    const [
        encounterArg,
        masterSeedArg,
        policyArg,
        runsArg,
        maxActionsArg,
        workersArg,
    ] = process.argv.slice(2);

    if (!encounterArg || !masterSeedArg || !policyArg || !runsArg) {
        fail(
            "Usage: npm run compare -- <encounters> <masterSeed> <policies> <runs> "
            + "[maxActions] [workers]",
        );
    }

    const encounterIds = encounterArg
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

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
        encounters: encounterIds,
        policies: selectedPolicies.map((policy) => policy.id),
    });

    const result = await executeEncounterSet({
        encounterIds,
        policies: selectedPolicies,
        masterSeed,
        runsPerEncounter: runs,
        maxActions,
        workers,
    });
    const replayGroups: Array<{
        encounterId: string;
        policyId: string;
        samples: SavedReplaySample[];
    }> = [];
    for (const encounter of result.encounters) {
        encounter.comparison.policies.forEach((entry) => {
            const policy = selectedPolicies.find(
                (candidate) => candidate.id === entry.policyId,
            )!;
            const batchInput = {
                encounterId: encounter.encounterId,
                policy,
                masterSeed,
                runs,
                maxActions,
                replay: false,
            } as const;
            writeBatchSummary(batchInput, entry.summary, output.directoryPath);
            replayGroups.push({
                encounterId: encounter.encounterId,
                policyId: entry.policyId,
                samples: writeReplaySamples(
                    captureReplaySamples(batchInput, entry.batch),
                    output.directoryPath,
                ),
            });
        });
    }

    const comparisons = result.encounters.map(({ comparison }) => comparison);

    console.log(
        comparisons.length === 1
            ? formatPolicyComparison(comparisons[0]).join("\n")
            : formatEncounterComparisons(comparisons).join("\n"),
    );
    replayGroups.forEach(({ encounterId, policyId, samples }) => {
        console.log(formatReplaySamples(samples, `Replays (${encounterId} / ${policyId}):`));
    });
    console.log(formatCompletion(
        encounterIds.length * selectedPolicies.length * runs,
        result.elapsedMs,
        "fights",
    ));
    console.log(formatSavedSummaries(
        encounterIds.length * selectedPolicies.length,
        output.directoryPath,
    ));
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
