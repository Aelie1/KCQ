const fs = require("node:fs");

const path = process.argv[2];
if (!path) throw new Error("usage: node .perf/analyze-profile.cjs <profile>");
const profile = JSON.parse(fs.readFileSync(path, "utf8"));
const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
const parents = new Map();
for (const node of profile.nodes) {
    for (const child of node.children ?? []) parents.set(child, node.id);
}

const keyFor = (node) => {
    const frame = node.callFrame;
    const url = frame.url.replace(/^file:\/\/\//, "").replaceAll("%20", " ").replaceAll("\\", "/");
    const shortUrl = url.includes("/kcq/") ? url.slice(url.indexOf("/kcq/") + 5) : url;
    return `${frame.functionName || "(anonymous)"}\t${shortUrl}:${frame.lineNumber + 1}`;
};

const self = new Map();
const inclusive = new Map();
let totalUs = 0;
for (let index = 0; index < profile.samples.length; index++) {
    const duration = profile.timeDeltas[index] ?? 0;
    const sampledId = profile.samples[index];
    totalUs += duration;
    const sampledKey = keyFor(nodes.get(sampledId));
    self.set(sampledKey, (self.get(sampledKey) ?? 0) + duration);

    const seenKeys = new Set();
    let id = sampledId;
    while (id !== undefined) {
        const key = keyFor(nodes.get(id));
        if (!seenKeys.has(key)) inclusive.set(key, (inclusive.get(key) ?? 0) + duration);
        seenKeys.add(key);
        id = parents.get(id);
    }
}

const rows = [...new Set([...self.keys(), ...inclusive.keys()])].map((key) => ({
    key,
    selfMs: (self.get(key) ?? 0) / 1000,
    inclusiveMs: (inclusive.get(key) ?? 0) / 1000,
    selfPct: 100 * (self.get(key) ?? 0) / totalUs,
    inclusivePct: 100 * (inclusive.get(key) ?? 0) / totalUs,
}));

console.log(`profile=${path} total=${(totalUs / 1e6).toFixed(3)}s samples=${profile.samples.length}`);
console.log("TOP SELF");
for (const row of rows.sort((a, b) => b.selfMs - a.selfMs).slice(0, 30)) {
    console.log(`${row.selfMs.toFixed(1)}ms\t${row.selfPct.toFixed(2)}%\t${row.inclusiveMs.toFixed(1)}ms\t${row.inclusivePct.toFixed(2)}%\t${row.key}`);
}
console.log("TOP INCLUSIVE");
for (const row of rows.sort((a, b) => b.inclusiveMs - a.inclusiveMs).slice(0, 50)) {
    console.log(`${row.selfMs.toFixed(1)}ms\t${row.selfPct.toFixed(2)}%\t${row.inclusiveMs.toFixed(1)}ms\t${row.inclusivePct.toFixed(2)}%\t${row.key}`);
}
console.log("SELECTED");
const selected = /structuredClone|refreshView|getGameView|GameStatus|mergeStatus|mergeModifiers|getStatusList|getActionView|getMovesList|getTargets|getEscapes|isValidTarget|calculateAccuracy|evaluateIntention|serializeIntention|serializeGameState|resolveMove|chooseAction|partyTotalBondage|cloneAction|deriveRunSeeds|summar/i;
for (const row of rows.filter((candidate) => selected.test(candidate.key)).sort((a, b) => b.inclusiveMs - a.inclusiveMs)) {
    console.log(`${row.selfMs.toFixed(1)}ms\t${row.selfPct.toFixed(2)}%\t${row.inclusiveMs.toFixed(1)}ms\t${row.inclusivePct.toFixed(2)}%\t${row.key}`);
}
