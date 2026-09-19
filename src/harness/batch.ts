import {
    runSingleFight,
    type FightPolicy,
    type SingleFightResult,
} from "./harness";

export interface BatchInput {
    encounterId: string;
    policy: FightPolicy;
    masterSeed: number;
    runs: number;
    maxActions: number;
    replay?: boolean;
}

export interface BatchRun {
    runIndex: number;
    engineSeed: number;
    policySeed: number;
    result: SingleFightResult;
}

export interface BatchResult {
    encounterId: string;
    policyId: string;
    masterSeed: number;
    runs: BatchRun[];
}

export interface RunSeeds {
    engineSeed: number;
    policySeed: number;
}

const UINT64_MASK = 0xffff_ffff_ffff_ffffn;
const RUN_STRIDE = 0x9e37_79b9_7f4a_7c15n;
const ENGINE_STREAM = 0x243f_6a88_85a3_08d3n;
const POLICY_STREAM = 0x1319_8a2e_0370_7344n;

/**
 * Deterministically assigns independent engine and policy seeds to a run index.
 * These constants and operations are part of the persisted batch seed mapping.
 */
export function deriveRunSeeds(masterSeed: number, runIndex: number): RunSeeds {
    assertSafeInteger(masterSeed, "masterSeed");
    assertNonNegativeSafeInteger(runIndex, "runIndex");

    const master = BigInt.asUintN(64, BigInt(masterSeed));
    const indexedSeed = (master + (BigInt(runIndex) * RUN_STRIDE)) & UINT64_MASK;

    return {
        engineSeed: deriveStreamSeed(indexedSeed, ENGINE_STREAM),
        policySeed: deriveStreamSeed(indexedSeed, POLICY_STREAM),
    };
}

/** Runs a batch in run-index order using the single-fight harness primitive. */
export function runBatch(input: BatchInput): BatchResult {
    assertSafeInteger(input.masterSeed, "masterSeed");
    assertNonNegativeSafeInteger(input.runs, "runs");

    const runs: BatchRun[] = [];
    for (let runIndex = 0; runIndex < input.runs; runIndex += 1) {
        const { engineSeed, policySeed } = deriveRunSeeds(input.masterSeed, runIndex);
        const result = runSingleFight({
            encounterId: input.encounterId,
            engineSeed,
            policySeed,
            maxActions: input.maxActions,
            policy: input.policy,
            replay: input.replay,
        });

        runs.push({ runIndex, engineSeed, policySeed, result });
    }

    return {
        encounterId: input.encounterId,
        policyId: input.policy.id,
        masterSeed: input.masterSeed,
        runs,
    };
}

function deriveStreamSeed(indexedSeed: bigint, stream: bigint): number {
    return Number(mix64(indexedSeed ^ stream) & 0xffff_ffffn);
}

// SplitMix64 finalizer. BigInt keeps all mixing exact across JavaScript runtimes.
function mix64(input: bigint): bigint {
    let value = input & UINT64_MASK;
    value = ((value ^ (value >> 30n)) * 0xbf58_476d_1ce4_e5b9n) & UINT64_MASK;
    value = ((value ^ (value >> 27n)) * 0x94d0_49bb_1331_11ebn) & UINT64_MASK;
    return (value ^ (value >> 31n)) & UINT64_MASK;
}

function assertSafeInteger(value: number, name: string): void {
    if (!Number.isSafeInteger(value)) {
        throw new RangeError(`${name} must be a safe integer; received ${value}`);
    }
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
    assertSafeInteger(value, name);
    if (value < 0) {
        throw new RangeError(`${name} must be non-negative; received ${value}`);
    }
}
