import type { BatchRun } from "./batch";
import type { FightConfigurationInput } from "../configuration";

export interface BatchWorkerInput extends FightConfigurationInput {
    encounterId: string;
    policyId: string;
    masterSeed: number;
    maxActions: number;
    replay: boolean;
    runIndexes: number[];
}

export type BatchWorkerRequest =
    | { type: "run"; jobId: number; input: BatchWorkerInput }
    | { type: "shutdown" };

export type BatchWorkerResponse =
    | { type: "progress"; jobId: number; completedDelta: number }
    | { type: "result"; jobId: number; runs: BatchRun[] }
    | { type: "error"; jobId: number; message: string; stack?: string };

export type BatchWorkerMessage = BatchWorkerResponse;
