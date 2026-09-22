import { parentPort, workerData } from "node:worker_threads";
import { runSingleFight } from "../harness";
import { getPolicy } from "../policies";
import { deriveRunSeeds, type BatchRun } from "./batch";

export interface BatchWorkerInput {
    encounterId: string;
    policyId: string;
    masterSeed: number;
    maxActions: number;
    replay: boolean;
    runIndexes: number[];
}

export type BatchWorkerMessage =
    | { type: "progress"; completedDelta: number }
    | { type: "result"; runs: BatchRun[] };

const PROGRESS_CHUNK_SIZE = 16;

if (parentPort === null) {
    throw new Error("Batch worker must run inside a worker thread");
}

const input = workerData as BatchWorkerInput;
const policy = getPolicy(input.policyId);
if (policy === undefined) {
    throw new Error(`Worker could not resolve registered policy: ${input.policyId}`);
}

const runs: BatchRun[] = [];
let unreported = 0;
for (const runIndex of input.runIndexes) {
    const { engineSeed, policySeed } = deriveRunSeeds(input.masterSeed, runIndex);
    const result = runSingleFight({
        encounterId: input.encounterId,
        engineSeed,
        policySeed,
        maxActions: input.maxActions,
        policy,
        replay: input.replay,
    });
    runs.push({ runIndex, engineSeed, policySeed, result });
    unreported += 1;
    if (unreported >= PROGRESS_CHUNK_SIZE) {
        parentPort.postMessage({ type: "progress", completedDelta: unreported } satisfies BatchWorkerMessage);
        unreported = 0;
    }
}

if (unreported > 0) {
    parentPort.postMessage({ type: "progress", completedDelta: unreported } satisfies BatchWorkerMessage);
}
parentPort.postMessage({ type: "result", runs } satisfies BatchWorkerMessage);
