import { parseBatchCommandArguments } from "./batch-cli";
import {
    createBatchRunOutput,
    formatReplaySamples,
    formatSavedSummaries,
    writeBatchSummary,
    writeReplaySamples,
} from "../output";
import { effectiveWorkerCount, runBatchParallel } from "../batch/parallel-batch";
import { createProgressReporter, formatCompletion } from "./progress";
import { summarizeBatch } from "../batch/summary";
import { formatBatchSummary } from "../batch/summary-format";
import { captureReplaySamples } from "../batch/replay-samples";

async function main(): Promise<void> {
    const { input, workers } = parseBatchCommandArguments(process.argv.slice(2));
    const parallelWorkers = effectiveWorkerCount(workers, input.runs);
    const output = createBatchRunOutput({
        masterSeed: input.masterSeed,
        runsPerEncounter: input.runs,
        maxActions: input.maxActions,
        parallelWorkers,
        encounters: [input.encounterId],
        policies: [input.policy.id],
    });
    const progress = createProgressReporter();
    const batch = await runBatchParallel(input, { workers, onProgress: progress.update });
    const elapsedMs = progress.elapsedMs();
    const summary = summarizeBatch(batch);
    writeBatchSummary(input, summary, output.directoryPath);
    const replays = writeReplaySamples(
        captureReplaySamples(input, batch),
        output.directoryPath,
    );

    console.log(formatBatchSummary(summary).join("\n"));
    console.log(formatReplaySamples(replays));
    console.log(`Parallel workers: ${parallelWorkers}`);
    console.log(formatCompletion(input.runs, elapsedMs));
    console.log(formatSavedSummaries(1, output.directoryPath));
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
