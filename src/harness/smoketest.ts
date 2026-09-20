import { runBatch } from "./batch";
import { firstPolicy } from "./policy/first";
import { summarizeBatch } from "./summary";

const batch = runBatch({
    encounterId: "plains_1",
    policy: firstPolicy,
    masterSeed: 1,
    runs: 1000,
    maxActions: 1000,
});

console.log(JSON.stringify(summarizeBatch(batch), null, 2));