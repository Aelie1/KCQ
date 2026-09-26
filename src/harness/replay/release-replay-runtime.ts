import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
    enrichImportedReplayTelemetry,
    parsePostHogReplayEvents,
    type ImportedPostHogReplay,
    type PostHogReplayEventRow,
} from "./posthog-replay";

interface RuntimeMarker {
    commit: string;
    buildHash: string;
}

/** Current code chooses the tag and manages the cache; tagged code parses and validates. */
export class ReleaseReplayRuntime {
    readonly #root: string;
    readonly #cache: string;
    readonly #fetchMissingTags: boolean;
    readonly #ready = new Map<string, Promise<string>>();

    constructor(root = process.cwd(), fetchMissingTags = true) {
        this.#root = resolve(root);
        this.#cache = join(this.#root, ".replay-runtimes");
        this.#fetchMissingTags = fetchMissingTags;
    }

    async reconstruct(
        rows: readonly PostHogReplayEventRow[],
        release: string,
    ): Promise<ImportedPostHogReplay> {
        const runtime = await this.#runtime(release);
        const runner = join(this.#root, "src", "harness", "replay", "release-replay-runner.cjs");
        let output: string;
        try {
            output = await runProcess(process.execPath, [runner, runtime, release], this.#root, JSON.stringify(rows));
        } catch (error) {
            throw new Error(`Replay runtime ${release}: ${errorMessage(error)}`);
        }
        let imported: unknown;
        try {
            imported = JSON.parse(output);
        } catch {
            throw new Error(`Replay runtime ${release} returned invalid JSON.`);
        }
        if (!isImportedReplay(imported) || imported.release !== release) {
            throw new Error(`Replay runtime ${release} returned an invalid or mismatched replay.`);
        }
        return enrichImportedReplayTelemetry(imported, parsePostHogReplayEvents(rows));
    }

    async #runtime(release: string): Promise<string> {
        validateRelease(release);
        let ready = this.#ready.get(release);
        if (!ready) {
            ready = this.#prepare(release).catch((error: unknown) => {
                const message = errorMessage(error);
                throw new Error(message.startsWith(`Replay release ${release}:`)
                    ? message
                    : `Replay release ${release}: runtime preparation failed: ${message}`);
            });
            this.#ready.set(release, ready);
            ready.catch(() => this.#ready.delete(release));
        }
        return ready;
    }

    async #prepare(release: string): Promise<string> {
        let commit: string;
        try {
            commit = (await runProcess("git", [
                "rev-parse", "--verify", `refs/tags/${release}^{commit}`,
            ], this.#root)).trim();
        } catch {
            if (!this.#fetchMissingTags) {
                throw new Error(`Replay release ${release}: cannot resolve Git tag.`);
            }
            try {
                await runProcess("git", ["fetch", "--no-tags", "origin", "tag", release], this.#root);
                commit = (await runProcess("git", [
                    "rev-parse", "--verify", `refs/tags/${release}^{commit}`,
                ], this.#root)).trim();
            } catch (error) {
                throw new Error(`Replay release ${release}: cannot resolve Git tag (or fetch it from origin): ${errorMessage(error)}`);
            }
        }
        if (!/^[0-9a-f]{40,64}$/u.test(commit)) {
            throw new Error(`Replay release ${release}: Git returned an invalid commit ID.`);
        }

        const runtime = join(this.#cache, release);
        const markerPath = join(runtime, ".kcq-replay-runtime.json");
        const distPath = join(runtime, "dist");
        const modulePath = join(distPath, "harness", "replay", "posthog-replay.js");
        if (!existsSync(runtime)) {
            await mkdir(this.#cache, { recursive: true });
            try {
                await runProcess("git", ["worktree", "add", "--detach", "--", runtime, commit], this.#root);
            } catch (error) {
                throw new Error(`Replay release ${release}: could not create detached worktree: ${errorMessage(error)}`);
            }
        }
        const head = (await runProcess("git", ["rev-parse", "HEAD"], runtime)).trim();
        if (head !== commit) {
            throw new Error(`Replay release ${release}: cached runtime is at ${head}, but tag resolves to ${commit}.`);
        }
        const dirty = (await runProcess("git", ["status", "--porcelain", "--untracked-files=no"], runtime)).trim();
        if (dirty) {
            throw new Error(`Replay release ${release}: cached runtime has modified tracked files.`);
        }
        const marker = await readMarker(markerPath);
        if (marker?.commit === commit && existsSync(modulePath)
            && marker.buildHash === await directoryHash(distPath)) return runtime;

        const compiler = join(this.#root, "node_modules", "typescript", "bin", "tsc");
        if (!existsSync(compiler)) {
            throw new Error(`Replay release ${release}: TypeScript is missing; run npm install or npm ci in the main checkout.`);
        }
        try {
            await runProcess(process.execPath, [compiler, "-p", "tsconfig.build.json"], runtime);
        } catch (error) {
            throw new Error(`Replay release ${release}: build failed: ${errorMessage(error)}`);
        }
        if (!existsSync(modulePath)) {
            throw new Error(`Replay release ${release}: build did not produce the historical replay module.`);
        }
        await writeFile(markerPath, JSON.stringify({ commit, buildHash: await directoryHash(distPath) } satisfies RuntimeMarker));
        return runtime;
    }
}

function validateRelease(release: string): void {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(release) || release.includes("..") || release.endsWith(".")) {
        throw new Error(`Replay release ${JSON.stringify(release)}: invalid Git tag name.`);
    }
}

async function readMarker(path: string): Promise<RuntimeMarker | undefined> {
    try {
        const value: unknown = JSON.parse(await readFile(path, "utf8"));
        if (isRecord(value) && typeof value.commit === "string" && typeof value.buildHash === "string") {
            return value as unknown as RuntimeMarker;
        }
    } catch { /* A missing or invalid marker forces a rebuild. */ }
    return undefined;
}

async function directoryHash(directory: string): Promise<string> {
    const hash = createHash("sha256");
    async function visit(path: string, relative: string): Promise<void> {
        for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
            const name = relative ? `${relative}/${entry.name}` : entry.name;
            const child = join(path, entry.name);
            if (entry.isDirectory()) await visit(child, name);
            else if (entry.isFile()) {
                hash.update(name).update("\0").update(await readFile(child));
            }
        }
    }
    await visit(directory, "");
    return hash.digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImportedReplay(value: unknown): value is ImportedPostHogReplay {
    return isRecord(value) && typeof value.replayId === "string"
        && typeof value.release === "string" && typeof value.encounter === "string"
        && typeof value.seed === "number" && isRecord(value.replay)
        && isRecord(value.replay.initialState) && Array.isArray(value.replay.steps);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function runProcess(command: string, args: string[], cwd: string, input?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
        child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
        child.on("error", reject);
        child.on("close", (code) => {
            const output = Buffer.concat(stdout).toString("utf8");
            if (code === 0) resolve(output);
            else reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || output.trim() || `exit code ${code}`));
        });
        child.stdin.on("error", reject);
        child.stdin.end(input);
    });
}
