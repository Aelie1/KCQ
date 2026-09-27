import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import type { PlayerAction } from "../../src/engine/public/types";
import type { FightReplay } from "../../src/harness/harness";
import { runSingleFight } from "../../src/harness/harness";
import { firstPolicy } from "../../src/harness/policy/first";
import {
    PostHogApiClient,
    parseQueryResponse,
    postHogConfigFromEnvironment,
    type PostHogReplayClient,
    type RemoteReplayMetadata,
} from "../../src/harness/replay/posthog-api";
import {
    POSTHOG_REPLAY_COLUMNS,
    parsePostHogReplayEvents,
    reconstructFightReplay,
    type PostHogReplayEventRow,
} from "../../src/harness/replay/posthog-replay";
import {
    syncPostHogReplays as syncWithReleaseRuntime,
    writeArchivedReplay,
    type ArchivedReplay,
    type ReplaySyncOptions,
} from "../../src/harness/replay/replay-archive";
import { compactStateDigest } from "../../src/web/telemetry";
import { compareSemanticVersions } from "../../src/harness/replay/semantic-version";

const temporaryDirectories: string[] = [];
const RECENT_NOW = new Date("2026-09-21T13:00:00.000Z");
const STALE_NOW = new Date("2026-09-22T00:00:00.000Z");

// Archive behavior uses a synthetic current-engine release; runtime selection has separate tests.
function syncPostHogReplays(options: ReplaySyncOptions) {
    return syncWithReleaseRuntime({
        ...options,
        reconstruct: async (rows) => reconstructFightReplay(parsePostHogReplayEvents(rows)),
    });
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true })));
});

describe("PostHog replay API", () => {
    it("discovers distinct replay metadata with the supported HogQL endpoint and bearer auth", async () => {
        const fetchMock = vi.fn(async (
            _input: string | URL | Request,
            _init?: RequestInit,
        ) => response({
            columns: [
                "replay_id", "release", "encounter", "seed", "started_at",
                "anonymous_player_id", "kcq_session_id", "posthog_session_id",
                "latest_event_at", "terminal", "current_round", "action_count",
            ],
            results: [[
                "remote-1", "0.6.3", "plains_3", "870164936",
                "2026-09-21T12:34:56.000Z", "anonymous-1", "kcq-session-1", null,
                "2026-09-21T12:40:00.000Z", "quit", 3, 12,
            ]],
        }));
        const client = new PostHogApiClient(config(), fetchMock);

        await expect(client.discoverReplays()).resolves.toEqual([{
            replayId: "remote-1",
            release: "0.6.3",
            encounter: "plains_3",
            seed: 870164936,
            startedAt: "2026-09-21T12:34:56.000Z",
            latestEventAt: "2026-09-21T12:40:00.000Z",
            terminal: "quit",
            round: 3,
            actionCount: 12,
            anonymousPlayerId: "anonymous-1",
            sessionId: "kcq-session-1",
        }]);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://us.posthog.com/api/projects/123/query/");
        expect(init?.headers).toMatchObject({ Authorization: "Bearer test-secret" });
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
            query: { kind: "HogQLQuery" },
            name: "kcq_replay_discovery",
            refresh: "force_blocking",
        });
        expect(body.query.query).toContain("GROUP BY replay_id");
        expect(body.query.query).toContain("max(timestamp) AS latest_event_at");
        expect(body.query.query).toContain("properties.current_state");
        expect(body.query.query).toContain("countIf(event = 'battle_action')");
    });

    it("converts fetched query values into the existing ParsedPostHogReplay shape", async () => {
        const rows = makeReplayRows("api-replay");
        const fetchMock = vi.fn(async (
            _input: string | URL | Request,
            _init?: RequestInit,
        ) => response({
            columns: [...POSTHOG_REPLAY_COLUMNS],
            results: rows.map((row) => POSTHOG_REPLAY_COLUMNS.map((column) => {
                const value = row[column];
                if (["initial_state", "state_after", "final_state", "current_state"].includes(column)
                    && value) return JSON.parse(value);
                return value;
            })),
        }));
        const client = new PostHogApiClient(config(), fetchMock);

        const fetched = await client.fetchReplayEvents("api-replay");
        const parsed = parsePostHogReplayEvents(fetched);

        expect(parsed).toMatchObject({
            replayId: "api-replay",
            release: "test-release",
            encounter: "plains_1",
            seed: 12345,
            actions: [],
        });
        const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
        expect(body.query.query).toContain("properties.replay_id) = 'api-replay'");
    });

    it("rejects malformed API responses", () => {
        expect(() => parseQueryResponse({ results: [] }))
            .toThrow("expected columns and results arrays");
        expect(() => parseQueryResponse({ columns: ["one"], results: [[1, 2]] }))
            .toThrow("row 1: expected 1 values");
        expect(() => parseQueryResponse({ columns: ["one", "one"], results: [] }))
            .toThrow("duplicate column names");
    });

    it("requires read credentials without exposing their value", () => {
        expect(() => postHogConfigFromEnvironment({}))
            .toThrow("POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID");
        expect(() => postHogConfigFromEnvironment({
            POSTHOG_PERSONAL_API_KEY: "super-secret",
            POSTHOG_PROJECT_ID: "not-numeric",
        })).toThrow("numeric project ID");
    });
});

describe("PostHog replay archive sync", () => {
    it("compares releases using semantic-version precedence", () => {
        expect(compareSemanticVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
        expect(compareSemanticVersions("0.8.1-beta.2", "0.8.1-beta.10")).toBeLessThan(0);
        expect(compareSemanticVersions("v0.8.1+build.7", "0.8.1")).toBe(0);
    });

    it("prunes an old archive before strict summary validation", async () => {
        const directory = await temporaryDirectory();
        const archive = makeArchive("old-local", makeReplayRows("old-local", {
            actions: [{ type: "endTurn" }, { type: "endTurn" }],
            terminal: "quit",
            release: "0.8.0",
        }));
        await writeFile(join(directory, "old-invalid.json"), JSON.stringify({
            ...archive,
            totalRounds: 999,
        }));
        const client = new FakeClient([], new Map());

        const result = await syncPostHogReplays({
            client,
            replaysDirectory: directory,
            minimumRelease: "0.8.1",
        });

        expect(result.prunedArchives).toBe(1);
        expect(await readdir(directory)).toEqual([]);
    });

    it("does not fetch remote releases below the semantic minimum", async () => {
        const directory = await temporaryDirectory();
        const replayId = "old-remote";
        const rows = makeReplayRows(replayId, {
            actions: [{ type: "endTurn" }, { type: "endTurn" }],
            terminal: "quit",
            release: "0.8.0",
        });
        const client = new FakeClient([metadata(replayId)], new Map([[replayId, rows]]));

        const result = await syncPostHogReplays({
            client,
            replaysDirectory: directory,
            minimumRelease: "0.8.1",
        });

        expect(result.belowMinimumRelease).toBe(1);
        expect(client.fetched).toEqual([]);
    });

    it.each([0, 1])("does not fetch a terminal replay ending after %i end turns", async (turns) => {
        const directory = await temporaryDirectory();
        const replayId = `terminal-round-${turns + 1}`;
        const rows = makeReplayRows(replayId, {
            actions: Array.from({ length: turns }, () => ({ type: "endTurn" as const })),
            terminal: "quit",
        });
        const client = new FakeClient([metadata(replayId)], new Map([[replayId, rows]]));

        const result = await syncPostHogReplays({ client, replaysDirectory: directory });

        expect(result.trivialIgnored).toBe(1);
        expect(client.fetched).toEqual([]);
    });

    it("fetches and archives a terminal round-3 replay", async () => {
        const directory = await temporaryDirectory();
        const replayId = "terminal-round-3";
        const rows = makeReplayRows(replayId, {
            actions: [{ type: "endTurn" }, { type: "endTurn" }],
            terminal: "quit",
        });
        const client = new FakeClient([metadata(replayId)], new Map([[replayId, rows]]));

        const result = await syncPostHogReplays({ client, replaysDirectory: directory });

        expect(client.fetched).toEqual([replayId]);
        expect(result.fetched).toBe(1);
        expect(result.added).toEqual([expect.objectContaining({ replayId, rounds: 3 })]);
    });

    it("defers a recent active round-3 replay without fetching", async () => {
        const directory = await temporaryDirectory();
        const replayId = "active-round-3";
        const rows = makeReplayRows(replayId, {
            actions: [{ type: "endTurn" }, { type: "endTurn" }],
        });
        const client = new FakeClient([metadata(replayId)], new Map([[replayId, rows]]));

        const result = await syncPostHogReplays({
            client,
            replaysDirectory: directory,
            now: () => RECENT_NOW,
        });

        expect(result.activeDeferred).toBe(1);
        expect(client.fetched).toEqual([]);
        expect(await readdir(directory)).toEqual([]);
    });

    it("fetches a stale round-3 replay once and archives it as abandoned", async () => {
        const directory = await temporaryDirectory();
        const replayId = "stale-round-3";
        const rows = makeReplayRows(replayId, {
            actions: [{ type: "endTurn" }, { type: "endTurn" }],
        });
        const client = new FakeClient([metadata(replayId)], new Map([[replayId, rows]]));

        const first = await syncPostHogReplays({
            client,
            replaysDirectory: directory,
            now: () => STALE_NOW,
        });
        client.fetched.length = 0;
        const second = await syncPostHogReplays({
            client,
            replaysDirectory: directory,
            now: () => STALE_NOW,
        });

        expect(first.added).toEqual([expect.objectContaining({ replayId, status: "abandoned" })]);
        expect(client.discoveries).toBe(2);
        expect(client.fetched).toEqual([]);
        expect(second.unchanged).toBe(1);
    });

    it.each([
        ["younger than six hours", "2026-09-21T18:00:01.000Z", "activeDeferred"],
        ["exactly six hours old", "2026-09-21T18:00:00.000Z", "trivialIgnored"],
        ["older than six hours", "2026-09-21T17:59:59.000Z", "trivialIgnored"],
    ] as const)("classifies a below-threshold provisional replay that is %s without fetching", async (
        _age,
        latestTimestamp,
        expectedCount,
    ) => {
        const directory = await temporaryDirectory();
        const replayId = "stale-replay";
        const filename = await writeArchivedReplay(
            directory,
            makeArchive(replayId, makeReplayRows(replayId)),
        );
        const rows = makeReplayRows(replayId, { actions: [{ type: "endTurn" }] });
        rows[1].timestamp = latestTimestamp;
        rows.reverse();
        const client = new FakeClient([metadata(replayId)], new Map([[replayId, rows]]));

        const first = await syncPostHogReplays({
            client,
            replaysDirectory: directory,
            now: () => STALE_NOW,
        });

        expect(first.failed).toEqual([]);
        expect(first.updated).toEqual([]);
        expect(first[expectedCount]).toBe(1);
        expect(client.fetched).toEqual([]);
        expect((await readArchives(directory))[0].terminal).toBeUndefined();
        expect((await readdir(directory))).toContain(filename);

        client.fetched.length = 0;
        const second = await syncPostHogReplays({
            client,
            replaysDirectory: directory,
            now: () => STALE_NOW,
        });
        expect(client.fetched).toEqual([]);
        expect(second[expectedCount]).toBe(1);
        expect(second.updated).toEqual([]);
    });

    it("ignores a stale replay below round 3 without fetching or archiving", async () => {
        const directory = await temporaryDirectory();
        const replayId = "empty-stale-replay";
        const client = new FakeClient([metadata(replayId)], new Map([
            [replayId, makeReplayRows(replayId)],
        ]));

        const result = await syncPostHogReplays({
            client,
            replaysDirectory: directory,
            now: () => STALE_NOW,
        });

        expect(result.added).toEqual([]);
        expect(result.trivialIgnored).toBe(1);
        expect(client.fetched).toEqual([]);
        expect(await readdir(directory)).toEqual([]);
    });

    it("skips complete archives and defers recent provisional and new fights", async () => {
        const directory = await temporaryDirectory();
        await writeFile(
            join(directory, "filename-is-not-the-identity.json"),
            JSON.stringify(makeArchive("complete", makeReplayRows("complete", { terminal: "quit" }))),
        );
        await writeArchivedReplay(
            directory,
            makeArchive("provisional", makeReplayRows("provisional")),
        );
        const client = new FakeClient([
            metadata("complete"),
            metadata("provisional"),
            metadata("new-replay"),
        ], new Map([
            ["provisional", makeReplayRows("provisional")],
            ["new-replay", makeReplayRows("new-replay")],
        ]));

        const first = await syncPostHogReplays({ client, replaysDirectory: directory, now: () => RECENT_NOW });

        expect(client.fetched).toEqual([]);
        expect(first).toMatchObject({
            found: 3,
            completeArchives: 1,
            provisionalArchives: 1,
            newFights: 1,
            activeDeferred: 2,
            unchanged: 1,
            failed: [],
        });
        expect(first.added).toHaveLength(0);
        const archiveNames = (await readdir(directory)).filter((name) => name.endsWith(".json"));
        expect(archiveNames).toHaveLength(2);

        client.fetched.length = 0;
        const second = await syncPostHogReplays({ client, replaysDirectory: directory, now: () => RECENT_NOW });
        expect(second).toMatchObject({
            found: 3,
            completeArchives: 1,
            provisionalArchives: 1,
            newFights: 1,
            activeDeferred: 2,
            unchanged: 1,
            added: [],
            updated: [],
            failed: [],
        });
        expect(client.fetched).toEqual([]);
        expect((await readdir(directory)).filter((name) => name.endsWith(".json")))
            .toHaveLength(2);
    });

    it("backfills one completed legacy archive in place, then skips it", async () => {
        const directory = await temporaryDirectory();
        const replayId = "legacy-complete";
        const rows = makeReplayRows(replayId, {
            actions: [{ type: "endTurn" }, { type: "endTurn" }],
            terminal: "quit",
        });
        const current = makeArchive(replayId, rows);
        const {
            endedAt: _endedAt,
            stepTelemetry: _stepTelemetry,
            battleOutcome: _battleOutcome,
            totalRounds: _totalRounds,
            totalDecisions: _totalDecisions,
            totalElapsedTime: _totalElapsedTime,
            totalAfkTime: _totalAfkTime,
            totalElapsedMs: _legacyTotalElapsedMs,
            ...legacy
        } = current;
        const filename = await writeArchivedReplay(directory, legacy);
        const client = new FakeClient([metadata(replayId)], new Map([[replayId, rows]]));

        const first = await syncPostHogReplays({ client, replaysDirectory: directory });

        expect(client.fetched).toEqual([replayId]);
        expect(first.updated).toEqual([expect.objectContaining({ replayId, filename })]);
        const [backfilled] = await readArchives(directory);
        expect(backfilled.endedAt).toBe("2026-09-21T12:59:59.000Z");
        expect(backfilled).toMatchObject({
            battleOutcome: "quit",
            totalRounds: 3,
            totalDecisions: 2,
            totalElapsedTime: "59m59s",
            totalAfkTime: "0m00s",
        });
        expect(backfilled.stepTelemetry).toHaveLength(2);

        client.fetched.length = 0;
        const second = await syncPostHogReplays({ client, replaysDirectory: directory });
        expect(client.fetched).toEqual([]);
        expect(second.updated).toEqual([]);
        expect(second.unchanged).toBe(1);
    });

    it("caps inter-action elapsed time at two minutes and reports the excess as AFK", async () => {
        const directory = await temporaryDirectory();
        const replayId = "afk-replay";
        const rows = makeReplayRows(replayId, {
            actions: [{ type: "endTurn" }, { type: "endTurn" }],
            terminal: "quit",
        });
        rows.find((row) => row.sequence === "1")!.timestamp = "2026-09-21T12:01:00.000Z";
        rows.find((row) => row.sequence === "2")!.timestamp = "2026-09-21T12:06:00.000Z";
        rows.find((row) => row.event === "battle_quit")!.timestamp = "2026-09-21T12:10:00.000Z";
        const client = new FakeClient([metadata(replayId)], new Map([[replayId, rows]]));

        const result = await syncPostHogReplays({ client, replaysDirectory: directory });

        expect(result.failed).toEqual([]);
        const [archive] = await readArchives(directory);
        expect(archive).toMatchObject({
            totalElapsedTime: "7m00s (+3m00s afk)",
            totalAfkTime: "3m00s",
        });
        expect(result.added[0]).toMatchObject({ elapsedMs: 420_000, afkMs: 180_000 });
    });

    it("skips a completed archive that already contains aligned timing metadata", async () => {
        const directory = await temporaryDirectory();
        const replayId = "timed-complete";
        const rows = makeReplayRows(replayId, {
            actions: [{ type: "endTurn" }, { type: "endTurn" }],
            terminal: "quit",
            release: "0.8.1",
        });
        await writeArchivedReplay(directory, makeArchive(replayId, rows));
        const client = new FakeClient([metadata(replayId)], new Map([[replayId, rows]]));

        const result = await syncPostHogReplays({
            client,
            replaysDirectory: directory,
            minimumRelease: "0.8.1",
        });

        expect(client.fetched).toEqual([]);
        expect(result.unchanged).toBe(1);
        expect(result.updated).toEqual([]);
    });

    it("rejects archive step telemetry that is not aligned with replay steps", async () => {
        const directory = await temporaryDirectory();
        const replayId = "misaligned-archive";
        const rows = makeReplayRows(replayId, { actions: [{ type: "endTurn" }] });
        const archive = makeArchive(replayId, rows);

        await expect(writeArchivedReplay(directory, { ...archive, stepTelemetry: [] }))
            .rejects.toThrow("stepTelemetry must have one entry per replay step in the same order");
        await expect(writeArchivedReplay(directory, {
            ...archive,
            stepTelemetry: [{ timestamp: "2026-09-21T11:59:59.000Z", source: "player" }],
        })).rejects.toThrow("stepTelemetry entry 1 precedes startedAt");
        await expect(writeArchivedReplay(directory, { ...archive, totalRounds: 999 }))
            .rejects.toThrow("top-level replay summary does not match replay data");
    });

    it.each(["finished", "quit", "abandoned"] as const)(
        "atomically updates a provisional replay that becomes %s and then skips it",
        async (terminal) => {
            const directory = await temporaryDirectory();
            const replayId = `${terminal}-replay`;
            const initialRows = makeReplayRows(replayId);
            const filename = await writeArchivedReplay(
                directory,
                makeArchive(replayId, initialRows),
            );
            const terminalRows = terminal === "finished"
                ? makeFinishedReplayRows(replayId)
                : makeReplayRows(replayId, {
                    actions: [{ type: "endTurn" }, { type: "endTurn" }],
                    terminal,
                });
            const client = new FakeClient([metadata(replayId)], new Map([
                [replayId, terminalRows],
            ]));

            const first = await syncPostHogReplays({ client, replaysDirectory: directory, now: () => STALE_NOW });

            expect(first.updated).toHaveLength(1);
            expect(first.updated[0]).toMatchObject({
                replayId,
                filename,
                status: terminal === "finished" ? expect.stringMatching(/victory|defeat/u) : terminal,
            });
            expect(first.added).toEqual([]);
            expect((await readdir(directory)).filter((name) => name.endsWith(".json")))
                .toEqual([filename]);
            expect((await readArchives(directory))[0].terminal).toBe(terminal);

            client.fetched.length = 0;
            const second = await syncPostHogReplays({ client, replaysDirectory: directory, now: () => STALE_NOW });
            expect(second).toMatchObject({
                completeArchives: 1,
                provisionalArchives: 0,
                unchanged: 1,
                added: [],
                updated: [],
                failed: [],
            });
            expect(client.fetched).toEqual([]);
        },
    );

    it("does not update a recent active provisional replay", async () => {
        const directory = await temporaryDirectory();
        const replayId = "growing-replay";
        const filename = await writeArchivedReplay(
            directory,
            makeArchive(replayId, makeReplayRows(replayId)),
        );
        const longerRows = makeReplayRows(replayId, {
            actions: [{ type: "endTurn" }],
        });
        const client = new FakeClient([metadata(replayId)], new Map([
            [replayId, longerRows],
        ]));

        const first = await syncPostHogReplays({ client, replaysDirectory: directory, now: () => RECENT_NOW });
        expect(first.updated).toEqual([]);
        expect(first.activeDeferred).toBe(1);
        expect(client.fetched).toEqual([]);
        const path = join(directory, filename);
        const modifiedAfterUpdate = (await stat(path)).mtimeMs;
        await new Promise((resolve) => setTimeout(resolve, 20));

        const second = await syncPostHogReplays({ client, replaysDirectory: directory, now: () => RECENT_NOW });
        expect(second.updated).toEqual([]);
        expect(second.activeDeferred).toBe(1);
        expect(second.unchangedProvisional).toEqual([]);
        expect((await stat(path)).mtimeMs).toBe(modifiedAfterUpdate);
        expect((await readArchives(directory))[0]).not.toHaveProperty("terminal");
    });

    it("leaves a valid provisional archive untouched after divergence and continues", async () => {
        const directory = await temporaryDirectory();
        const divergentRows = makeReplayRows("bad-replay", {
            actions: [{ type: "endTurn" }, { type: "endTurn" }],
            terminal: "quit",
        });
        const state = JSON.parse(divergentRows[0].initial_state);
        state.turn.round = 999;
        divergentRows[0].initial_state = JSON.stringify(state);
        const badFilename = await writeArchivedReplay(
            directory,
            makeArchive("bad-replay", makeReplayRows("bad-replay")),
        );
        const originalBadArchive = await readFile(join(directory, badFilename), "utf8");
        const client = new FakeClient([
            metadata("bad-replay"),
            metadata("good-replay"),
        ], new Map([
            ["bad-replay", divergentRows],
            ["good-replay", makeReplayRows("good-replay", {
                actions: [{ type: "endTurn" }, { type: "endTurn" }],
                terminal: "quit",
            })],
        ]));

        const result = await syncPostHogReplays({ client, replaysDirectory: directory, now: () => RECENT_NOW });

        expect(client.fetched).toEqual(["bad-replay", "good-replay"]);
        expect(result.added.map((added) => added.replayId)).toEqual(["good-replay"]);
        expect(result.failed).toHaveLength(1);
        expect(result.failed[0]).toMatchObject({
            replayId: "bad-replay",
            release: "test-release",
            encounter: "plains_1",
        });
        expect(result.failed[0].message).toMatch(/Replay bad-replay: initial_state diverged: \$\.turn\.round/);
        const archives = await readArchives(directory);
        expect(archives.map((archive) => archive.replayId).sort())
            .toEqual(["bad-replay", "good-replay"]);
        expect(await readFile(join(directory, badFilename), "utf8"))
            .toBe(originalBadArchive);
    });

    it("uses exclusive collision-safe filenames", async () => {
        const directory = await temporaryDirectory();
        const replay = emptyFightReplay();
        const common = {
            format: 1 as const,
            release: "test-release",
            encounter: "plains_1",
            seed: 12345,
            startedAt: "2026-09-21T12:00:00.000Z",
            anonymousPlayerId: "a8ab0723-player",
            replay,
        };

        const first = await writeArchivedReplay(directory, {
            ...common,
            replayId: "abcdefgh-first",
        });
        const second = await writeArchivedReplay(directory, {
            ...common,
            replayId: "abcdefgh-second",
        });

        const withoutPlayer = await writeArchivedReplay(directory, {
            ...common,
            anonymousPlayerId: undefined,
            replayId: "ijklmnop-third",
        });

        expect(first).toBe("2026-09-21_p-a8ab0723_plains_1_abcdefgh.json");
        expect(second).toBe("2026-09-21_p-a8ab0723_plains_1_abcdefgh_2.json");
        expect(withoutPlayer).toBe("2026-09-21_plains_1_ijklmnop.json");
        expect((await readArchives(directory)).map((archive) => archive.replayId).sort())
            .toEqual(["abcdefgh-first", "abcdefgh-second", "ijklmnop-third"]);
    });

    it("counts excess time before the first action as AFK", async () => {
        const directory = await temporaryDirectory();
        const replayId = "initial-afk-replay";
        const rows = makeReplayRows(replayId, {
            actions: [{ type: "endTurn" }, { type: "endTurn" }],
            terminal: "quit",
        });

        rows.find((row) => row.sequence === "1")!.timestamp =
            "2026-09-21T12:36:00.000Z";
        rows.find((row) => row.sequence === "2")!.timestamp =
            "2026-09-21T12:36:30.000Z";
        rows.find((row) => row.event === "battle_quit")!.timestamp =
            "2026-09-21T12:37:00.000Z";

        const client = new FakeClient(
            [metadata(replayId)],
            new Map([[replayId, rows]]),
        );

        const result = await syncPostHogReplays({
            client,
            replaysDirectory: directory,
        });

        expect(result.failed).toEqual([]);

        const [archive] = await readArchives(directory);

        // 36-minute initial gap - 2 minutes allowed active time = 34 minutes AFK.
        expect(archive).toMatchObject({
            totalElapsedTime: "3m00s (+34m00s afk)",
            totalAfkTime: "34m00s",
        });

        expect(result.added[0]).toMatchObject({
            elapsedMs: 180_000,
            afkMs: 2_040_000,
        });
    });

    it("skips a completed archive explicitly marked timing unavailable", async () => {
        const directory = await temporaryDirectory();
        const replayId = "legacy-no-timing";
        const rows = makeReplayRows(replayId, {
            actions: [{ type: "endTurn" }],
            terminal: "quit",
        });

        const archive = makeArchive(replayId, rows);

        const legacy: ArchivedReplay = {
            ...archive,
            timingUnavailable: true,
            endedAt: undefined,
            stepTelemetry: undefined,
            totalDecisions: undefined,
            totalElapsedTime: undefined,
            totalAfkTime: undefined,
            totalElapsedMs: undefined,
        };

        await writeArchivedReplay(directory, legacy);

        const client = new FakeClient(
            [metadata(replayId)],
            new Map([[replayId, rows]]),
        );

        const result = await syncPostHogReplays({
            client,
            replaysDirectory: directory,
        });

        expect(client.fetched).toEqual([]);
        expect(result.updated).toEqual([]);
        expect(result.failed).toEqual([]);
        expect(result.unchanged).toBe(1);
    });
});

class FakeClient implements PostHogReplayClient {
    readonly fetched: string[] = [];
    discoveries = 0;

    constructor(
        readonly remote: RemoteReplayMetadata[],
        readonly rows: Map<string, PostHogReplayEventRow[]>,
    ) { }

    async discoverReplays(): Promise<RemoteReplayMetadata[]> {
        this.discoveries += 1;
        return structuredClone(this.remote.map((item) => {
            const rows = this.rows.get(item.replayId);
            return rows ? metadataFromRows(item, rows) : item;
        }));
    }

    async fetchReplayEvents(replayId: string): Promise<PostHogReplayEventRow[]> {
        this.fetched.push(replayId);
        const rows = this.rows.get(replayId);
        if (!rows) throw new Error(`Missing fake replay ${replayId}.`);
        return structuredClone(rows);
    }
}

interface ReplayRowsOptions {
    actions?: PlayerAction[];
    terminal?: "finished" | "quit" | "abandoned";
    release?: string;
}

function makeReplayRows(
    replayId: string,
    options: ReplayRowsOptions = {},
): PostHogReplayEventRow[] {
    const engine = loadedEngine();
    const rows: PostHogReplayEventRow[] = [{
        ...emptyRow(),
        timestamp: "2026-09-21T12:00:00.000Z",
        event: "battle_started",
        replay_id: replayId,
        release: options.release ?? "test-release",
        encounter: "plains_1",
        seed: "12345",
        initial_state: JSON.stringify(compactStateDigest(engine.getGameState())),
    }];
    for (const [index, action] of (options.actions ?? []).entries()) {
        const result = engine.executeAction(structuredClone(action));
        rows.push({
            ...emptyRow(),
            timestamp: `2026-09-21T12:00:${String(index + 1).padStart(2, "0")}.000Z`,
            event: "battle_action",
            replay_id: replayId,
            sequence: String(index + 1),
            source: "player",
            action: JSON.stringify(action),
            success: String(result.success),
            failure_reason: result.success ? "" : result.reason,
            state_after: JSON.stringify(compactStateDigest(
                result.success ? result.frames.at(-1)!.state : engine.getGameState(),
            )),
        });
    }
    if (options.terminal) {
        const view = engine.getGameState();
        const finished = options.terminal === "finished";
        if (finished && view.turn.outcome === "ongoing") {
            throw new Error("Synthetic finished replay has an ongoing outcome.");
        }
        rows.push({
            ...emptyRow(),
            timestamp: "2026-09-21T12:59:59.000Z",
            event: finished ? "battle_finished" : `battle_${options.terminal}`,
            replay_id: replayId,
            outcome: finished ? view.turn.outcome : "",
            action_count: String(options.actions?.length ?? 0),
            final_state: finished ? JSON.stringify(compactStateDigest(view)) : "",
            current_state: finished ? "" : JSON.stringify(compactStateDigest(view)),
        });
    }
    return rows;
}

function emptyFightReplay(): FightReplay {
    const engine = loadedEngine();
    return { initialState: structuredClone(engine.getGameState()), initialActions: structuredClone(engine.getActionView()), steps: [] };
}

function loadedEngine() {
    const engine = createEngine(12345);
    for (const id of engine.listCharacters()) engine.loadCharacter(id);
    engine.loadEncounter("plains_1");
    return engine;
}

function makeFinishedReplayRows(replayId: string): PostHogReplayEventRow[] {
    const result = runSingleFight({
        encounterId: "plains_1",
        engineSeed: 12345,
        policySeed: 0,
        maxActions: 1_000,
        policy: firstPolicy,
    });
    if (result.termination !== "victory" && result.termination !== "defeat") {
        throw new Error(`Synthetic fight did not terminate: ${result.termination}.`);
    }
    return makeReplayRows(replayId, {
        actions: result.trace,
        terminal: "finished",
    });
}

function makeArchive(
    replayId: string,
    rows: PostHogReplayEventRow[],
    terminalOverride?: ArchivedReplay["terminal"],
): ArchivedReplay {
    const imported = reconstructFightReplay(parsePostHogReplayEvents(rows));
    const terminal = terminalOverride ?? imported.terminal;
    const finalState = imported.replay.steps.reduce(
        (state, step) => step.success ? step.state : state,
        imported.replay.initialState,
    );
    const battleOutcome = terminal === "abandoned"
        ? "abandoned"
        : terminal === "quit"
            ? "quit"
            : terminal === undefined
                ? "incomplete"
                : finalState.turn.outcome;
    return {
        format: 1,
        replayId,
        battleOutcome,
        totalRounds: finalState.turn.round,
        totalDecisions: imported.stepTelemetry.filter((step) => step.source === "player").length,
        ...archiveElapsedSummary(imported),
        release: imported.release,
        encounter: imported.encounter,
        seed: imported.seed,
        startedAt: imported.startedAt,
        ...(imported.endedAt ? { endedAt: imported.endedAt } : {}),
        anonymousPlayerId: "anonymous-player",
        sessionId: "kcq-session",
        ...(terminal ? { terminal } : {}),
        stepTelemetry: imported.stepTelemetry,
        replay: imported.replay,
    };
}

function formatElapsedTime(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1_000);
    return `${Math.floor(totalSeconds / 60)}m${String(totalSeconds % 60).padStart(2, "0")}s`;
}

function archiveElapsedSummary(imported: ReturnType<typeof reconstructFightReplay>): {
    totalElapsedTime?: string;
    totalAfkTime?: string;
} {
    if (!imported.endedAt) return {};
    let afkMs = 0;
    for (let index = 1; index < imported.stepTelemetry.length; index++) {
        const gap = Date.parse(imported.stepTelemetry[index].timestamp)
            - Date.parse(imported.stepTelemetry[index - 1].timestamp);
        afkMs += Math.max(0, gap - 2 * 60 * 1_000);
    }
    const wallElapsedMs = Date.parse(imported.endedAt) - Date.parse(imported.startedAt);
    const elapsed = formatElapsedTime(wallElapsedMs - afkMs);
    return {
        totalElapsedTime: afkMs > 0
            ? `${elapsed} (+${formatElapsedTime(afkMs)} afk)`
            : elapsed,
        totalAfkTime: formatElapsedTime(afkMs),
    };
}

function emptyRow(): PostHogReplayEventRow {
    return Object.fromEntries(
        POSTHOG_REPLAY_COLUMNS.map((column) => [column, ""]),
    ) as PostHogReplayEventRow;
}

function metadata(replayId: string): RemoteReplayMetadata {
    return {
        replayId,
        release: "test-release",
        encounter: "plains_1",
        seed: 12345,
        startedAt: "2026-09-21T12:00:00.000Z",
        latestEventAt: "2026-09-21T12:00:00.000Z",
        round: 1,
        actionCount: 0,
        anonymousPlayerId: "anonymous-player",
        sessionId: "kcq-session",
    };
}

function metadataFromRows(
    base: RemoteReplayMetadata,
    rows: readonly PostHogReplayEventRow[],
): RemoteReplayMetadata {
    let round = 1;
    for (const row of rows) {
        for (const state of [row.state_after, row.final_state, row.current_state]) {
            if (!state) continue;
            round = Math.max(round, Number(JSON.parse(state).turn.round));
        }
    }
    const terminalEvent = [...rows].reverse().find((row) => [
        "battle_finished", "battle_quit", "battle_abandoned",
    ].includes(row.event));
    const terminal = terminalEvent?.event.replace("battle_", "") as RemoteReplayMetadata["terminal"];
    return {
        ...base,
        release: rows.find((row) => row.event === "battle_started")!.release,
        latestEventAt: [...rows]
            .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
            .at(-1)!.timestamp,
        ...(terminal ? { terminal } : {}),
        round,
        actionCount: rows.filter((row) => row.event === "battle_action").length,
    };
}

function config() {
    return {
        personalApiKey: "test-secret",
        projectId: "123",
        apiHost: "https://us.posthog.com",
    };
}

function response(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "kcq-replays-"));
    temporaryDirectories.push(directory);
    return directory;
}

async function readArchives(directory: string): Promise<ArchivedReplay[]> {
    const filenames = (await readdir(directory)).filter((name) => name.endsWith(".json"));
    return Promise.all(filenames.map(async (filename) =>
        JSON.parse(await readFile(join(directory, filename), "utf8")) as ArchivedReplay));
}
