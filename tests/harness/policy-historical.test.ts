import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { runSingleFight } from "../../src/harness/harness";
import { policies, type PolicyId } from "../../src/harness/policies";

// Seeded trace/state baselines. The three high-binding cases were refreshed after
// removing the 90% reduction above 80; restoring that old rule reproduces their
// original Cycle 3A hashes exactly. The other three hashes remain unchanged.
const historical: [string, PolicyId, string][] = [
    ["plains_1", "idle", "a82dc6c7ec1870abd1f845aac31a605886c979fdee21139a527020593cdacfaa"],
    ["plains_1", "smart", "33f70ad0ecb5f7b7606daf3dd69253e46ca5d27859608295c6f522d8175da05d"],
    ["plains_1", "basic", "25365da1411e16ea5e879e1b6b956892a8a2722d093dc243fa096cbc3a868e77"],
    ["forest_1", "idle", "395e82d761bb8d53744554f454ebc0fc132433810cbd9606a77b50f6befd8105"],
    ["forest_1", "smart", "cfce6c9385f05f1bf6b07fd88009663603a69b10ec9087e4dc08115e6760b257"],
    ["forest_1", "basic", "33c92796a746351597c20df02cef90d29aa6e8d511cdfc9e891c29ecc24743b5"],
];

it.each(historical)("preserves the seeded %s %s trace and state", (encounterId, policyId, expected) => {
    const result = runSingleFight({ encounterId, policy: policies[policyId], engineSeed: 12345, policySeed: 17, maxActions: 24 });
    expect(result.error).toBeUndefined();
    const digest = createHash("sha256").update(JSON.stringify({ trace: result.trace, finalState: result.finalState })).digest("hex");
    expect(digest).toBe(expected);
});
