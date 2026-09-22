import { parentPort } from "node:worker_threads";
import { executeBatchWorkerInput } from "./batch-worker-job";
import type { BatchWorkerRequest, BatchWorkerResponse } from "./batch-worker-protocol";

export type { BatchWorkerInput, BatchWorkerMessage } from "./batch-worker-protocol";

const port = parentPort;
if (port === null) {
    throw new Error("Batch worker must run inside a worker thread");
}

port.on("message", (message: BatchWorkerRequest) => {
    if (message.type === "shutdown") {
        port.close();
        return;
    }

    const { jobId, input } = message;
    try {
        const runs = executeBatchWorkerInput(input, (completedDelta) => {
            port.postMessage({
                type: "progress",
                jobId,
                completedDelta,
            } satisfies BatchWorkerResponse);
        });
        port.postMessage({ type: "result", jobId, runs } satisfies BatchWorkerResponse);
    } catch (error: unknown) {
        port.postMessage({
            type: "error",
            jobId,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        } satisfies BatchWorkerResponse);
    }
});
