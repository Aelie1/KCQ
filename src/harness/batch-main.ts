import fs from "node:fs";
import path from "node:path";
import { runBatch } from "./batch";
import { parseBatchArguments } from "./batch-cli";
import { summarizeBatch } from "./summary";
import { formatBatchSummary } from "./summary-format";

try {
    const input = parseBatchArguments(process.argv.slice(2));
    const batch = runBatch(input);
    const summary = summarizeBatch(batch);
    const filename = [
        safeFilenamePart(input.encounterId),
        safeFilenamePart(input.policy.id),
        `master-${input.masterSeed}`,
        `runs-${input.runs}`,
        `max-${input.maxActions}`,
        "summary.json",
    ].join("-");
    const outputDir = path.resolve("harness-output");
    const outputPath = path.join(outputDir, filename);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), "utf8");

    console.log(formatBatchSummary(summary).join("\n"));
    console.log(`\nWrote ${outputPath}`);
} catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}

function safeFilenamePart(value: string): string {
    return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}
