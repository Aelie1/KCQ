import path from "node:path";
import { Worker } from "node:worker_threads";
import { getPolicy } from "../policies";
import {
    runBatch,
    type BatchExecutionOptions,
    type BatchInput,
    type BatchResult,
    type BatchRun,
} from "./batch";
import { executeBatchWorkerInput } from "./batch-worker-job";
import type {
    BatchWorkerInput,
    BatchWorkerRequest,
    BatchWorkerResponse,
} from "./batch-worker-protocol";

export type { BatchWorkerInput, BatchWorkerMessage } from "./batch-worker-protocol";

export interface ParallelBatchExecutionOptions extends BatchExecutionOptions {
    workers: number;
    pool?: BatchWorkerRunner;
}

export interface WorkerHandle {
    on(event: "message", listener: (message: BatchWorkerResponse) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "exit", listener: (exitCode: number) => void): this;
    postMessage(message: BatchWorkerRequest): void;
    terminate(): Promise<number>;
}

export type WorkerFactory = () => WorkerHandle;

export interface ParallelBatchDependencies {
    createWorker?: WorkerFactory;
}

export interface BatchWorkerRunner {
    readonly workerCount: number;
    run(
        input: BatchWorkerInput,
        onProgress?: (completed: number, total: number) => void,
    ): Promise<BatchRun[]>;
    close(): Promise<void>;
}

interface WorkerRecord {
    worker: WorkerHandle;
    exited: boolean;
    assignedIndexes: readonly number[];
    exitPromise: Promise<void>;
    resolveExit: () => void;
}

interface ActiveJob {
    id: number;
    total: number;
    completed: number;
    pending: Set<WorkerRecord>;
    chunks: BatchRun[][];
    onProgress?: (completed: number, total: number) => void;
    resolve: (runs: BatchRun[]) => void;
    reject: (error: Error) => void;
}

/** A narrow persistent worker pool for sequential harness batch jobs. */
export class BatchWorkerPool implements BatchWorkerRunner {
    readonly workerCount: number;

    private readonly createWorker: WorkerFactory;
    private readonly workers: WorkerRecord[] = [];
    private nextJobId = 1;
    private activeJob: ActiveJob | undefined;
    private failure: Error | undefined;
    private closePromise: Promise<void> | undefined;

    constructor(workers: number, dependencies: ParallelBatchDependencies = {}) {
        validateWorkerCount(workers);
        this.workerCount = workers;
        this.createWorker = dependencies.createWorker ?? createBatchWorker;
    }

    async run(
        input: BatchWorkerInput,
        onProgress?: (completed: number, total: number) => void,
    ): Promise<BatchRun[]> {
        if (this.closePromise) throw new Error("Batch worker pool is closed");
        if (this.failure) throw this.failure;
        if (this.activeJob) throw new Error("Batch worker pool already has an active job");
        if (input.runIndexes.length === 0) return [];

        if (this.workerCount === 1) {
            let completed = 0;
            return executeBatchWorkerInput(input, (delta) => {
                completed += delta;
                onProgress?.(completed, input.runIndexes.length);
            });
        }

        this.ensureWorkers();
        const assignments = partitionIndexes(input.runIndexes, this.workerCount);
        const assignedWorkers = this.workers.slice(0, assignments.length);
        const jobId = this.nextJobId;
        this.nextJobId += 1;

        return new Promise<BatchRun[]>((resolve, reject) => {
            this.activeJob = {
                id: jobId,
                total: input.runIndexes.length,
                completed: 0,
                pending: new Set(assignedWorkers),
                chunks: [],
                onProgress,
                resolve,
                reject,
            };

            try {
                assignedWorkers.forEach((record, index) => {
                    const runIndexes = assignments[index];
                    record.assignedIndexes = runIndexes;
                    record.worker.postMessage({
                        type: "run",
                        jobId,
                        input: { ...input, runIndexes },
                    });
                });
            } catch (error: unknown) {
                this.failPool(this.contextualError(error, undefined));
            }
        });
    }

    close(): Promise<void> {
        if (this.closePromise) return this.closePromise;

        this.closePromise = (async () => {
            if (this.activeJob) {
                const error = new Error(`Batch worker pool closed during job ${this.activeJob.id}`);
                this.activeJob.reject(error);
                this.activeJob = undefined;
                await this.terminateWorkers();
                return;
            }

            for (const record of this.workers) {
                if (record.exited) continue;
                try {
                    record.worker.postMessage({ type: "shutdown" });
                } catch {
                    await Promise.resolve(record.worker.terminate()).catch(() => undefined);
                }
            }
            await Promise.all(this.workers.map((record) => record.exitPromise));
        })();
        return this.closePromise;
    }

    private ensureWorkers(): void {
        if (this.workers.length > 0) return;

        try {
            for (let index = 0; index < this.workerCount; index += 1) {
                const worker = this.createWorker();
                let resolveExit = (): void => { };
                const exitPromise = new Promise<void>((resolve) => { resolveExit = resolve; });
                const record: WorkerRecord = {
                    worker,
                    exited: false,
                    assignedIndexes: [],
                    exitPromise,
                    resolveExit,
                };
                this.workers.push(record);
                worker.on("message", (message) => this.handleMessage(record, message));
                worker.on("error", (error) => {
                    this.failPool(this.contextualError(error, record));
                });
                worker.on("exit", (exitCode) => {
                    record.exited = true;
                    record.resolveExit();
                    if (!this.closePromise && !this.failure) {
                        this.failPool(this.contextualError(
                            new Error(`Worker exited unexpectedly with code ${exitCode}`),
                            record,
                        ));
                    }
                });
            }
        } catch (error: unknown) {
            this.failPool(this.contextualError(error, undefined));
            throw this.failure;
        }
    }

    private handleMessage(record: WorkerRecord, message: BatchWorkerResponse): void {
        const job = this.activeJob;
        if (!job || message.jobId !== job.id || !job.pending.has(record)) return;

        if (message.type === "error") {
            const error = new Error(message.message);
            if (message.stack) error.stack = message.stack;
            this.failPool(this.contextualError(error, record));
            return;
        }

        if (message.type === "progress") {
            try {
                if (!Number.isSafeInteger(message.completedDelta) || message.completedDelta <= 0) {
                    throw new Error(`Worker reported invalid progress delta ${message.completedDelta}`);
                }
                job.completed += message.completedDelta;
                if (job.completed > job.total) {
                    throw new Error(`Worker progress exceeded ${job.total} runs`);
                }
                job.onProgress?.(job.completed, job.total);
            } catch (error: unknown) {
                this.failPool(this.contextualError(error, record));
            }
            return;
        }

        job.chunks.push(message.runs);
        job.pending.delete(record);
        record.assignedIndexes = [];
        if (job.pending.size === 0) {
            this.activeJob = undefined;
            if (job.completed !== job.total) {
                const error = new Error(
                    `Worker progress ended at ${job.completed}; expected ${job.total} for job ${job.id}`,
                );
                this.failure = error;
                job.reject(error);
                void this.terminateWorkers();
            } else {
                job.resolve(job.chunks.flat());
            }
        }
    }

    private contextualError(error: unknown, record: WorkerRecord | undefined): Error {
        const jobId = this.activeJob?.id;
        const indexes = record?.assignedIndexes ?? [];
        const context = jobId === undefined ? "" : ` for job ${jobId}`;
        const runContext = indexes.length === 0 ? "" : ` (run indexes ${formatIndexes(indexes)})`;
        return new Error(`Worker failure${context}${runContext}: ${errorMessage(error)}`, { cause: error });
    }

    private failPool(error: Error): void {
        if (this.failure) return;
        this.failure = error;
        const job = this.activeJob;
        this.activeJob = undefined;
        job?.reject(error);
        void this.terminateWorkers();
    }

    private async terminateWorkers(): Promise<void> {
        await Promise.allSettled(this.workers.map(async (record) => {
            if (!record.exited) await record.worker.terminate();
        }));
        await Promise.all(this.workers.map((record) => record.exitPromise));
    }
}

/** Validates and clamps a requested worker count for a particular batch size. */
export function effectiveWorkerCount(requestedWorkers: number, runs: number): number {
    validateWorkerCount(requestedWorkers);
    if (!Number.isSafeInteger(runs) || runs < 0) {
        throw new RangeError(`runs must be a non-negative safe integer; received ${runs}`);
    }
    return runs === 0 ? 0 : Math.min(requestedWorkers, runs);
}

/**
 * Executes registered policies in worker threads while preserving the synchronous
 * runBatch result contract. A supplied pool is reused and remains owned by its caller.
 */
export async function runBatchParallel(
    input: BatchInput,
    options: ParallelBatchExecutionOptions,
    dependencies: ParallelBatchDependencies = {},
): Promise<BatchResult> {
    const workers = effectiveWorkerCount(options.workers, input.runs);
    if (workers <= 1) {
        return runBatch(input, { onProgress: options.onProgress });
    }

    const registeredPolicy = getPolicy(input.policy.id);
    if (registeredPolicy !== input.policy) {
        throw new Error(
            `Parallel batches require a registered policy object; received ${input.policy.id}`,
        );
    }

    const ownedPool = options.pool === undefined
        ? new BatchWorkerPool(workers, dependencies)
        : undefined;
    const pool = options.pool ?? ownedPool!;
    const workerInput: BatchWorkerInput = {
        encounterId: input.encounterId,
        policyId: input.policy.id,
        masterSeed: input.masterSeed,
        maxActions: input.maxActions,
        replay: input.replay === true,
        runIndexes: Array.from({ length: input.runs }, (_, index) => index),
    };

    try {
        const runs = await pool.run(workerInput, options.onProgress);
        return assembleParallelBatchResult(input, runs);
    } catch (error: unknown) {
        throw infrastructureError(error);
    } finally {
        await ownedPool?.close();
    }
}

/** Round-robin assignment keeps expensive run indexes distributed predictably. */
export function partitionRunIndexes(runs: number, workers: number): number[][] {
    const effective = effectiveWorkerCount(workers, runs);
    return partitionIndexes(Array.from({ length: runs }, (_, index) => index), effective);
}

/** Sorts worker output and proves that no global run index is missing or duplicated. */
export function assembleParallelBatchResult(
    input: BatchInput,
    unorderedRuns: readonly BatchRun[],
): BatchResult {
    const runs = [...unorderedRuns].sort((left, right) => left.runIndex - right.runIndex);
    if (runs.length !== input.runs) {
        throw new Error(`Workers returned ${runs.length} runs; expected ${input.runs}`);
    }
    runs.forEach((run, expectedIndex) => {
        if (run.runIndex !== expectedIndex) {
            throw new Error(
                `Worker results are missing or duplicate run index ${expectedIndex}; received ${run.runIndex}`,
            );
        }
    });
    return {
        encounterId: input.encounterId,
        policyId: input.policy.id,
        masterSeed: input.masterSeed,
        runs,
    };
}

function partitionIndexes(indexes: readonly number[], workers: number): number[][] {
    if (indexes.length === 0) return [];
    const count = Math.min(workers, indexes.length);
    const partitions = Array.from({ length: count }, (): number[] => []);
    indexes.forEach((runIndex, index) => partitions[index % count].push(runIndex));
    return partitions;
}

function createBatchWorker(): WorkerHandle {
    const sourceMode = path.extname(__filename) === ".ts";
    const entryPath = path.resolve(__dirname, sourceMode ? "batch-worker.ts" : "batch-worker.js");
    const bootstrap = sourceMode
        ? `
            const fs = require("node:fs");
            const esbuild = require("esbuild");
            require.extensions[".ts"] = (module, filename) => {
                const source = fs.readFileSync(filename, "utf8");
                const output = esbuild.transformSync(source, {
                    loader: "ts", format: "cjs", target: "node18", sourcemap: "inline",
                }).code;
                module._compile(output, filename);
            };
            require(${JSON.stringify(entryPath)});
        `
        : `require(${JSON.stringify(entryPath)});`;
    return new Worker(bootstrap, { eval: true });
}

function validateWorkerCount(workers: number): void {
    if (!Number.isSafeInteger(workers) || workers <= 0) {
        throw new RangeError(`workers must be a positive safe integer; received ${workers}`);
    }
}

function infrastructureError(error: unknown): Error {
    if (error instanceof Error && error.message.startsWith("Worker infrastructure failure")) {
        return error;
    }
    return new Error(`Worker infrastructure failure: ${errorMessage(error)}`, { cause: error });
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function formatIndexes(indexes: readonly number[]): string {
    if (indexes.length <= 6) return indexes.join(", ");
    return `${indexes.slice(0, 3).join(", ")}, ..., ${indexes.slice(-2).join(", ")}`;
}
