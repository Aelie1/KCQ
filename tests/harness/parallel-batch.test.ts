import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
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
    runBatchParallel,
    type WorkerFactory,
    type WorkerHandle,
} from "../../src/harness/batch/parallel-batch";
import { summarizeBatch } from "../../src/harness/batch/summary";
import { basicPolicy } from "../../src/harness/policy/basic";
import { escapePolicy } from "../../src/harness/policy/escape";

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
    readonly receivedRunIndexes: number[][] = [];
    readonly completedRunIndexes: number[][] = [];

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
        this.receivedRunIndexes.push([...message.input.runIndexes]);
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
                this.completedRunIndexes.push([...message.input.runIndexes]);
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
        const batchInput = input({ runs: 12 });
        const synchronous = runBatch(batchInput);
        const parallel = await runBatchParallel(batchInput, { workers });

        expect(parallel).toEqual(synchronous);
        expect(parallel.runs.map((run) => run.runIndex)).toEqual(Array.from({ length: 12 }, (_, index) => index));
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
            input({ runs: 12, policy: basicPolicy, encounterId: "plains_1", replay: false }),
            input({ runs: 12, policy: escapePolicy, encounterId: "plains_1", replay: false }),
            input({ runs: 12, policy: basicPolicy, encounterId: "plains_2", replay: false }),
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
            input({ runs: 12, policy: basicPolicy, encounterId: "plains_1", replay: false }),
            input({ runs: 12, policy: escapePolicy, encounterId: "plains_1", replay: false }),
            input({ runs: 12, policy: basicPolicy, encounterId: "plains_2", replay: false }),
        ];

        try {
            for (const job of jobs) {
                expect(await runBatchParallel(job, { workers: 2, pool })).toEqual(runBatch(job));
            }
        } finally {
            await pool.close();
        }

        expect(created).toHaveLength(2);
        for (const worker of created) {
            expect([...new Set(worker.jobIds)]).toEqual([1, 2, 3]);
        }
        for (const jobId of [1, 2, 3]) {
            expect(created.flatMap(worker => worker.jobIds).filter(id => id === jobId)).toHaveLength(3);
        }
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

    it("gives a fast worker more queued chunks before a slow worker finishes", async () => {
        vi.useFakeTimers();
        const created: FakeWorker[] = [];
        const pool = new BatchWorkerPool(2, {
            createWorker: () => {
                const worker = new FakeWorker(request => request.input.runIndexes[0] === 0 ? 100 : 1);
                created.push(worker);
                return worker;
            },
        });
        const batchInput = input({ runs: 16 });
        const updates: Array<[number, number]> = [];
        let settled = false;
        try {
            const pending = runBatchParallel(batchInput, {
                workers: 2, pool,
                onProgress: (completed, total) => updates.push([completed, total]),
            }).then(result => { settled = true; return result; });
            expect(created.map(worker => worker.receivedRunIndexes)).toEqual([
                [[0, 1, 2, 3]], [[4, 5, 6, 7]],
            ]);

            await vi.advanceTimersByTimeAsync(3);
            expect(created[0].completedRunIndexes).toEqual([]);
            expect(created[1].receivedRunIndexes).toEqual([
                [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
            ]);
            expect(created[1].completedRunIndexes).toEqual(created[1].receivedRunIndexes);
            expect(updates).toEqual([[4, 16], [8, 16], [12, 16]]);
            // The queue is empty, but the job still waits for the slow chunk in flight.
            expect(settled).toBe(false);

            await vi.advanceTimersByTimeAsync(97);
            const result = await pending;
            const synchronous = runBatch(batchInput);
            expect(result).toEqual(synchronous);
            expect(summarizeBatch(result)).toEqual(summarizeBatch(synchronous));
            expect(updates).toEqual([[4, 16], [8, 16], [12, 16], [16, 16]]);
        } finally {
            const closed = pool.close();
            await vi.runAllTimersAsync();
            await closed;
            vi.useRealTimers();
        }
    });

    it.each([
        { runs: 4, workers: 2, chunkSize: 2 },
        { runs: 7, workers: 4, chunkSize: 1 },
        { runs: 17, workers: 3, chunkSize: 4 },
        { runs: 100, workers: 8, chunkSize: 4 },
    ])("starts every worker and caps chunks for $runs runs / $workers workers", async ({ runs, workers, chunkSize }) => {
        const created: FakeWorker[] = [];
        const batchInput = input({ runs, maxActions: 0, replay: false });
        const pending = runBatchParallel(batchInput, { workers }, {
            createWorker: () => {
                const worker = new FakeWorker();
                created.push(worker);
                return worker;
            },
        });
        expect(created).toHaveLength(workers);
        expect(created.every(worker => worker.receivedRunIndexes.length === 1)).toBe(true);
        expect(created.every(worker => worker.receivedRunIndexes[0].length === chunkSize)).toBe(true);
        expect(await pending).toEqual(runBatch(batchInput));
        const chunks = created.flatMap(worker => worker.receivedRunIndexes);
        expect(chunks.every(chunk => chunk.length > 0 && chunk.length <= chunkSize)).toBe(true);
        expect(chunks.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: runs }, (_, index) => index));
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
        const updates: Array<Array<[number, number]>> = [];
        const batchInput = input({ runs: 17, replay: false });
        try {
            for (let job = 0; job < 2; job += 1) {
                const jobUpdates: Array<[number, number]> = [];
                updates.push(jobUpdates);
                await runBatchParallel(batchInput, {
                    workers: 2,
                    pool,
                    onProgress: (completed, total) => jobUpdates.push([completed, total]),
                });
            }
        } finally {
            await pool.close();
        }
        for (const jobUpdates of updates) {
            expect(jobUpdates.map(([completed]) => completed)).toEqual([4, 8, 12, 16, 17]);
            expect(jobUpdates.every(([completed, total]) => completed <= total && total === 17)).toBe(true);
        }
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

    it.each(["worker", "dispatch"])("reports the current chunk after a reassigned %s failure and keeps the pool failed", async failureType => {
        const created: FakeWorker[] = [];
        const pool = new BatchWorkerPool(2, {
            createWorker: () => {
                const worker = new FakeWorker(
                    request => request.input.runIndexes[0] === 0 ? 20 : 0,
                    request => request.input.runIndexes[0] === 8 ? "reassigned crash" : undefined,
                );
                if (failureType === "dispatch") {
                    const postMessage = worker.postMessage.bind(worker);
                    worker.postMessage = message => {
                        if (message.type === "run" && message.input.runIndexes[0] === 8) {
                            throw new Error("reassigned crash");
                        }
                        postMessage(message);
                    };
                }
                created.push(worker);
                return worker;
            },
        });
        const batchInput = input({ runs: 16, replay: false });
        const failure = /job 1 \(run indexes 8, 9, 10, 11\).*reassigned crash/;
        try {
            await expect(runBatchParallel(batchInput, { workers: 2, pool })).rejects.toThrow(failure);
            await expect(runBatchParallel(batchInput, { workers: 2, pool })).rejects.toThrow(failure);
        } finally {
            await pool.close();
        }
        expect(created).toHaveLength(2);
        expect(created.every(worker => worker.terminated)).toBe(true);
    });

    it("closes during an active chunked job without hanging", async () => {
        const created: FakeWorker[] = [];
        const pool = new BatchWorkerPool(2, {
            createWorker: () => {
                const worker = new FakeWorker(() => 20);
                created.push(worker);
                return worker;
            },
        });
        const pending = runBatchParallel(input({ runs: 16 }), { workers: 2, pool });
        const rejected = expect(pending).rejects.toThrow(/closed during job 1/);
        const closed = pool.close();
        expect(pool.close()).toBe(closed);
        await closed;
        await rejected;
        expect(created.every(worker => worker.terminated && worker.exited)).toBe(true);
    });

    it("keeps custom policies supported on the one-worker synchronous path", async () => {
        const custom = { ...basicPolicy, id: "custom-basic" };
        const batchInput = input({ policy: custom, runs: 1 });
        expect(await runBatchParallel(batchInput, { workers: 1 })).toEqual(runBatch(batchInput));
        await expect(runBatchParallel({ ...batchInput, runs: 2 }, { workers: 2 })).rejects.toThrow(
            /require a registered policy object/,
        );
    });
});
