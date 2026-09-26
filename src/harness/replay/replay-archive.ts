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
import type { ImportedPostHogReplay, PostHogReplayEventRow } from "./posthog-replay";
import { ReleaseReplayRuntime } from "./release-replay-runtime";
import { timestampMilliseconds } from "./replay-timestamp";

export type ArchivedReplayTerminal = "finished" | "quit" | "abandoned";

export interface ArchivedReplayStepTelemetry {
    timestamp: string;
    source: "player" | "automatic";
}

export interface ArchivedReplay {
    format: 1;
    replayId: string;
    battleOutcome?: ReplayArchiveStatus;
    totalRounds?: number;
    totalDecisions?: number;
    totalElapsedTime?: string;
    totalAfkTime?: string;
    /** Accepted only for archives written by the brief numeric-summary version. */
    totalElapsedMs?: number;
    release: string;
    encounter: string;
    seed: number;
    startedAt: string;
    endedAt?: string;
    anonymousPlayerId?: string;
    sessionId?: string;
    terminal?: ArchivedReplayTerminal;
    /** One-to-one with replay.steps, in exactly the same order. */
    timingUnavailable?: boolean;
    stepTelemetry?: ArchivedReplayStepTelemetry[];
    replay: FightReplay;
}

export type ReplayArchiveStatus = BattleState | "quit" | "abandoned" | "incomplete";

export interface AddedReplay {
    replayId: string;
    anonymousPlayerId?: string;
    playerTag?: string;
    startedAt: string;
    endedAt?: string;
    encounter: string;
    status: ReplayArchiveStatus;
    actionCount: number;
    decisionCount?: number;
    rounds?: number;
    elapsedMs?: number;
    afkMs?: number;
    filename: string;
}

export interface UpdatedReplay extends AddedReplay {
    previousActionCount: number;
}

export interface UnchangedProvisionalReplay {
    replayId: string;
    anonymousPlayerId?: string;
    playerTag?: string;
    startedAt: string;
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
    now?: () => Date;
    reconstruct?: (rows: readonly PostHogReplayEventRow[], release: string) => Promise<ImportedPostHogReplay>;
}

const ABANDON_AFTER_MS = 6 * 60 * 60 * 1_000;

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
    let skippedCompleteArchives = 0;
    const runtime = options.reconstruct ? undefined : new ReleaseReplayRuntime();

    for (const metadata of remote) {
        const existing = archived.get(metadata.replayId);
        if (existing?.archive.terminal && (existing.archive.timingUnavailable || hasCompleteArchiveMetadata(existing.archive))) {
            skippedCompleteArchives += 1;
            continue;
        }
        try {
            const rows = await options.client.fetchReplayEvents(metadata.replayId);
            const imported = await (options.reconstruct
                ? options.reconstruct(rows, metadata.release)
                : runtime!.reconstruct(rows, metadata.release));
            assertMetadataMatches(metadata, imported);
            const terminal = imported.terminal
                ?? (isStaleReplay(rows, (options.now ?? (() => new Date()))())
                    ? "abandoned"
                    : undefined);
            const archive = createArchive(metadata, imported, terminal);
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
                unchangedProvisional.push(summarizeUnchanged(archive));
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
        unchanged: skippedCompleteArchives + unchangedProvisional.length,
        added,
        updated,
        unchangedProvisional,
        failed,
    };
}

function isStaleReplay(rows: readonly PostHogReplayEventRow[], now: Date): boolean {
    let newestEventTime = -Infinity;
    for (const row of rows) {
        const eventTime = Date.parse(row.timestamp);
        if (!Number.isFinite(eventTime)) {
            throw new Error(`Replay ${row.replay_id}: invalid event timestamp ${JSON.stringify(row.timestamp)}.`);
        }
        newestEventTime = Math.max(newestEventTime, eventTime);
    }
    return now.getTime() - newestEventTime >= ABANDON_AFTER_MS;
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
        || typeof value.startedAt !== "string"
        || !isRecord(value.replay) || !Array.isArray(value.replay.steps)
        || !isRecord(value.replay.initialState)) {
        throw new Error(
            `Invalid replay archive ${filename}: expected a format 1 ArchivedReplay.`,
        );
    }
    const archive = value as unknown as ArchivedReplay;
    validateArchiveTiming(archive, filename);
    return archive;
}

function createArchive(
    metadata: RemoteReplayMetadata,
    imported: ImportedPostHogReplay,
    terminal: ArchivedReplayTerminal | undefined,
): ArchivedReplay {
    const summary = deriveArchiveSummary({
        replay: imported.replay,
        terminal,
        startedAt: imported.startedAt,
        endedAt: imported.endedAt,
        stepTelemetry: imported.stepTelemetry,
    });
    return {
        format: 1,
        replayId: imported.replayId,
        battleOutcome: summary.battleOutcome,
        totalRounds: summary.totalRounds,
        totalDecisions: summary.totalDecisions,
        ...(summary.totalElapsedTime === undefined
            ? {}
            : { totalElapsedTime: summary.totalElapsedTime }),
        ...(summary.totalAfkTime === undefined
            ? {}
            : { totalAfkTime: summary.totalAfkTime }),
        release: imported.release,
        encounter: imported.encounter,
        seed: imported.seed,
        startedAt: imported.startedAt,
        ...(imported.endedAt ? { endedAt: imported.endedAt } : {}),
        ...(metadata.anonymousPlayerId
            ? { anonymousPlayerId: metadata.anonymousPlayerId }
            : {}),
        ...(metadata.sessionId ? { sessionId: metadata.sessionId } : {}),
        ...(terminal ? { terminal } : {}),
        stepTelemetry: imported.stepTelemetry,
        replay: imported.replay,
    };
}

function summarizeArchive(archive: ArchivedReplay): Omit<AddedReplay, "filename"> {
    const summary = deriveArchiveSummary(archive);
    return {
        replayId: archive.replayId,
        ...(archive.anonymousPlayerId ? { anonymousPlayerId: archive.anonymousPlayerId } : {}),
        ...(playerTag(archive.anonymousPlayerId)
            ? { playerTag: playerTag(archive.anonymousPlayerId) }
            : {}),
        startedAt: archive.startedAt,
        ...(archive.endedAt ? { endedAt: archive.endedAt } : {}),
        encounter: archive.encounter,
        status: summary.battleOutcome,
        actionCount: archive.replay.steps.length,
        ...(summary.totalDecisions === undefined ? {} : { decisionCount: summary.totalDecisions }),
        ...(summary.totalRounds === undefined ? {} : { rounds: summary.totalRounds }),
        ...(summary.elapsedMs === undefined ? {} : { elapsedMs: summary.elapsedMs }),
        ...(summary.afkMs === undefined ? {} : { afkMs: summary.afkMs }),
    };
}

function summarizeUnchanged(archive: ArchivedReplay): UnchangedProvisionalReplay {
    return {
        replayId: archive.replayId,
        ...(archive.anonymousPlayerId ? { anonymousPlayerId: archive.anonymousPlayerId } : {}),
        ...(playerTag(archive.anonymousPlayerId)
            ? { playerTag: playerTag(archive.anonymousPlayerId) }
            : {}),
        startedAt: archive.startedAt,
        encounter: archive.encounter,
        actionCount: archive.replay.steps.length,
    };
}

function serializeArchive(archive: ArchivedReplay): string {
    validateArchiveTiming(archive, "archive being written");
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
    const tag = playerTag(archive.anonymousPlayerId);
    return [date, tag, encounter, shortReplayId].filter(Boolean).join("_");
}

export function playerTag(anonymousPlayerId: string | undefined): string | undefined {
    if (!anonymousPlayerId) return undefined;
    const shortId = safeFilenamePart(anonymousPlayerId).slice(0, 8);
    return shortId ? `p-${shortId}` : undefined;
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
    parsed: ImportedPostHogReplay,
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
    const discoveredStart = timestampMilliseconds(metadata.startedAt,
        `Replay ${metadata.replayId} discovered startedAt`);
    const fetchedStart = timestampMilliseconds(parsed.startedAt,
        `Replay ${metadata.replayId} battle_started`);
    if (discoveredStart !== fetchedStart) {
        throw new Error(
            `Replay ${metadata.replayId}: discovered start timestamp ${JSON.stringify(metadata.startedAt)}, fetched ${JSON.stringify(parsed.startedAt)}.`,
        );
    }
}

function hasCompleteArchiveMetadata(archive: ArchivedReplay): boolean {
    if (archive.stepTelemetry === undefined) return false;
    const timingComplete = archive.terminal === "abandoned" || archive.endedAt !== undefined;
    const summaryComplete = archive.battleOutcome !== undefined
        && archive.totalRounds !== undefined
        && archive.totalDecisions !== undefined
        && (archive.endedAt === undefined
            || (archive.totalElapsedTime !== undefined && archive.totalAfkTime !== undefined));
    return timingComplete && summaryComplete;
}

function validateArchiveTiming(archive: ArchivedReplay, filename: string): void {
    const prefix = `Invalid replay archive ${filename}`;
    const started = timestampMilliseconds(archive.startedAt, `${prefix} startedAt`);
    let ended: number | undefined;
    if (archive.endedAt !== undefined) {
        if (typeof archive.endedAt !== "string" || archive.terminal === undefined) {
            throw new Error(`${prefix}: endedAt requires a terminal replay.`);
        }
        ended = timestampMilliseconds(archive.endedAt, `${prefix} endedAt`);
        if (ended < started) throw new Error(`${prefix}: endedAt precedes startedAt.`);
    }
    if (archive.stepTelemetry === undefined) {
        validateArchiveSummary(archive, prefix);
        return;
    }
    if (!Array.isArray(archive.stepTelemetry)
        || archive.stepTelemetry.length !== archive.replay.steps.length) {
        throw new Error(
            `${prefix}: stepTelemetry must have one entry per replay step in the same order.`,
        );
    }
    let previous = started;
    for (const [index, step] of archive.stepTelemetry.entries()) {
        if (!isRecord(step) || typeof step.timestamp !== "string"
            || (step.source !== "player" && step.source !== "automatic")) {
            throw new Error(`${prefix}: invalid stepTelemetry entry ${index + 1}.`);
        }
        const current = timestampMilliseconds(step.timestamp,
            `${prefix} stepTelemetry entry ${index + 1}`);
        if (current < started) {
            throw new Error(`${prefix}: stepTelemetry entry ${index + 1} precedes startedAt.`);
        }
        if (current < previous) {
            throw new Error(`${prefix}: stepTelemetry timestamps are not nondecreasing.`);
        }
        if (ended !== undefined && current > ended) {
            throw new Error(`${prefix}: stepTelemetry entry ${index + 1} occurs after endedAt.`);
        }
        previous = current;
    }
    validateArchiveSummary(archive, prefix);
}

interface ArchiveSummarySource {
    replay: FightReplay;
    terminal?: ArchivedReplayTerminal;
    startedAt: string;
    endedAt?: string;
    stepTelemetry?: readonly ArchivedReplayStepTelemetry[];
}

interface DerivedArchiveSummary {
    battleOutcome: ReplayArchiveStatus;
    totalRounds: number;
    totalDecisions?: number;
    totalElapsedTime?: string;
    totalAfkTime?: string;
    elapsedMs?: number;
    afkMs?: number;
    wallElapsedMs?: number;
}

function deriveArchiveSummary(archive: ArchiveSummarySource): DerivedArchiveSummary {
    const finalState = archive.replay.steps.reduce(
        (state, step) => step.success ? step.state : state,
        archive.replay.initialState,
    );
    const battleOutcome: ReplayArchiveStatus = archive.terminal === "abandoned"
        ? "abandoned"
        : archive.terminal === "quit"
            ? "quit"
            : archive.terminal === undefined
                ? "incomplete"
                : finalState.turn.outcome;
    const wallElapsedMs = archive.endedAt === undefined
        ? undefined
        : timestampMilliseconds(archive.endedAt, "Archive endedAt")
        - timestampMilliseconds(archive.startedAt, "Archive startedAt");
    const afkMs = wallElapsedMs === undefined || archive.stepTelemetry === undefined
        ? undefined
        : interActionAfkMilliseconds(archive.stepTelemetry);
    const elapsedMs = wallElapsedMs === undefined || afkMs === undefined
        ? undefined
        : wallElapsedMs - afkMs;
    return {
        battleOutcome,
        totalRounds: finalState.turn.round,
        ...(archive.stepTelemetry === undefined
            ? {}
            : { totalDecisions: archive.stepTelemetry.filter((step) => step.source === "player").length }),
        ...(elapsedMs === undefined || afkMs === undefined || wallElapsedMs === undefined
            ? {}
            : {
                elapsedMs,
                afkMs,
                wallElapsedMs,
                totalElapsedTime: formatElapsedSummary(elapsedMs, afkMs),
                totalAfkTime: formatElapsedTime(afkMs),
            }),
    };
}

const MAX_ACTIVE_INTER_ACTION_GAP_MS = 2 * 60 * 1_000;

function interActionAfkMilliseconds(
    stepTelemetry: readonly ArchivedReplayStepTelemetry[],
): number {
    let afkMs = 0;
    for (let index = 1; index < stepTelemetry.length; index++) {
        const previous = timestampMilliseconds(
            stepTelemetry[index - 1].timestamp,
            `Archive stepTelemetry entry ${index}`,
        );
        const current = timestampMilliseconds(
            stepTelemetry[index].timestamp,
            `Archive stepTelemetry entry ${index + 1}`,
        );
        afkMs += Math.max(0, current - previous - MAX_ACTIVE_INTER_ACTION_GAP_MS);
    }
    return afkMs;
}

function formatElapsedSummary(elapsedMs: number, afkMs: number): string {
    const elapsed = formatElapsedTime(elapsedMs);
    return afkMs > 0 ? `${elapsed} (+${formatElapsedTime(afkMs)} afk)` : elapsed;
}

function formatElapsedTime(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1_000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m${String(seconds).padStart(2, "0")}s`;
}

function validateArchiveSummary(archive: ArchivedReplay, prefix: string): void {
    const fields = [
        archive.battleOutcome,
        archive.totalRounds,
        archive.totalDecisions,
        archive.totalElapsedTime,
        archive.totalAfkTime,
        archive.totalElapsedMs,
    ];
    if (fields.every((field) => field === undefined)) return;
    const expected = deriveArchiveSummary(archive);
    const legacyElapsedTime = expected.wallElapsedMs === undefined
        ? undefined
        : formatElapsedTime(expected.wallElapsedMs);
    if (archive.battleOutcome !== expected.battleOutcome
        || archive.totalRounds !== expected.totalRounds
        || archive.totalDecisions !== expected.totalDecisions
        || (archive.totalElapsedTime !== undefined
            && archive.totalElapsedTime !== expected.totalElapsedTime
            && archive.totalElapsedTime !== legacyElapsedTime)
        || (archive.totalAfkTime !== undefined
            && archive.totalAfkTime !== expected.totalAfkTime)
        || (archive.totalElapsedMs !== undefined
            && archive.totalElapsedMs !== expected.wallElapsedMs)) {
        throw new Error(`${prefix}: top-level replay summary does not match replay data.`);
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
