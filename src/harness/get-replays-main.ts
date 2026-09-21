import { resolve } from "node:path";
import {
    PostHogApiClient,
    postHogConfigFromEnvironment,
} from "./posthog-api";
import { syncPostHogReplays } from "./replay-archive";

async function main(): Promise<void> {
    const config = postHogConfigFromEnvironment(process.env);
    const client = new PostHogApiClient(config);

    process.stdout.write("Checking PostHog...\n\n");
    const result = await syncPostHogReplays({
        client,
        replaysDirectory: resolve("replays"),
    });

    process.stdout.write(`${result.found} fights found\n`);
    process.stdout.write(`${result.unchanged} already archived\n`);
    if (result.added.length > 0) {
        process.stdout.write("\nAdded:\n");
        for (const replay of result.added) {
            process.stdout.write(
                `  ${replay.encounter}  ${shortId(replay.replayId)}  ${replay.outcome}  ${replay.actionCount} actions\n`,
            );
        }
    }
    if (result.failed.length > 0) {
        process.stdout.write("\nFailed:\n");
        for (const replay of result.failed) {
            process.stdout.write(
                `  ${replay.encounter}  ${shortId(replay.replayId)}  release ${replay.release || "unknown"}\n`
                + `    ${replay.message}\n`,
            );
        }
    }

    process.stdout.write(
        `\nAdded ${result.added.length}.\n`
        + `${result.unchanged} unchanged.\n`
        + `${result.failed.length} failed.\n`,
    );
    if (result.failed.length > 0) process.exitCode = 1;
}

function shortId(replayId: string): string {
    return replayId.length > 8 ? replayId.slice(0, 8) : replayId;
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
