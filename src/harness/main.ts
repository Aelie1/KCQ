import fs from "node:fs";
import path from "node:path";
import { runSingleFight } from "./harness";
import { getPolicy } from "./policies";

const DEFAULT_POLICY_SEED = 0;
const DEFAULT_MAX_ACTIONS = 1_000;
const [encounterId, engineSeedArgument, policyId, policySeedArgument] = process.argv.slice(2);

if (!encounterId || !engineSeedArgument || !policyId) {
    fail(
        "Usage: npm run fight -- <encounterId> <engineSeed> <policy> [policySeed] "
        + `(policySeed defaults to ${DEFAULT_POLICY_SEED})`,
    );
}

const engineSeed = parseSeed(engineSeedArgument, "engineSeed");
const policySeed = policySeedArgument === undefined
    ? DEFAULT_POLICY_SEED
    : parseSeed(policySeedArgument, "policySeed");
const policy = getPolicy(policyId);
if (!policy) {
    fail(`Unknown policy: ${policyId}. Available policies: first, random, swing-only`);
}

const result = runSingleFight({
    encounterId,
    engineSeed,
    policy,
    policySeed,
    maxActions: DEFAULT_MAX_ACTIONS,
    replay: true,
});

const outputDir = path.resolve("harness-output");
fs.mkdirSync(outputDir, { recursive: true });

const filename = [
    safeFilenamePart(encounterId),
    `engine-${engineSeed}`,
    safeFilenamePart(policy.id),
    `policy-${policySeed}`,
].join("-") + ".json";
const outputPath = path.join(outputDir, filename);

fs.writeFileSync(
    outputPath,
    JSON.stringify(result, null, 2),
    "utf8",
);

console.log(`Wrote ${outputPath}`);

function parseSeed(value: string, name: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        fail(`${name} must be a safe integer; received ${value}`);
    }
    return parsed;
}

function safeFilenamePart(value: string): string {
    return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function fail(message: string): never {
    console.error(message);
    process.exit(1);
}
