import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PostHogReplayClient } from "../../src/harness/replay/posthog-api";
import { parsePostHogReplayEvents, reconstructFightReplay, type PostHogReplayEventRow } from "../../src/harness/replay/posthog-replay";
import { ReleaseReplayRuntime } from "../../src/harness/replay/release-replay-runtime";
import { syncPostHogReplays } from "../../src/harness/replay/replay-archive";

const root = process.cwd();
const fixturePath = join(root, "tests", "fixtures", "replay-0.7.3-fairy.json");
let hasTag = false;
try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", "refs/tags/0.7.3"], { cwd: root });
    hasTag = true;
} catch { /* Shallow checkouts can run the other tests without network. */ }
let hasTimingTag = false;
try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", "refs/tags/1.2.0"], { cwd: root });
    hasTimingTag = true;
} catch { /* Historical timing coverage also runs without fetching tags. */ }

async function fixture(): Promise<PostHogReplayEventRow[]> {
    const rows = JSON.parse(
        await readFile(fixturePath, "utf8"),
    ) as PostHogReplayEventRow[];

    const started = rows.find((row) => row.event === "battle_started");
    if (started) {
        started.difficulty = "standard";
    }

    return rows;
}

describe("release replay runtime", () => {
    it.skipIf(!hasTimingTag)("normalizes timestamps before the unchanged 1.2.0 parser and during enrichment", async () => {
        // Four endTurn actions captured from the tagged 1.2.0 engine in tower_1.
        const rows = JSON.parse(await readFile(
            join(root, "tests", "fixtures", "replay-1.2.0-timing.json"), "utf8",
        )) as PostHogReplayEventRow[];
        const original = structuredClone(rows);
        const runtime = new ReleaseReplayRuntime(root, false);
        const imported = await runtime.reconstruct(rows, "1.2.0");
        expect(imported.release).toBe("1.2.0");
        expect(imported.replay.steps).toHaveLength(4);
        expect(imported.stepTelemetry.map((step) => step.timestamp)).toEqual([
            rows[1].timestamp, rows[2].timestamp, rows[3].timestamp, rows[3].timestamp,
        ]);
        expect(rows).toEqual(original);

        // Passing the raw rows directly must still reproduce the old failure.
        expect(() => execFileSync(process.execPath, [
            join(root, "src", "harness", "replay", "release-replay-runner.cjs"),
            join(root, ".replay-runtimes", "1.2.0"), "1.2.0",
        ], { cwd: root, input: JSON.stringify(rows), stdio: ["pipe", "pipe", "pipe"] }))
            .toThrow("action timestamp at sequence 4 precedes the previous action");

        rows[1].timestamp = "2026-09-21T11:59:59.000Z";
        rows[2].timestamp = rows[3].timestamp;
        rows[4].timestamp = "2026-09-21T12:02:00.000Z";
        const bounded = await runtime.reconstruct(rows, "1.2.0");
        expect(bounded.stepTelemetry.map((step) => step.timestamp)).toEqual([
            rows[0].timestamp, rows[3].timestamp, rows[3].timestamp, rows[5].timestamp,
        ]);
        expect(bounded.replay).toEqual(imported.replay);

        const corrupt = structuredClone(rows);
        const state = JSON.parse(corrupt[4].state_after);
        state.turn.round = 999;
        corrupt[4].state_after = JSON.stringify(state);
        await expect(runtime.reconstruct(corrupt, "1.2.0")).rejects.toThrow(/state_after diverged/u);
        const missing = rows.filter((row) => row.sequence !== "3");
        await expect(runtime.reconstruct(missing, "1.2.0")).rejects.toThrow("missing action sequence 3");
        rows[4].timestamp = "not-a-timestamp";
        await expect(runtime.reconstruct(rows, "1.2.0")).rejects.toThrow(/invalid timestamp/u);
    });

    it.skipIf(!hasTimingTag)("archives elapsed and AFK timing from normalized 1.2.0 rows", async () => {
        const rows = JSON.parse(await readFile(
            join(root, "tests", "fixtures", "replay-1.2.0-timing.json"), "utf8",
        )) as PostHogReplayEventRow[];
        rows[1].timestamp = "2026-09-21T11:59:59.000Z";
        rows[2].timestamp = "2026-09-21T12:01:00.000Z";
        rows[3].timestamp = "2026-09-21T12:06:00.000Z";
        rows[4].timestamp = "2026-09-21T12:03:00.000Z";
        rows[5].timestamp = "2026-09-21T12:10:00.000Z";
        const runtime = new ReleaseReplayRuntime(root, false);
        const directory = await mkdtemp(join(tmpdir(), "kcq-timing-sync-"));
        try {
            const result = await syncPostHogReplays({
                replaysDirectory: directory,
                reconstruct: (events, release) => runtime.reconstruct(events, release),
                client: {
                    discoverReplays: async () => [{
                        replayId: rows[0].replay_id, release: "1.2.0", encounter: "tower_1", seed: 12345,
                        startedAt: rows[0].timestamp, latestEventAt: rows[5].timestamp,
                        terminal: "quit", round: 5, actionCount: 4,
                    }],
                    fetchReplayEvents: async () => rows,
                },
            });
            expect(result.failed).toEqual([]);
            expect(result.added).toHaveLength(1);
            expect(result.added[0]).toMatchObject({ elapsedMs: 420_000, afkMs: 180_000 });
            const archive = JSON.parse(await readFile(join(directory, result.added[0].filename), "utf8"));
            expect(archive).toMatchObject({
                totalElapsedTime: "7m00s (+3m00s afk)", totalAfkTime: "3m00s",
            });
            expect(archive.stepTelemetry.map((step: { timestamp: string }) => step.timestamp)).toEqual([
                rows[0].timestamp, rows[2].timestamp, rows[3].timestamp, rows[3].timestamp,
            ]);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it.skipIf(!hasTag)("uses the 0.7.3 engine for a historical transformation replay", async () => {
        const rows = await fixture();
        expect(() => reconstructFightReplay(parsePostHogReplayEvents(rows)))
            .toThrow(/Replay .*diverg/u);
        const imported = await new ReleaseReplayRuntime(root, false).reconstruct(rows, "0.7.3");
        expect(imported.release).toBe("0.7.3");
        const step = imported.replay.steps[0];
        expect(step.success && step.state.characters[0].buffs[0].id)
            .toBe("fairyTransformation");
    });

    it.skipIf(!hasTag)("reuses the compiled cached runtime", async () => {
        const rows = await fixture();
        const runtime = new ReleaseReplayRuntime(root, false);
        await runtime.reconstruct(rows, "0.7.3");
        const marker = join(root, ".replay-runtimes", "0.7.3", ".kcq-replay-runtime.json");
        const first = await stat(marker);
        await new ReleaseReplayRuntime(root, false).reconstruct(rows, "0.7.3");
        expect((await stat(marker)).mtimeMs).toBe(first.mtimeMs);
    });

    it.skipIf(!hasTag)("rejects telemetry from a different release", async () => {
        const rows = await fixture();
        rows[0].release = "0.7.2";
        await expect(new ReleaseReplayRuntime(root, false).reconstruct(rows, "0.7.3"))
            .rejects.toThrow(/telemetry records release "0\.7\.2"/u);
    });

    it("reports a missing release tag without falling back to current source", async () => {
        const rows = await fixture();
        await expect(new ReleaseReplayRuntime(root, false).reconstruct(rows, "missing-kcq-release"))
            .rejects.toThrow(/^Replay release missing-kcq-release: cannot resolve Git tag\.$/u);
    });

    it("defers an active replay before preparing its historical runtime", async () => {
        const rows = await fixture();
        const directory = await mkdtemp(join(tmpdir(), "kcq-release-sync-"));
        const metadata = {
            replayId: rows[0].replay_id,
            release: "0.7.3",
            encounter: rows[0].encounter,
            seed: Number(rows[0].seed),
            startedAt: rows[0].timestamp,
            latestEventAt: rows.at(-1)!.timestamp,
            round: 1,
            actionCount: rows.filter((row) => row.event === "battle_action").length,
        };
        const client: PostHogReplayClient = {
            discoverReplays: async () => [metadata],
            fetchReplayEvents: async () => rows,
        };
        try {
            const result = await syncPostHogReplays({
                client,
                replaysDirectory: directory,
                now: () => new Date(rows[1].timestamp),
            });
            expect(result.failed).toEqual([]);
            expect(result.activeDeferred).toBe(1);
            expect(result.added).toEqual([]);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
