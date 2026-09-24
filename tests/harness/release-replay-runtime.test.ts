import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePostHogReplayEvents, reconstructFightReplay, type PostHogReplayEventRow } from "../../src/harness/replay/posthog-replay";
import { ReleaseReplayRuntime } from "../../src/harness/replay/release-replay-runtime";
import { syncPostHogReplays } from "../../src/harness/replay/replay-archive";
import type { PostHogReplayClient } from "../../src/harness/replay/posthog-api";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const root = process.cwd();
const fixturePath = join(root, "tests", "fixtures", "replay-0.7.3-fairy.json");
let hasTag = false;
try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", "refs/tags/0.7.3"], { cwd: root });
    hasTag = true;
} catch { /* Shallow checkouts can run the other tests without network. */ }

async function fixture(): Promise<PostHogReplayEventRow[]> {
    return JSON.parse(await readFile(fixturePath, "utf8")) as PostHogReplayEventRow[];
}

describe("release replay runtime", () => {
    it.skipIf(!hasTag)("uses the 0.7.3 engine for a historical transformation replay", async () => {
        const rows = await fixture();
        expect(() => reconstructFightReplay(parsePostHogReplayEvents(rows)))
            .toThrow(/fairyTransformation.*transformation/su);

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
            .rejects.toThrow(/cannot resolve Git tag/u);
    });

    it.skipIf(!hasTag)("routes archive sync through the recorded release", async () => {
        const rows = await fixture();
        const directory = await mkdtemp(join(tmpdir(), "kcq-release-sync-"));
        const metadata = {
            replayId: rows[0].replay_id,
            release: "0.7.3",
            encounter: rows[0].encounter,
            seed: Number(rows[0].seed),
            startedAt: rows[0].timestamp,
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
            expect(result.added).toHaveLength(1);
            const archive = JSON.parse(await readFile(join(directory, result.added[0].filename), "utf8"));
            expect(archive.replay.steps[0].state.characters[0].buffs[0].id)
                .toBe("fairyTransformation");
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
