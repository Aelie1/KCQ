import type { BatchInput } from "../batch/batch";
import { getPolicy, policies } from "../policies";
import { CONFIGURATION_USAGE, extractConfigurationArguments } from "./configuration-cli";

const DEFAULT_MAX_ACTIONS = 1_000;
const USAGE = "Usage: npm run batch -- <encounterId> <masterSeed> <policy> <runs> [maxActions]"
    + ` [workers]${CONFIGURATION_USAGE} (maxActions defaults to ${DEFAULT_MAX_ACTIONS}; workers defaults to 1)`;

export interface BatchCommandArguments {
    input: BatchInput;
    workers: number;
}

/** Extended direct-CLI parser; the first five positional arguments retain their meaning. */
export function parseBatchCommandArguments(args: readonly string[]): BatchCommandArguments {
    const extracted = extractConfigurationArguments(args);
    args = extracted.args;
    if (args.length < 4 || args.length > 6) {
        fail("Expected four required arguments and optional maxActions/workers.");
    }
    const input = parseBatchArguments(args.slice(0, 5));
    const workers = args[5] === undefined ? 1 : parseInteger(args[5], "workers", true);
    return { input: { ...input, ...extracted.configuration }, workers };
}

export function parseBatchArguments(args: readonly string[]): BatchInput {
    const extracted = extractConfigurationArguments(args);
    args = extracted.args;
    if (args.length < 4 || args.length > 5) {
        fail("Expected four required arguments and an optional maxActions.");
    }

    const [encounterId, seedArgument, policyId, runsArgument, maxActionsArgument] = args;
    if (!encounterId.trim()) fail("encounterId must not be empty.");

    const masterSeed = parseInteger(seedArgument, "masterSeed");
    const runs = parseInteger(runsArgument, "runs", true);
    const maxActions = maxActionsArgument === undefined
        ? DEFAULT_MAX_ACTIONS
        : parseInteger(maxActionsArgument, "maxActions", true);
    const policy = getPolicy(policyId);
    if (!policy) {
        fail(`Unknown policy: ${policyId}. Available policies: ${Object.keys(policies).join(", ")}`);
    }

    return { encounterId, masterSeed, policy, runs, maxActions, replay: false, ...extracted.configuration };
}

function parseInteger(value: string, name: string, positive = false): number {
    const parsed = Number(value);
    if (!value.trim() || !Number.isSafeInteger(parsed) || (positive && parsed <= 0)) {
        fail(`${name} must be a ${positive ? "positive " : ""}safe integer; received ${JSON.stringify(value)}`);
    }
    return parsed;
}

function fail(message: string): never {
    throw new Error(`${message}\n${USAGE}`);
}
