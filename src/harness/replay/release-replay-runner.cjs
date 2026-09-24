const { join } = require("node:path");

async function main() {
    const [runtime, release] = process.argv.slice(2);
    if (!runtime || !release) throw new Error("Missing replay runtime or release.");
    const historical = require(join(runtime, "dist", "harness", "replay", "posthog-replay.js"));
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const rows = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(rows)) throw new Error("Replay runtime input must be event rows.");
    const parsed = historical.parsePostHogReplayEvents(rows);
    if (parsed.release !== release) {
        throw new Error(`Replay runtime ${release}: telemetry records release ${JSON.stringify(parsed.release)}.`);
    }
    process.stdout.write(JSON.stringify(historical.reconstructFightReplay(parsed)));
}

main().catch((error) => {
    process.stderr.write(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
