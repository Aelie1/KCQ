import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { runSingleFight } from "../../src/harness/harness";
import { policies, type PolicyId } from "../../src/harness/policies";

// Captured before Cycle 3B edits. Escape's active-roster selection and Basic's
// blocked-move fallback intentionally change decisions; those have direct tests.
const historical: [string, PolicyId, string][] = [
    ["plains_1", "idle", "d68733b1e6754cd20635fbe22fc66442a3285c0bd44c78a689bffc30b0e41392"],
    ["plains_1", "smart", "33f70ad0ecb5f7b7606daf3dd69253e46ca5d27859608295c6f522d8175da05d"],
    ["plains_1", "basic", "25365da1411e16ea5e879e1b6b956892a8a2722d093dc243fa096cbc3a868e77"],
    ["forest_1", "idle", "9e41db1d3c8ddff90badc3fa0b73521ddb49c589be4a75811b9507056ac43295"],
    ["forest_1", "smart", "cfce6c9385f05f1bf6b07fd88009663603a69b10ec9087e4dc08115e6760b257"],
    ["forest_1", "basic", "737bb5b7dda15e8b5a6a5d75ebc927f757b5167eb77b3074c33f10ae5dba9ce9"],
];

it.each(historical)("preserves the Cycle 3A %s %s trace and state", (encounterId, policyId, expected) => {
    const result = runSingleFight({ encounterId, policy: policies[policyId], engineSeed: 12345, policySeed: 17, maxActions: 24 });
    expect(result.error).toBeUndefined();
    const digest = createHash("sha256").update(JSON.stringify({ trace: result.trace, finalState: result.finalState })).digest("hex");
    expect(digest).toBe(expected);
});
