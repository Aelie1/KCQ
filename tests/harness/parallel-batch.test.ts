import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { runBatch, type BatchInput, type BatchRun } from "../../src/harness/batch/batch";
import type { BatchWorkerInput, BatchWorkerMessage } from "../../src/harness/batch/batch-worker";
import {
    assembleParallelBatchResult,
    effectiveWorkerCount,
    partitionRunIndexes,
    runBatchParallel,
    type WorkerFactory,
    type WorkerHandle,
} from "../../src/harness/batch/parallel-batch";
import { summarizeBatch } from "../../src/harness/batch/summary";
import { basicPolicy } from "../../src/harness/policy/basic";
import { firstPolicy } from "../../src/harness/policy/first";

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

    terminate(): Promise<number> {
        this.terminated = true;
        if (!this.exited) {
            this.exited = true;
            this.emit("exit", 1);
        }
        return Promise.resolve(1);
    }

    complete(runs: BatchRun[], delayMs = 0): void {
        setTimeout(() => {
            if (this.terminated) return;
            this.emit("message", { type: "progress", completedDelta: runs.length } satisfies BatchWorkerMessage);
            this.emit("message", { type: "result", runs } satisfies BatchWorkerMessage);
            this.exited = true;
            this.emit("exit", 0);
        }, delayMs);
    }

    fail(message: string, delayMs = 0): void {
        setTimeout(() => {
            if (!this.terminated) this.emit("error", new Error(message));
        }, delayMs);
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

    it("sorts explicitly out-of-order worker completion into global run-index order", async () => {
        const batchInput = input({ runs: 4, replay: false });
        const reference = runBatch(batchInput);
        const workers: FakeWorker[] = [];
        const factory: WorkerFactory = (workerInput) => {
            const worker = new FakeWorker();
            workers.push(worker);
            const runs = workerInput.runIndexes.map((runIndex) => reference.runs[runIndex]);
            worker.complete(runs, workerInput.runIndexes[0] === 0 ? 20 : 0);
            return worker;
        };

        const result = await runBatchParallel(
            batchInput,
            { workers: 2 },
            { createWorker: factory },
        );
        expect(result).toEqual(reference);
        expect(result.runs.map(({ runIndex }) => runIndex)).toEqual([0, 1, 2, 3]);
        expect(workers.every((worker) => worker.exited && !worker.terminated)).toBe(true);
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

    it("handles zero runs without spawning workers", async () => {
        let spawned = 0;
        const result = await runBatchParallel(input({ runs: 0 }), { workers: 8 }, {
            createWorker: () => {
                spawned += 1;
                throw new Error("must not spawn");
            },
        });
        expect(result).toEqual(runBatch(input({ runs: 0 })));
        expect(spawned).toBe(0);
        expect(effectiveWorkerCount(8, 0)).toBe(0);
    });

    it("clamps requested workers to runs", async () => {
        const batchInput = input({ runs: 2, replay: false });
        const reference = runBatch(batchInput);
        let spawned = 0;
        const factory: WorkerFactory = (workerInput) => {
            spawned += 1;
            const worker = new FakeWorker();
            worker.complete(workerInput.runIndexes.map((runIndex) => reference.runs[runIndex]));
            return worker;
        };
        expect(await runBatchParallel(batchInput, { workers: 8 }, { createWorker: factory }))
            .toEqual(reference);
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

    it("aggregates progress to the exact total without affecting deterministic results", async () => {
        const updates: Array<[number, number]> = [];
        const batchInput = input({ runs: 5, replay: false });
        const withProgress = await runBatchParallel(batchInput, {
            workers: 2,
            onProgress: (completed, total) => updates.push([completed, total]),
        });
        const withoutProgress = await runBatchParallel(batchInput, { workers: 2 });
        expect(updates.at(-1)).toEqual([5, 5]);
        expect(updates.every(([, total]) => total === 5)).toBe(true);
        expect(withProgress).toEqual(withoutProgress);
    }, 20_000);

    it("rejects worker crashes as infrastructure failures and terminates the pool", async () => {
        const created: FakeWorker[] = [];
        const factory: WorkerFactory = (workerInput: BatchWorkerInput) => {
            const worker = new FakeWorker();
            created.push(worker);
            if (workerInput.runIndexes[0] === 0) worker.fail("synthetic crash");
            return worker;
        };

        await expect(runBatchParallel(
            input({ replay: false }),
            { workers: 2 },
            { createWorker: factory },
        )).rejects.toThrow(/Worker infrastructure failure.*synthetic crash/);
        expect(created).toHaveLength(2);
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
