import { randomUUID } from "node:crypto";
import {
    mkdir,
    open,
    readdir,
    readFile,
    rename,
    unlink,
    writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { BattleState } from "../../engine/public/types";
import type { FightReplay } from "../harness";
import type {
    PostHogReplayClient,
    RemoteReplayMetadata,
} from "./posthog-api";
import {
    parsePostHogReplayEvents,
    reconstructFightReplay,
} from "./posthog-replay";

export type ArchivedReplayTerminal = "finished" | "quit" | "abandoned";

export interface ArchivedReplay {
    format: 1;
    replayId: string;
    release: string;
    encounter: string;
    seed: number;
    startedAt: string;
    anonymousPlayerId?: string;
    sessionId?: string;
    terminal?: ArchivedReplayTerminal;
    replay: FightReplay;
}

export type ReplayArchiveStatus = BattleState | "quit" | "abandoned" | "incomplete";

export interface AddedReplay {
    replayId: string;
    encounter: string;
    status: ReplayArchiveStatus;
    actionCount: number;
    filename: string;
}

export interface UpdatedReplay extends AddedReplay {
    previousActionCount: number;
}

export interface UnchangedProvisionalReplay {
    replayId: string;
    encounter: string;
    actionCount: number;
}

export interface FailedReplay {
    replayId: string;
    release: string;
    encounter: string;
    message: string;
}

export interface ReplaySyncResult {
    found: number;
    completeArchives: number;
    provisionalArchives: number;
    newFights: number;
    unchanged: number;
    added: AddedReplay[];
    updated: UpdatedReplay[];
    unchangedProvisional: UnchangedProvisionalReplay[];
    failed: FailedReplay[];
}

export interface ReplaySyncOptions {
    client: PostHogReplayClient;
    replaysDirectory: string;
}

interface ArchiveEntry {
    filename: string;
    path: string;
    archive: ArchivedReplay;
}

export async function syncPostHogReplays(
    options: ReplaySyncOptions,
): Promise<ReplaySyncResult> {
    const remote = uniqueRemoteReplays(await options.client.discoverReplays());
    const archived = await readArchivedReplays(options.replaysDirectory);
    const relevantEntries = remote.flatMap((metadata) => {
        const entry = archived.get(metadata.replayId);
        return entry ? [entry] : [];
    });
    const completeArchives = relevantEntries.filter((entry) => entry.archive.terminal).length;
    const provisionalArchives = relevantEntries.length - completeArchives;
    const newFights = remote.length - relevantEntries.length;
    const added: AddedReplay[] = [];
    const updated: UpdatedReplay[] = [];
    const unchangedProvisional: UnchangedProvisionalReplay[] = [];
    const failed: FailedReplay[] = [];

    for (const metadata of remote) {
        const existing = archived.get(metadata.replayId);
        if (existing?.archive.terminal) continue;
        try {
            const rows = await options.client.fetchReplayEvents(metadata.replayId);
            const parsed = parsePostHogReplayEvents(rows);
            assertMetadataMatches(metadata, parsed);
            const imported = reconstructFightReplay(parsed);
            const archive = createArchive(metadata, imported);
            const summary = summarizeArchive(archive);

            if (!existing) {
                const filename = await writeArchivedReplay(options.replaysDirectory, archive);
                added.push({ ...summary, filename });
                archived.set(metadata.replayId, {
                    filename,
                    path: join(options.replaysDirectory, filename),
                    archive,
                });
            } else if (archivesEqual(existing.archive, archive)) {
                unchangedProvisional.push({
                    replayId: archive.replayId,
                    encounter: archive.encounter,
                    actionCount: archive.replay.steps.length,
                });
            } else {
                const previousActionCount = existing.archive.replay.steps.length;
                await replaceArchivedReplay(existing.path, archive);
                existing.archive = archive;
                updated.push({
                    ...summary,
                    filename: existing.filename,
                    previousActionCount,
                });
            }
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
        completeArchives,
        provisionalArchives,
        newFights,
        unchanged: completeArchives + unchangedProvisional.length,
        added,
        updated,
        unchangedProvisional,
        failed,
    };
}

export async function findArchivedReplayIds(directory: string): Promise<Set<string>> {
    return new Set((await readArchivedReplays(directory)).keys());
}

export async function writeArchivedReplay(
    directory: string,
    archive: ArchivedReplay,
): Promise<string> {
    await mkdir(directory, { recursive: true });
    const base = archiveFilenameBase(archive);
    const contents = serializeArchive(archive);
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

export async function replaceArchivedReplay(
    path: string,
    archive: ArchivedReplay,
): Promise<void> {
    const temporaryPath = join(
        dirname(path),
        `.${basename(path)}.${randomUUID()}.tmp`,
    );
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
        handle = await open(temporaryPath, "wx");
        await handle.writeFile(serializeArchive(archive), "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
        await rename(temporaryPath, path);
    } finally {
        await handle?.close().catch(() => undefined);
        await unlink(temporaryPath).catch((error: unknown) => {
            if (!isNodeError(error) || error.code !== "ENOENT") throw error;
        });
    }
}

async function readArchivedReplays(directory: string): Promise<Map<string, ArchiveEntry>> {
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch (error: unknown) {
        if (isNodeError(error) && error.code === "ENOENT") return new Map();
        throw error;
    }

    const archives = new Map<string, ArchiveEntry>();
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
        const path = join(directory, entry.name);
        let value: unknown;
        try {
            value = JSON.parse(await readFile(path, "utf8"));
        } catch (error: unknown) {
            throw new Error(`Invalid replay archive ${entry.name}: ${errorMessage(error)}.`);
        }
        const archive = parseArchive(value, entry.name);
        if (archives.has(archive.replayId)) {
            throw new Error(`Duplicate replayId ${archive.replayId} in replay archives.`);
        }
        archives.set(archive.replayId, { filename: entry.name, path, archive });
    }
    return archives;
}

function parseArchive(value: unknown, filename: string): ArchivedReplay {
    const validTerminal = isRecord(value)
        && (value.terminal === undefined
            || value.terminal === "finished"
            || value.terminal === "quit"
            || value.terminal === "abandoned");
    if (!validTerminal || value.format !== 1
        || typeof value.replayId !== "string" || !value.replayId.trim()
        || !isRecord(value.replay) || !Array.isArray(value.replay.steps)
        || !isRecord(value.replay.initialState)) {
        throw new Error(
            `Invalid replay archive ${filename}: expected a format 1 ArchivedReplay.`,
        );
    }
    return value as unknown as ArchivedReplay;
}

function createArchive(
    metadata: RemoteReplayMetadata,
    imported: ReturnType<typeof reconstructFightReplay>,
): ArchivedReplay {
    return {
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
}

function summarizeArchive(archive: ArchivedReplay): Omit<AddedReplay, "filename"> {
    const finalState = archive.replay.steps.reduce(
        (state, step) => step.success ? step.state : state,
        archive.replay.initialState,
    );
    const status: ReplayArchiveStatus = archive.terminal === "abandoned"
        ? "abandoned"
        : archive.terminal === "quit"
            ? "quit"
            : archive.terminal === undefined
                ? "incomplete"
                : finalState.turn.outcome;
    return {
        replayId: archive.replayId,
        encounter: archive.encounter,
        status,
        actionCount: archive.replay.steps.length,
    };
}

function serializeArchive(archive: ArchivedReplay): string {
    return `${JSON.stringify(archive, null, 2)}\n`;
}

function archivesEqual(left: ArchivedReplay, right: ArchivedReplay): boolean {
    return isDeepStrictEqual(
        JSON.parse(JSON.stringify(left)),
        JSON.parse(JSON.stringify(right)),
    );
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
