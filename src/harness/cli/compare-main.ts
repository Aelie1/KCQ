import { formatEncounterComparisons, formatPolicyComparison } from "../batch/comparison";
import { executeEncounterSet } from "../batch/encounter-sets";
import { effectiveWorkerCount } from "../batch/parallel-batch";
import { captureReplaySamples } from "../batch/replay-samples";
import {
    createBatchRunOutput,
    formatSavedSummaries,
    type SavedReplaySample,
    writeBatchSummary,
    writeReplaySamples
} from "../output";
import { parseCompareCommandArguments } from "./compare-cli";
import { formatCompletion } from "./progress";

async function main(): Promise<void> {
    const {
        encounterIds,
        masterSeed,
        selectedPolicies,
        runs,
        maxActions,
        workers,
        replayEncounterIds,
    } = parseCompareCommandArguments(process.argv.slice(2));
    const replayEncounters = new Set(replayEncounterIds);
    const output = createBatchRunOutput({
        masterSeed,
        runsPerEncounter: runs,
        maxActions,
        parallelWorkers: effectiveWorkerCount(workers, runs),
        encounters: encounterIds,
        policies: selectedPolicies.map((policy) => policy.id),
        replayEncounters: replayEncounterIds,
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
            if (!replayEncounters.has(encounter.encounterId)) return;
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

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
