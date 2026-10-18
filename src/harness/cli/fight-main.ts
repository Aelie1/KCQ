import { runSingleFight } from "../harness";
import { writeFightResult } from "../output";
import { getPolicy, policies } from "../policies";
import { CONFIGURATION_USAGE, extractConfigurationArguments } from "./configuration-cli";

const DEFAULT_POLICY_SEED = 0;
const DEFAULT_MAX_ACTIONS = 1_000;
const { args, configuration } = extractConfigurationArguments(process.argv.slice(2));
const [encounterId, engineSeedArgument, policyId, policySeedArgument] = args;

if (!encounterId || !engineSeedArgument || !policyId || args.length > 4 || args.some(arg => arg.startsWith("--"))) {
    fail(
        "Usage: npm run fight -- <encounterId> <engineSeed> <policy> [policySeed] "
        + `${CONFIGURATION_USAGE} (policySeed defaults to ${DEFAULT_POLICY_SEED})`,
    );
}

const engineSeed = parseSeed(engineSeedArgument, "engineSeed");
const policySeed = policySeedArgument === undefined
    ? DEFAULT_POLICY_SEED
    : parseSeed(policySeedArgument, "policySeed");
const policy = getPolicy(policyId);
if (!policy) {
    fail(`Unknown policy: ${policyId}. Available policies: ${Object.keys(policies).join(", ")}`);
}

const input = {
    ...configuration,
    encounterId,
    engineSeed,
    policy,
    policySeed,
    maxActions: DEFAULT_MAX_ACTIONS,
    replay: true,
} as const;
const result = runSingleFight(input);
const outputPath = writeFightResult(input, result);

console.log(`Wrote ${outputPath}`);

function parseSeed(value: string, name: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        fail(`${name} must be a safe integer; received ${value}`);
    }
    return parsed;
}

function fail(message: string): never {
    console.error(message);
    process.exit(1);
}
