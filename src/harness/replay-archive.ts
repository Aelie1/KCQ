import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BattleState } from "../engine/public/types";
import type { FightReplay } from "./harness";
import type {
    PostHogReplayClient,
    RemoteReplayMetadata,
} from "./posthog-api";
import {
    parsePostHogReplayEvents,
    reconstructFightReplay,
} from "./posthog-replay";

export interface ArchivedReplay {
    format: 1;
    replayId: string;
    release: string;
    encounter: string;
    seed: number;
    startedAt: string;
    anonymousPlayerId?: string;
    sessionId?: string;
    terminal?: "finished" | "quit";
    replay: FightReplay;
}

export interface AddedReplay {
    replayId: string;
    encounter: string;
    outcome: BattleState;
    actionCount: number;
    filename: string;
}

export interface FailedReplay {
    replayId: string;
    release: string;
    encounter: string;
    message: string;
}

export interface ReplaySyncResult {
    found: number;
    unchanged: number;
    added: AddedReplay[];
    failed: FailedReplay[];
}

export interface ReplaySyncOptions {
    client: PostHogReplayClient;
    replaysDirectory: string;
}

export async function syncPostHogReplays(
    options: ReplaySyncOptions,
): Promise<ReplaySyncResult> {
    const remote = uniqueRemoteReplays(await options.client.discoverReplays());
    const archivedIds = await findArchivedReplayIds(options.replaysDirectory);
    const missing = remote.filter((metadata) => !archivedIds.has(metadata.replayId));
    const added: AddedReplay[] = [];
    const failed: FailedReplay[] = [];

    for (const metadata of missing) {
        try {
            const rows = await options.client.fetchReplayEvents(metadata.replayId);
            const parsed = parsePostHogReplayEvents(rows);
            assertMetadataMatches(metadata, parsed);
            const imported = reconstructFightReplay(parsed);
            const archive: ArchivedReplay = {
                format: 1,
                replayId: imported.replayId,
                release: imported.release,
                encounter: imported.encounter,
                seed: imported.seed,
                startedAt: metadata.startedAt,
                ...(metadata.anonymousPlayerId
                    ? { anonymousPlayerId: metadata.anonymousPlayerId }
                    : {}),
                ...(metadata.sessionId ? { sessionId: metadata.sessionId } : {}),
                ...(imported.terminal ? { terminal: imported.terminal } : {}),
                replay: imported.replay,
            };
            const filename = await writeArchivedReplay(options.replaysDirectory, archive);
            const finalState = imported.replay.steps.reduce(
                (state, step) => step.success ? step.state : state,
                imported.replay.initialState,
            );
            added.push({
                replayId: imported.replayId,
                encounter: imported.encounter,
                outcome: finalState.turn.outcome,
                actionCount: imported.replay.steps.length,
                filename,
            });
            archivedIds.add(imported.replayId);
        } catch (error: unknown) {
            failed.push({
                replayId: metadata.replayId,
                release: metadata.release,
                encounter: metadata.encounter,
                message: errorMessage(error),
            });
        }
    }

    return {
        found: remote.length,
        unchanged: remote.length - missing.length,
        added,
        failed,
    };
}

export async function findArchivedReplayIds(directory: string): Promise<Set<string>> {
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch (error: unknown) {
        if (isNodeError(error) && error.code === "ENOENT") return new Set();
        throw error;
    }

    const replayIds = new Set<string>();
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
        const path = join(directory, entry.name);
        let value: unknown;
        try {
            value = JSON.parse(await readFile(path, "utf8"));
        } catch (error: unknown) {
            throw new Error(`Invalid replay archive ${entry.name}: ${errorMessage(error)}.`);
        }
        if (!isRecord(value) || value.format !== 1
            || typeof value.replayId !== "string" || !value.replayId.trim()) {
            throw new Error(`Invalid replay archive ${entry.name}: expected format 1 with replayId.`);
        }
        replayIds.add(value.replayId);
    }
    return replayIds;
}

export async function writeArchivedReplay(
    directory: string,
    archive: ArchivedReplay,
): Promise<string> {
    await mkdir(directory, { recursive: true });
    const base = archiveFilenameBase(archive);
    const contents = `${JSON.stringify(archive, null, 2)}\n`;
    for (let suffix = 1; ; suffix++) {
        const filename = suffix === 1 ? `${base}.json` : `${base}_${suffix}.json`;
        try {
            await writeFile(join(directory, filename), contents, {
                encoding: "utf8",
                flag: "wx",
            });
            return filename;
        } catch (error: unknown) {
            if (isNodeError(error) && error.code === "EEXIST") continue;
            throw error;
        }
    }
}

function archiveFilenameBase(archive: ArchivedReplay): string {
    const date = /^\d{4}-\d{2}-\d{2}/u.exec(archive.startedAt)?.[0] ?? "unknown-date";
    const encounter = safeFilenamePart(archive.encounter) || "unknown-encounter";
    const shortReplayId = safeFilenamePart(archive.replayId).slice(0, 8) || "replay";
    return `${date}_${encounter}_${shortReplayId}`;
}

function safeFilenamePart(value: string): string {
    return value.replace(/[^a-z0-9_-]+/giu, "_").replace(/^_+|_+$/gu, "");
}

function uniqueRemoteReplays(remote: readonly RemoteReplayMetadata[]): RemoteReplayMetadata[] {
    const byId = new Map<string, RemoteReplayMetadata>();
    for (const metadata of remote) {
        const existing = byId.get(metadata.replayId);
        if (!existing) {
            byId.set(metadata.replayId, metadata);
            continue;
        }
        if (JSON.stringify(existing) !== JSON.stringify(metadata)) {
            throw new Error(`PostHog returned conflicting metadata for replay ${metadata.replayId}.`);
        }
    }
    return [...byId.values()];
}

function assertMetadataMatches(
    metadata: RemoteReplayMetadata,
    parsed: ReturnType<typeof parsePostHogReplayEvents>,
): void {
    const comparisons: Array<[string, unknown, unknown]> = [
        ["replay ID", metadata.replayId, parsed.replayId],
        ["release", metadata.release, parsed.release],
        ["encounter", metadata.encounter, parsed.encounter],
        ["seed", metadata.seed, parsed.seed],
    ];
    for (const [name, discovered, fetched] of comparisons) {
        if (discovered !== fetched) {
            throw new Error(
                `Replay ${metadata.replayId}: discovered ${name} ${JSON.stringify(discovered)}, fetched ${JSON.stringify(fetched)}.`,
            );
        }
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
