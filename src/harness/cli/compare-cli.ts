import type { FightPolicy } from "../harness";
import { getPolicy, policies } from "../policies";

const DEFAULT_MAX_ACTIONS = 1_000;
const DEFAULT_WORKERS = 8;
const REPLAY_LEVELS_OPTION = "--replay-levels";
const USAGE = "Usage: npm run compare -- <encounters> <masterSeed> <policies> <runs>"
    + " [maxActions] [workers] [--replay-levels <level,...|all|none>]";

export interface CompareCommandArguments {
    encounterIds: string[];
    masterSeed: number;
    selectedPolicies: FightPolicy[];
    runs: number;
    maxActions: number;
    workers: number;
    replayEncounterIds: string[];
}

/** Parses positional comparison arguments plus the order-independent replay-level filter. */
export function parseCompareCommandArguments(args: readonly string[]): CompareCommandArguments {
    const { positionals, replayLevels } = extractOptions(args);
    if (positionals.length < 4 || positionals.length > 6) {
        fail("Expected four required arguments and optional maxActions/workers.");
    }

    const [encounterArg, masterSeedArg, policyArg, runsArg, maxActionsArg, workersArg]
        = positionals;
    const encounterIds = commaSeparated(encounterArg, "encounters");
    const masterSeed = parseInteger(masterSeedArg, "masterSeed");
    const runs = parseInteger(runsArg, "runs", true);
    const maxActions = maxActionsArg === undefined
        ? DEFAULT_MAX_ACTIONS
        : parseInteger(maxActionsArg, "maxActions", true);
    const workers = workersArg === undefined
        ? DEFAULT_WORKERS
        : parseInteger(workersArg, "workers", true);

    const policyIds = policyArg === "all"
        ? Object.keys(policies)
        : commaSeparated(policyArg, "policies");
    const selectedPolicies = policyIds.map((id) => {
        const policy = getPolicy(id);
        if (!policy) {
            fail(`Unknown policy: ${id}. Available policies: ${Object.keys(policies).join(", ")}`);
        }
        return policy;
    });

    return {
        encounterIds,
        masterSeed,
        selectedPolicies,
        runs,
        maxActions,
        workers,
        replayEncounterIds: resolveReplayEncounterIds(replayLevels, encounterIds),
    };
}

export function resolveReplayEncounterIds(
    argument: string | undefined,
    encounterIds: readonly string[],
): string[] {
    if (argument === undefined || argument === "all") return [...encounterIds];
    if (argument === "none") return [];

    const requested = commaSeparated(argument, "replay levels");
    const unknown = requested.filter((id) => !encounterIds.includes(id));
    if (unknown.length > 0) {
        fail(`Replay levels must be included in encounters; received: ${unknown.join(", ")}.`);
    }
    const wanted = new Set(requested);
    return encounterIds.filter((id) => wanted.has(id));
}

function extractOptions(args: readonly string[]): {
    positionals: string[];
    replayLevels?: string;
} {
    const positionals: string[] = [];
    let replayLevels: string | undefined;

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === REPLAY_LEVELS_OPTION) {
            if (replayLevels !== undefined) fail(`${REPLAY_LEVELS_OPTION} may be specified only once.`);
            const value = args[index + 1];
            if (value === undefined || value.startsWith("--")) {
                fail(`${REPLAY_LEVELS_OPTION} requires a value.`);
            }
            replayLevels = value;
            index += 1;
            continue;
        }
        if (argument.startsWith(`${REPLAY_LEVELS_OPTION}=`)) {
            if (replayLevels !== undefined) fail(`${REPLAY_LEVELS_OPTION} may be specified only once.`);
            replayLevels = argument.slice(REPLAY_LEVELS_OPTION.length + 1);
            if (!replayLevels.trim()) fail(`${REPLAY_LEVELS_OPTION} requires a value.`);
            continue;
        }
        if (argument.startsWith("--")) fail(`Unknown option: ${argument}.`);
        positionals.push(argument);
    }

    return { positionals, ...(replayLevels === undefined ? {} : { replayLevels }) };
}

function commaSeparated(value: string, name: string): string[] {
    const values = value.split(",").map((item) => item.trim()).filter(Boolean);
    if (values.length === 0) fail(`${name} must not be empty.`);
    return [...new Set(values)];
}

function parseInteger(value: string, name: string, positive = false): number {
    const parsed = Number(value);
    if (!value.trim() || !Number.isSafeInteger(parsed) || (positive && parsed <= 0)) {
        fail(`${name} must be a ${positive ? "positive " : ""}safe integer.`);
    }
    return parsed;
}

function fail(message: string): never {
    throw new Error(`${message}\n${USAGE}`);
}
