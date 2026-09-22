import { runSingleFight } from "../harness";
import { getPolicy } from "../policies";
import { deriveRunSeeds, type BatchRun } from "./batch";
import type { BatchWorkerInput } from "./batch-worker-protocol";

const PROGRESS_CHUNK_SIZE = 16;

/** Executes one serializable worker fragment with fresh fight state for every run index. */
export function executeBatchWorkerInput(
    input: BatchWorkerInput,
    onProgress?: (completedDelta: number) => void,
): BatchRun[] {
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
            onProgress?.(unreported);
            unreported = 0;
        }
    }

    if (unreported > 0) onProgress?.(unreported);
    return runs;
}
