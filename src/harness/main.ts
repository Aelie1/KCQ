import fs from "node:fs";
import path from "node:path";
import { runSingleFight } from "./singleFight";

const encounterId = "plains_1";
const engineSeed = 12345;

const result = runSingleFight({
    encounterId,
    engineSeed,
    maxActions: 1000,
});

const outputDir = path.resolve("harness-output");
fs.mkdirSync(outputDir, { recursive: true });

const filename = `${encounterId}-${engineSeed}.json`;
const outputPath = path.join(outputDir, filename);

fs.writeFileSync(
    outputPath,
    JSON.stringify(result, null, 2),
    "utf8",
);

console.log(`Wrote ${outputPath}`);