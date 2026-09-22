import { parseBatchCommandArguments } from "./batch-cli";
import { writeBatchSummary } from "../output";
import { runBatchParallel } from "../batch/parallel-batch";
import { createProgressReporter, formatCompletion } from "./progress";
import { summarizeBatch } from "../batch/summary";
import { formatBatchSummary } from "../batch/summary-format";

async function main(): Promise<void> {
    const { input, workers } = parseBatchCommandArguments(process.argv.slice(2));
    const progress = createProgressReporter();
    const batch = await runBatchParallel(input, { workers, onProgress: progress.update });
    const elapsedMs = progress.elapsedMs();
    const summary = summarizeBatch(batch);
    const outputPath = writeBatchSummary(input, summary);

    console.log(formatBatchSummary(summary).join("\n"));
    console.log(`\nWrote ${outputPath}`);
    console.log(`Parallel workers: ${Math.min(workers, input.runs)}`);
    console.log(formatCompletion(input.runs, elapsedMs));
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
