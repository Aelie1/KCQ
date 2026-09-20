import { runBatch } from "./batch";
import { parseBatchArguments } from "./batch-cli";
import { writeBatchSummary } from "./output";
import { createProgressReporter, formatCompletion } from "./progress";
import { summarizeBatch } from "./summary";
import { formatBatchSummary } from "./summary-format";

try {
    const input = parseBatchArguments(process.argv.slice(2));
    const progress = createProgressReporter();
    const batch = runBatch(input, { onProgress: progress.update });
    const elapsedMs = progress.elapsedMs();
    const summary = summarizeBatch(batch);
    const outputPath = writeBatchSummary(input, summary);

    console.log(formatBatchSummary(summary).join("\n"));
    console.log(`\nWrote ${outputPath}`);
    console.log(formatCompletion(input.runs, elapsedMs));
} catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
