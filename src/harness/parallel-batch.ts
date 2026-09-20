import path from "node:path";
import { Worker } from "node:worker_threads";
import {
    runBatch,
    type BatchExecutionOptions,
    type BatchInput,
    type BatchResult,
    type BatchRun,
} from "./batch";
import type { BatchWorkerInput, BatchWorkerMessage } from "./batch-worker";
import { getPolicy } from "./policies";

export interface ParallelBatchExecutionOptions extends BatchExecutionOptions {
    workers: number;
}

export interface WorkerHandle {
    on(event: "message", listener: (message: BatchWorkerMessage) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "exit", listener: (exitCode: number) => void): this;
    terminate(): Promise<number>;
}

export type WorkerFactory = (input: BatchWorkerInput) => WorkerHandle;

export interface ParallelBatchDependencies {
    createWorker?: WorkerFactory;
}

/** Validates and clamps a requested worker count for a particular batch size. */
export function effectiveWorkerCount(requestedWorkers: number, runs: number): number {
    if (!Number.isSafeInteger(requestedWorkers) || requestedWorkers <= 0) {
        throw new RangeError(`workers must be a positive safe integer; received ${requestedWorkers}`);
    }
    if (!Number.isSafeInteger(runs) || runs < 0) {
        throw new RangeError(`runs must be a non-negative safe integer; received ${runs}`);
    }
    return runs === 0 ? 0 : Math.min(requestedWorkers, runs);
}

/**
 * Executes registered policies in worker threads while preserving the synchronous
 * runBatch result contract. Custom policies remain supported by runBatch and by
 * this function when workers=1.
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

    const partitions = partitionRunIndexes(input.runs, workers);
    const createWorker = dependencies.createWorker ?? createBatchWorker;
    const activeWorkers: WorkerHandle[] = [];
    const workerPromises: Array<Promise<BatchRun[]>> = [];
    let completed = 0;

    try {
        for (const runIndexes of partitions) {
            const workerInput: BatchWorkerInput = {
                encounterId: input.encounterId,
                policyId: input.policy.id,
                masterSeed: input.masterSeed,
                maxActions: input.maxActions,
                replay: input.replay === true,
                runIndexes,
            };
            const worker = createWorker(workerInput);
            activeWorkers.push(worker);
            workerPromises.push(collectWorker(worker, workerInput, (delta) => {
                completed += delta;
                if (completed > input.runs) {
                    throw new Error("Worker progress exceeded the batch run count");
                }
                options.onProgress?.(completed, input.runs);
            }));
        }
        const chunks = await Promise.all(workerPromises);

        if (completed !== input.runs) {
            throw new Error(`Worker progress ended at ${completed}; expected ${input.runs}`);
        }
        return assembleParallelBatchResult(input, chunks.flat());
    } catch (error: unknown) {
        await Promise.allSettled(activeWorkers.map((worker) => worker.terminate()));
        await Promise.allSettled(workerPromises);
        throw infrastructureError(error);
    }
}

/** Round-robin assignment keeps expensive run indexes distributed predictably. */
export function partitionRunIndexes(runs: number, workers: number): number[][] {
    const effective = effectiveWorkerCount(workers, runs);
    const partitions = Array.from({ length: effective }, (): number[] => []);
    for (let runIndex = 0; runIndex < runs; runIndex += 1) {
        partitions[runIndex % effective].push(runIndex);
    }
    return partitions;
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

function collectWorker(
    worker: WorkerHandle,
    input: BatchWorkerInput,
    onProgress: (delta: number) => void,
): Promise<BatchRun[]> {
    return new Promise<BatchRun[]>((resolve, reject) => {
        let returnedRuns: BatchRun[] | undefined;
        let settled = false;
        const fail = (error: unknown): void => {
            if (settled) return;
            settled = true;
            reject(error);
        };

        worker.on("message", (message) => {
            if (message.type === "progress") {
                try {
                    onProgress(message.completedDelta);
                } catch (error: unknown) {
                    fail(error);
                }
            } else {
                returnedRuns = message.runs;
            }
        });
        worker.on("error", (error) => fail(error));
        worker.on("exit", (exitCode) => {
            if (settled) return;
            settled = true;
            if (exitCode !== 0) {
                reject(new Error(`Worker exited with code ${exitCode}`));
            } else if (returnedRuns === undefined) {
                reject(new Error("Worker exited without returning results"));
            } else {
                resolve(returnedRuns);
            }
        });
    }).catch((error: unknown) => {
        throw new Error(
            `Worker infrastructure failure for run indexes ${formatIndexes(input.runIndexes)}: ${errorMessage(error)}`,
            { cause: error },
        );
    });
}

function createBatchWorker(input: BatchWorkerInput): WorkerHandle {
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
    return new Worker(bootstrap, { eval: true, workerData: input });
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
