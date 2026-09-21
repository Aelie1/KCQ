import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import type { FightReplay } from "../../src/harness/harness";
import {
    POSTHOG_REPLAY_COLUMNS,
    parsePostHogReplayEvents,
    type PostHogReplayEventRow,
} from "../../src/harness/posthog-replay";
import {
    PostHogApiClient,
    parseQueryResponse,
    postHogConfigFromEnvironment,
    type PostHogReplayClient,
    type RemoteReplayMetadata,
} from "../../src/harness/posthog-api";
import {
    syncPostHogReplays,
    writeArchivedReplay,
    type ArchivedReplay,
} from "../../src/harness/replay-archive";
import { compactStateDigest } from "../../src/web/telemetry";

const temporaryDirectories: string[] = [];

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
            ],
            results: [[
                "remote-1", "0.6.3", "plains_3", "870164936",
                "2026-09-21T12:34:56.000Z", "anonymous-1", "kcq-session-1", null,
            ]],
        }));
        const client = new PostHogApiClient(config(), fetchMock);

        await expect(client.discoverReplays()).resolves.toEqual([{
            replayId: "remote-1",
            release: "0.6.3",
            encounter: "plains_3",
            seed: 870164936,
            startedAt: "2026-09-21T12:34:56.000Z",
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
    it("skips archived replay IDs, fetches only missing fights, writes once, and is idempotent", async () => {
        const directory = await temporaryDirectory();
        await writeFile(join(directory, "filename-is-not-the-identity.json"), JSON.stringify({
            format: 1,
            replayId: "already-there",
        }));
        const client = new FakeClient([
            metadata("already-there"),
            metadata("new-replay"),
        ], new Map([
            ["new-replay", makeReplayRows("new-replay")],
        ]));

        const first = await syncPostHogReplays({ client, replaysDirectory: directory });

        expect(client.fetched).toEqual(["new-replay"]);
        expect(first).toMatchObject({ found: 2, unchanged: 1, failed: [] });
        expect(first.added).toHaveLength(1);
        const archiveNames = (await readdir(directory)).filter((name) => name.endsWith(".json"));
        expect(archiveNames).toHaveLength(2);
        const addedArchive = JSON.parse(await readFile(
            join(directory, first.added[0].filename),
            "utf8",
        ));
        expect(addedArchive).toMatchObject({
            format: 1,
            replayId: "new-replay",
            release: "test-release",
            encounter: "plains_1",
            seed: 12345,
            startedAt: "2026-09-21T12:00:00.000Z",
            anonymousPlayerId: "anonymous-player",
            sessionId: "kcq-session",
            replay: { steps: [] },
        });
        expect(addedArchive).not.toHaveProperty("terminal");

        client.fetched.length = 0;
        const second = await syncPostHogReplays({ client, replaysDirectory: directory });
        expect(second).toEqual({ found: 2, unchanged: 2, added: [], failed: [] });
        expect(client.fetched).toEqual([]);
        expect((await readdir(directory)).filter((name) => name.endsWith(".json")))
            .toHaveLength(2);
    });

    it("does not archive a divergence and continues with later fights", async () => {
        const directory = await temporaryDirectory();
        const divergentRows = makeReplayRows("bad-replay");
        const state = JSON.parse(divergentRows[0].initial_state);
        state.turn.round = 999;
        divergentRows[0].initial_state = JSON.stringify(state);
        const client = new FakeClient([
            metadata("bad-replay"),
            metadata("good-replay"),
        ], new Map([
            ["bad-replay", divergentRows],
            ["good-replay", makeReplayRows("good-replay")],
        ]));

        const result = await syncPostHogReplays({ client, replaysDirectory: directory });

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
        expect(archives.map((archive) => archive.replayId)).toEqual(["good-replay"]);
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

        expect(first).toBe("2026-09-21_plains_1_abcdefgh.json");
        expect(second).toBe("2026-09-21_plains_1_abcdefgh_2.json");
        expect((await readArchives(directory)).map((archive) => archive.replayId).sort())
            .toEqual(["abcdefgh-first", "abcdefgh-second"]);
    });
});

class FakeClient implements PostHogReplayClient {
    readonly fetched: string[] = [];

    constructor(
        readonly remote: RemoteReplayMetadata[],
        readonly rows: Map<string, PostHogReplayEventRow[]>,
    ) {}

    async discoverReplays(): Promise<RemoteReplayMetadata[]> {
        return structuredClone(this.remote);
    }

    async fetchReplayEvents(replayId: string): Promise<PostHogReplayEventRow[]> {
        this.fetched.push(replayId);
        const rows = this.rows.get(replayId);
        if (!rows) throw new Error(`Missing fake replay ${replayId}.`);
        return structuredClone(rows);
    }
}

function makeReplayRows(replayId: string): PostHogReplayEventRow[] {
    const replay = emptyFightReplay();
    return [{
        ...emptyRow(),
        timestamp: "2026-09-21T12:00:00.000Z",
        event: "battle_started",
        replay_id: replayId,
        release: "test-release",
        encounter: "plains_1",
        seed: "12345",
        initial_state: JSON.stringify(compactStateDigest(replay.initialState)),
    }];
}

function emptyFightReplay(): FightReplay {
    const engine = createEngine(12345);
    for (const id of engine.listCharacters()) engine.loadCharacter(id);
    engine.loadEncounter("plains_1");
    return { initialState: structuredClone(engine.getGameView()), steps: [] };
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
        anonymousPlayerId: "anonymous-player",
        sessionId: "kcq-session",
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
