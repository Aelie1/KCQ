import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { runSingleFight } from "../../src/harness/harness";
import { policies, type PolicyId } from "../../src/harness/policies";

// Seeded trace/state baselines include the public Enemy.skipped field added
// with Elite dormancy and the Fairy's broader support targeting. Plains hashes
// reproduce the previous baselines when only skipped is omitted. These remain
// full-state hashes; no fields are omitted in the assertions.
const historical: [string, PolicyId, string][] = [
    ["plains_1", "idle", "81cd1827f87e12de3f32e0099c83bcc17bcf4a77b18cc349c8e28b3f49958e5c"],
    ["plains_1", "smart", "cdc3b7d2186f696a7b1eaf386f04419bc39cbf6d15d3bffa2c64e0ef7190fd40"],
    ["plains_1", "basic", "4ec89660b4cba1e0ffecef08205e46cd473680c877242878f5e4a9c1343ede8c"],
    ["forest_1", "idle", "928c6c32c4d6fe42c38378d933715a1ab37ad37309000d779b45b2747c370c10"],
    ["forest_1", "smart", "5bad3d999f5fa25b9e9fe726c5443d7ed5916937f53cdf10d863f712c9069dfc"],
    ["forest_1", "basic", "316b1c4ac84d4ed691bfc028c5fb91e6b025238e205f2df3fe5ab38fe9c76449"],
];

it.each(historical)("preserves the seeded %s %s trace and state", (encounterId, policyId, expected) => {
    const result = runSingleFight({ encounterId, policy: policies[policyId], engineSeed: 12345, policySeed: 17, maxActions: 24 });
    expect(result.error).toBeUndefined();
    const digest = createHash("sha256").update(JSON.stringify({ trace: result.trace, finalState: result.finalState })).digest("hex");
    expect(digest).toBe(expected);
});
