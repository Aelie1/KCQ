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
    POSTHOG_REPLAY_COLUMNS,
    parsePostHogReplayEvents,
    reconstructFightReplay,
    type PostHogReplayEventRow,
} from "../../src/harness/replay/posthog-replay";
import {
    PostHogApiClient,
    parseQueryResponse,
    postHogConfigFromEnvironment,
    type PostHogReplayClient,
    type RemoteReplayMetadata,
} from "../../src/harness/replay/posthog-api";
import {
    syncPostHogReplays,
    writeArchivedReplay,
    type ArchivedReplay,
} from "../../src/harness/replay/replay-archive";
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
    it("skips complete archives while rechecking provisional archives and fetching new fights", async () => {
        const directory = await temporaryDirectory();
        await writeFile(
            join(directory, "filename-is-not-the-identity.json"),
            JSON.stringify(makeArchive("complete", makeReplayRows("complete"), "quit")),
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

        const first = await syncPostHogReplays({ client, replaysDirectory: directory });

        expect(client.fetched).toEqual(["provisional", "new-replay"]);
        expect(first).toMatchObject({
            found: 3,
            completeArchives: 1,
            provisionalArchives: 1,
            newFights: 1,
            unchanged: 2,
            failed: [],
        });
        expect(first.added).toHaveLength(1);
        const archiveNames = (await readdir(directory)).filter((name) => name.endsWith(".json"));
        expect(archiveNames).toHaveLength(3);
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
        expect(second).toMatchObject({
            found: 3,
            completeArchives: 1,
            provisionalArchives: 2,
            newFights: 0,
            unchanged: 3,
            added: [],
            updated: [],
            failed: [],
        });
        expect(client.fetched).toEqual(["provisional", "new-replay"]);
        expect((await readdir(directory)).filter((name) => name.endsWith(".json")))
            .toHaveLength(3);
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
                    actions: [{ type: "endTurn" }],
                    terminal,
                });
            const client = new FakeClient([metadata(replayId)], new Map([
                [replayId, terminalRows],
            ]));

            const first = await syncPostHogReplays({ client, replaysDirectory: directory });

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
            const second = await syncPostHogReplays({ client, replaysDirectory: directory });
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

    it("updates a longer incomplete replay but does not rewrite it when unchanged", async () => {
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

        const first = await syncPostHogReplays({ client, replaysDirectory: directory });
        expect(first.updated).toEqual([expect.objectContaining({
            replayId,
            status: "incomplete",
            previousActionCount: 0,
            actionCount: 1,
            filename,
        })]);
        const path = join(directory, filename);
        const modifiedAfterUpdate = (await stat(path)).mtimeMs;
        await new Promise((resolve) => setTimeout(resolve, 20));

        const second = await syncPostHogReplays({ client, replaysDirectory: directory });
        expect(second.updated).toEqual([]);
        expect(second.unchangedProvisional).toEqual([{
            replayId,
            encounter: "plains_1",
            actionCount: 1,
        }]);
        expect((await stat(path)).mtimeMs).toBe(modifiedAfterUpdate);
        expect((await readArchives(directory))[0]).not.toHaveProperty("terminal");
    });

    it("leaves a valid provisional archive untouched after divergence and continues", async () => {
        const directory = await temporaryDirectory();
        const divergentRows = makeReplayRows("bad-replay");
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

interface ReplayRowsOptions {
    actions?: PlayerAction[];
    terminal?: "finished" | "quit" | "abandoned";
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
        release: "test-release",
        encounter: "plains_1",
        seed: "12345",
        initial_state: JSON.stringify(compactStateDigest(engine.getGameView())),
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
                result.success ? result.view : engine.getGameView(),
            )),
        });
    }
    if (options.terminal) {
        const view = engine.getGameView();
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
    return { initialState: structuredClone(engine.getGameView()), steps: [] };
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
    return {
        format: 1,
        replayId,
        release: imported.release,
        encounter: imported.encounter,
        seed: imported.seed,
        startedAt: "2026-09-21T12:00:00.000Z",
        anonymousPlayerId: "anonymous-player",
        sessionId: "kcq-session",
        ...(terminalOverride ? { terminal: terminalOverride } : {}),
        replay: imported.replay,
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
