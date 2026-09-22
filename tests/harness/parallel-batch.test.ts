import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { runBatch, type BatchInput } from "../../src/harness/batch/batch";
import { executeBatchWorkerInput } from "../../src/harness/batch/batch-worker-job";
import type {
    BatchWorkerRequest,
    BatchWorkerResponse,
} from "../../src/harness/batch/batch-worker-protocol";
import {
    assembleParallelBatchResult,
    BatchWorkerPool,
    effectiveWorkerCount,
    partitionRunIndexes,
    runBatchParallel,
    type WorkerFactory,
    type WorkerHandle,
} from "../../src/harness/batch/parallel-batch";
import { summarizeBatch } from "../../src/harness/batch/summary";
import { basicPolicy } from "../../src/harness/policy/basic";
import { firstPolicy } from "../../src/harness/policy/first";
import { randomPolicy } from "../../src/harness/policy/random";

function input(overrides: Partial<BatchInput> = {}): BatchInput {
    return {
        encounterId: "plains_1",
        policy: basicPolicy,
        masterSeed: 123,
        runs: 4,
        maxActions: 12,
        replay: true,
        ...overrides,
    };
}

class FakeWorker extends EventEmitter implements WorkerHandle {
    exited = false;
    terminated = false;
    shutdown = false;
    readonly jobIds: number[] = [];

    constructor(
        private readonly delay: (request: Extract<BatchWorkerRequest, { type: "run" }>) => number = () => 0,
        private readonly fail: (request: Extract<BatchWorkerRequest, { type: "run" }>) => string | undefined = () => undefined,
    ) {
        super();
    }

    postMessage(message: BatchWorkerRequest): void {
        if (message.type === "shutdown") {
            this.shutdown = true;
            setTimeout(() => this.exit(0), 0);
            return;
        }

        this.jobIds.push(message.jobId);
        setTimeout(() => {
            if (this.terminated || this.exited) return;
            const failure = this.fail(message);
            if (failure) {
                this.emit("error", new Error(failure));
                return;
            }
            try {
                const runs = executeBatchWorkerInput(message.input, (completedDelta) => {
                    this.emit("message", {
                        type: "progress",
                        jobId: message.jobId,
                        completedDelta,
                    } satisfies BatchWorkerResponse);
                });
                this.emit("message", {
                    type: "result",
                    jobId: message.jobId,
                    runs,
                } satisfies BatchWorkerResponse);
            } catch (error: unknown) {
                this.emit("message", {
                    type: "error",
                    jobId: message.jobId,
                    message: error instanceof Error ? error.message : String(error),
                } satisfies BatchWorkerResponse);
            }
        }, this.delay(message));
    }

    terminate(): Promise<number> {
        this.terminated = true;
        this.exit(1);
        return Promise.resolve(1);
    }

    private exit(code: number): void {
        if (this.exited) return;
        this.exited = true;
        this.emit("exit", code);
    }
}

describe("parallel batch execution", () => {
    it.each([1, 2, 4])("workers=%i is exactly equivalent to synchronous runBatch", async (workers) => {
        const batchInput = input();
        const synchronous = runBatch(batchInput);
        const parallel = await runBatchParallel(batchInput, { workers });

        expect(parallel).toEqual(synchronous);
        expect(parallel.runs.map((run) => run.runIndex)).toEqual([0, 1, 2, 3]);
        expect(parallel.runs.map((run) => run.engineSeed))
            .toEqual(synchronous.runs.map((run) => run.engineSeed));
        expect(parallel.runs.map((run) => run.policySeed))
            .toEqual(synchronous.runs.map((run) => run.policySeed));
        expect(parallel.runs.map((run) => run.result.metrics))
            .toEqual(synchronous.runs.map((run) => run.result.metrics));
        expect(summarizeBatch(parallel)).toEqual(summarizeBatch(synchronous));
        expect(summarizeBatch(parallel).forensicExamples)
            .toEqual(summarizeBatch(synchronous).forensicExamples);
    }, 20_000);

    it("keeps real persistent workers deterministic across sequential jobs", async () => {
        const pool = new BatchWorkerPool(2);
        const jobs = [
            input({ runs: 2, policy: firstPolicy, encounterId: "plains_1", replay: false }),
            input({ runs: 2, policy: randomPolicy, encounterId: "plains_1", replay: false }),
            input({ runs: 2, policy: firstPolicy, encounterId: "plains_2", replay: false }),
        ];
        try {
            for (const job of jobs) {
                expect(await runBatchParallel(job, { workers: 2, pool })).toEqual(runBatch(job));
            }
        } finally {
            await pool.close();
        }
    }, 20_000);

    it("reuses one fixed set of workers across policies and encounters", async () => {
        const created: FakeWorker[] = [];
        const factory: WorkerFactory = () => {
            const worker = new FakeWorker();
            created.push(worker);
            return worker;
        };
        const pool = new BatchWorkerPool(2, { createWorker: factory });
        const jobs = [
            input({ policy: firstPolicy, encounterId: "plains_1", replay: false }),
            input({ policy: randomPolicy, encounterId: "plains_1", replay: false }),
            input({ policy: firstPolicy, encounterId: "plains_2", replay: false }),
        ];

        try {
            for (const job of jobs) {
                expect(await runBatchParallel(job, { workers: 2, pool })).toEqual(runBatch(job));
            }
        } finally {
            await pool.close();
        }

        expect(created).toHaveLength(2);
        expect(created.every((worker) => worker.jobIds.length === 3)).toBe(true);
        expect(created.every((worker) => worker.shutdown && worker.exited)).toBe(true);
    });

    it("sorts out-of-order worker completion into global run-index order", async () => {
        const batchInput = input({ runs: 4, replay: false });
        const workers: FakeWorker[] = [];
        const factory: WorkerFactory = () => {
            const worker = new FakeWorker((request) => request.input.runIndexes[0] === 0 ? 20 : 0);
            workers.push(worker);
            return worker;
        };

        const result = await runBatchParallel(batchInput, { workers: 2 }, { createWorker: factory });
        expect(result).toEqual(runBatch(batchInput));
        expect(result.runs.map(({ runIndex }) => runIndex)).toEqual([0, 1, 2, 3]);
        expect(workers.every((worker) => worker.shutdown && worker.exited)).toBe(true);
    });

    it("rejects missing/duplicate assembled indexes instead of fabricating runs", () => {
        const batchInput = input({ runs: 2 });
        const reference = runBatch(batchInput);
        expect(() => assembleParallelBatchResult(
            batchInput,
            [reference.runs[1], reference.runs[1]],
        )).toThrow(/missing or duplicate run index 0/);
    });

    it("uses deterministic round-robin partitions", () => {
        expect(partitionRunIndexes(8, 3)).toEqual([[0, 3, 6], [1, 4, 7], [2, 5]]);
    });

    it("handles zero runs and workers=1 without spawning workers", async () => {
        let spawned = 0;
        const factory: WorkerFactory = () => {
            spawned += 1;
            throw new Error("must not spawn");
        };
        expect(await runBatchParallel(input({ runs: 0 }), { workers: 8 }, { createWorker: factory }))
            .toEqual(runBatch(input({ runs: 0 })));
        expect(await runBatchParallel(input({ runs: 1 }), { workers: 1 }, { createWorker: factory }))
            .toEqual(runBatch(input({ runs: 1 })));
        expect(spawned).toBe(0);
        expect(effectiveWorkerCount(8, 0)).toBe(0);
    });

    it("clamps requested workers to runs", async () => {
        const batchInput = input({ runs: 2, replay: false });
        let spawned = 0;
        const factory: WorkerFactory = () => {
            spawned += 1;
            return new FakeWorker();
        };
        expect(await runBatchParallel(batchInput, { workers: 8 }, { createWorker: factory }))
            .toEqual(runBatch(batchInput));
        expect(spawned).toBe(2);
        expect(effectiveWorkerCount(8, 2)).toBe(2);
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
        "rejects invalid worker count %s consistently",
        async (workers) => {
            await expect(runBatchParallel(input(), { workers })).rejects.toThrow(
                /workers must be a positive safe integer/,
            );
        },
    );

    it("counts progress exactly across repeated jobs", async () => {
        const pool = new BatchWorkerPool(2, { createWorker: () => new FakeWorker() });
        const updates: Array<[number, number]> = [];
        const batchInput = input({ runs: 5, replay: false });
        try {
            for (let job = 0; job < 2; job += 1) {
                await runBatchParallel(batchInput, {
                    workers: 2,
                    pool,
                    onProgress: (completed, total) => updates.push([completed, total]),
                });
            }
        } finally {
            await pool.close();
        }
        expect(updates.filter(([completed, total]) => completed === total)).toEqual([[5, 5], [5, 5]]);
        expect(updates.every(([completed, total]) => completed <= total && total === 5)).toBe(true);
    });

    it("rejects worker crashes with job context and leaves no unresolved close", async () => {
        const created: FakeWorker[] = [];
        const pool = new BatchWorkerPool(2, {
            createWorker: () => {
                const worker = new FakeWorker(
                    () => 0,
                    (request) => request.input.runIndexes[0] === 0 ? "synthetic crash" : undefined,
                );
                created.push(worker);
                return worker;
            },
        });

        await expect(runBatchParallel(input({ replay: false }), { workers: 2, pool }))
            .rejects.toThrow(/Worker infrastructure failure.*job 1.*run indexes.*synthetic crash/);
        await expect(pool.close()).resolves.toBeUndefined();
        expect(created.every((worker) => worker.terminated)).toBe(true);
    });

    it("keeps custom policies supported on the one-worker synchronous path", async () => {
        const custom = { ...firstPolicy, id: "custom-first" };
        const batchInput = input({ policy: custom, runs: 1 });
        expect(await runBatchParallel(batchInput, { workers: 1 })).toEqual(runBatch(batchInput));
        await expect(runBatchParallel({ ...batchInput, runs: 2 }, { workers: 2 })).rejects.toThrow(
            /require a registered policy object/,
        );
    });
});
