import { resolve } from "node:path";
import {
    PostHogApiClient,
    postHogConfigFromEnvironment,
} from "../replay/posthog-api";
import { syncPostHogReplays } from "../replay/replay-archive";
import type {
    AddedReplay,
    UnchangedProvisionalReplay,
    UpdatedReplay,
} from "../replay/replay-archive";

async function main(): Promise<void> {
    const config = postHogConfigFromEnvironment(process.env);
    const client = new PostHogApiClient(config);

    process.stdout.write("Checking PostHog...\n\n");
    const result = await syncPostHogReplays({
        client,
        replaysDirectory: resolve("replays"),
    });

    process.stdout.write(`${result.found} fights found\n`);
    process.stdout.write(`${result.completeArchives} complete archives\n`);
    process.stdout.write(`${result.provisionalArchives} provisional archives\n`);
    process.stdout.write(`${result.newFights} new fights\n`);
    if (result.added.length > 0) {
        process.stdout.write("\nAdded:\n");
        printGrouped(result.added, formatAdded);
    }
    if (result.updated.length > 0) {
        process.stdout.write("\nUpdated:\n");
        printGrouped(result.updated, formatUpdated);
    }
    if (result.unchangedProvisional.length > 0) {
        process.stdout.write("\nUnchanged provisional:\n");
        printGrouped(result.unchangedProvisional, (replay) =>
            `${formatStart(replay.startedAt)}  ${replay.encounter}  ${shortId(replay.replayId)}  ${replay.actionCount} actions`);
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
        + `Updated ${result.updated.length}.\n`
        + `${result.unchanged} unchanged.\n`
        + `${result.failed.length} failed.\n`,
    );
    if (result.failed.length > 0) process.exitCode = 1;
}

interface PlayerSummary {
    playerTag?: string;
    startedAt: string;
}

function printGrouped<T extends PlayerSummary>(
    replays: readonly T[],
    format: (replay: T) => string,
): void {
    const groups = new Map<string, T[]>();
    for (const replay of [...replays].sort((left, right) =>
        (left.playerTag ?? "~").localeCompare(right.playerTag ?? "~")
        || left.startedAt.localeCompare(right.startedAt))) {
        const tag = replay.playerTag ?? "no-player";
        const group = groups.get(tag) ?? [];
        group.push(replay);
        groups.set(tag, group);
    }
    for (const [tag, group] of groups) {
        process.stdout.write(`  ${tag}\n`);
        for (const replay of group) process.stdout.write(`    ${format(replay)}\n`);
    }
}

function formatAdded(replay: AddedReplay): string {
    return `${formatStart(replay.startedAt)}  ${replay.encounter}  ${shortId(replay.replayId)}  ${replay.status}  ${formatCounts(replay)}${formatRoundsAndElapsed(replay)}`;
}

function formatUpdated(replay: UpdatedReplay): string {
    const actions = replay.previousActionCount === replay.actionCount
        ? `${replay.actionCount} actions`
        : `${replay.previousActionCount} -> ${replay.actionCount} actions`;
    const decisions = replay.decisionCount === undefined ? "" : ` / ${replay.decisionCount} decisions`;
    return `${formatStart(replay.startedAt)}  ${replay.encounter}  ${shortId(replay.replayId)}  ${replay.status}  ${actions}${decisions}${formatRoundsAndElapsed(replay)}`;
}

function formatCounts(replay: AddedReplay): string {
    return replay.decisionCount === undefined
        ? `${replay.actionCount} actions`
        : `${replay.actionCount} actions / ${replay.decisionCount} decisions`;
}

function formatRoundsAndElapsed(replay: AddedReplay): string {
    const rounds = replay.rounds === undefined ? "" : `  ${replay.rounds} rounds`;
    const elapsed = replay.elapsedMs === undefined ? "" : `  ${formatDuration(replay.elapsedMs)}`;
    return `${rounds}${elapsed}`;
}

function formatStart(timestamp: string): string {
    return timestamp.replace("T", " ").replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/u, "");
}

function formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1_000);
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}

function shortId(replayId: string): string {
    return replayId.length > 8 ? replayId.slice(0, 8) : replayId;
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
