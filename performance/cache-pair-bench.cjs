const path = require("node:path");
const { performance } = require("node:perf_hooks");

const [checkoutText, encounterId, runsText, maxActionsText = "1000", seedText = "12345"] = process.argv.slice(2);
const checkout = path.resolve(checkoutText);
const { createEngine } = require(path.join(checkout, "dist/engine/public/engine.js"));
const runs = Number(runsText);
const maxActions = Number(maxActionsText);
const masterSeed = Number(seedText);
let decisions = 0;
const terminations = {};

const started = performance.now();
for (let runIndex = 0; runIndex < runs; runIndex++) {
    const engineSeed = deriveEngineSeed(masterSeed, runIndex);
    const engine = createEngine(engineSeed);
    for (const id of engine.listCharacters()) engine.loadCharacter(id);
    engine.loadEncounter(encounterId);
    let view = engine.getGameView();
    let count = 0;
    while (view.turn.outcome === "ongoing" && count < maxActions) {
        const action = chooseSwingOnly(view);
        const result = engine.executeAction(action);
        if (!result.success) throw new Error(`rejected action: ${result.reason}`);
        view = result.view;
        count++;
    }
    decisions += count;
    const termination = view.turn.outcome === "ongoing" ? "maxActions" : view.turn.outcome;
    terminations[termination] = (terminations[termination] ?? 0) + 1;
}
const elapsedMs = performance.now() - started;
console.log(JSON.stringify({
    checkout: path.basename(checkout), encounterId, policyId: "swing-only", runs, masterSeed,
    elapsedMs, runsPerSecond: runs / (elapsedMs / 1000), meanDecisions: decisions / runs,
    decisionsPerSecond: decisions / (elapsedMs / 1000), decisions, terminations,
}));

function chooseSwingOnly(view) {
    const programmedMoves = { ko: "telekinesis", matsuko: "whiteFlame", hinari: "rockfall" };
    for (const actionView of view.actions) {
        if (!actionView.available) continue;
        const moveId = programmedMoves[actionView.id];
        const info = actionView.moves.find((candidate) => candidate.move.id === moveId && candidate.available);
        if (!info) continue;
        const count = info.move.targets;
        const targets = count === "all" || count === 0
            ? []
            : info.targets.filter((candidate) => candidate.valid && candidate.target !== null).slice(0, count).map((candidate) => candidate.target);
        return { type: "move", actor: actionView.id, move: moveId, targets };
    }
    return { type: "endTurn" };
}

function deriveEngineSeed(master, runIndex) {
    const mask = 0xffff_ffff_ffff_ffffn;
    const indexed = (BigInt.asUintN(64, BigInt(master)) + BigInt(runIndex) * 0x9e37_79b9_7f4a_7c15n) & mask;
    return Number(mix64(indexed ^ 0x243f_6a88_85a3_08d3n) & 0xffff_ffffn);
}

function mix64(input) {
    const mask = 0xffff_ffff_ffff_ffffn;
    let value = input & mask;
    value = ((value ^ (value >> 30n)) * 0xbf58_476d_1ce4_e5b9n) & mask;
    value = ((value ^ (value >> 27n)) * 0x94d_49bb_1331_11ebn) & mask;
    return (value ^ (value >> 31n)) & mask;
}
