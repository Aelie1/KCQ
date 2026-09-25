const { performance } = require("node:perf_hooks");

const [encounterId, policyId, runsText, maxActionsText = "1000", seedText = "12345"] = process.argv.slice(2);
const runs = Number(runsText);
const counts = {
    gameStatusConstructions: 0,
    refreshViewCalls: 0,
    actionViewConstructions: 0,
    engineGetGameStateCalls: 0,
    targetEvaluations: 0,
    intentionEvaluations: 0,
    intentionPreviewEvaluations: 0,
    enemyActionIntentionEvaluations: 0,
    resolveMoveCalls: 0,
    structuredCloneCalls: 0,
    structuredCloneMs: 0,
    structuredCloneJsonBytes: 0,
    clonedEnemies: 0,
    clonedIntentions: 0,
    clonedBindings: 0,
    clonedMoves: 0,
    clonedMoveTargetEntries: 0,
    clonedEscapeEntries: 0,
    policyCalls: 0,
    policyMs: 0,
};

const statusModule = require("../dist/engine/protected/status.js");
const OriginalGameStatus = statusModule.GameStatus;
statusModule.GameStatus = class CountedGameStatus extends OriginalGameStatus {
    constructor(...args) {
        counts.gameStatusConstructions++;
        super(...args);
    }
};

const combatModule = require("../dist/engine/private/combat.js");
const originalIsValidTarget = combatModule.isValidTarget;
combatModule.isValidTarget = function countedIsValidTarget(...args) {
    counts.targetEvaluations++;
    return originalIsValidTarget(...args);
};
const originalEvaluateIntention = combatModule.evaluateIntention;
combatModule.evaluateIntention = function countedEvaluateIntention(...args) {
    counts.intentionEvaluations++;
    const stack = new Error().stack ?? "";
    if (stack.includes("serializeIntention")) counts.intentionPreviewEvaluations++;
    if (stack.includes("executeEnemyAction")) counts.enemyActionIntentionEvaluations++;
    return originalEvaluateIntention(...args);
};
const originalResolveMove = combatModule.resolveMove;
combatModule.resolveMove = function countedResolveMove(...args) {
    counts.resolveMoveCalls++;
    return originalResolveMove(...args);
};

const viewModule = require("../dist/engine/private/view.js");
const originalGetActionView = viewModule.getActionView;
viewModule.getActionView = function countedGetActionView(...args) {
    counts.actionViewConstructions++;
    return originalGetActionView(...args);
};

const engineModule = require("../dist/engine/private/engine.js");
const originalRefreshView = engineModule.GameEngine.prototype.refreshView;
engineModule.GameEngine.prototype.refreshView = function countedRefreshView(...args) {
    counts.refreshViewCalls++;
    return originalRefreshView.apply(this, args);
};
const originalEngineGetGameState = engineModule.GameEngine.prototype.getGameState;
engineModule.GameEngine.prototype.getGameState = function countedEngineGetGameState(...args) {
    counts.engineGetGameStateCalls++;
    return originalEngineGetGameState.apply(this, args);
};

const originalStructuredClone = globalThis.structuredClone;
globalThis.structuredClone = function countedStructuredClone(...args) {
    const value = args[0];
    if (value && typeof value === "object" && value.turn && Array.isArray(value.enemies)) {
        counts.structuredCloneJsonBytes += Buffer.byteLength(JSON.stringify(value));
        counts.clonedEnemies += value.enemies.length;
        counts.clonedIntentions += value.enemies.reduce((sum, enemy) => sum + enemy.intentions.length, 0);
        counts.clonedBindings += value.characters.reduce((sum, character) => sum + character.bindings.length, 0);
    } else if (Array.isArray(value) && value.every((action) => action && Array.isArray(action.moves))) {
        counts.structuredCloneJsonBytes += Buffer.byteLength(JSON.stringify(value));
        counts.clonedMoves += value.reduce((sum, action) => sum + action.moves.length, 0);
        counts.clonedMoveTargetEntries += value.reduce((sum, action) => sum + action.moves.reduce((moveSum, move) => moveSum + move.targets.length, 0), 0);
        counts.clonedEscapeEntries += value.reduce((sum, action) => sum + action.escapes.length, 0);
    }
    const started = performance.now();
    const result = originalStructuredClone(...args);
    counts.structuredCloneMs += performance.now() - started;
    counts.structuredCloneCalls++;
    return result;
};

const { runBatch } = require("../dist/harness/batch.js");
const { getPolicy } = require("../dist/harness/policies.js");
const basePolicy = getPolicy(policyId);
if (!basePolicy) throw new Error(`unknown policy ${policyId}`);
const policy = {
    id: basePolicy.id,
    chooseAction(context) {
        const started = performance.now();
        try {
            return basePolicy.chooseAction(context);
        } finally {
            counts.policyMs += performance.now() - started;
            counts.policyCalls++;
        }
    },
};

const started = performance.now();
const result = runBatch({
    encounterId,
    policy,
    masterSeed: Number(seedText),
    runs,
    maxActions: Number(maxActionsText),
    replay: false,
});
const elapsedMs = performance.now() - started;
const decisions = result.runs.reduce((sum, run) => sum + run.result.metrics.decisions, 0);

console.log(JSON.stringify({
    encounterId,
    policyId,
    runs,
    decisions,
    meanDecisions: decisions / runs,
    elapsedMs,
    counts,
    perRun: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value / runs])),
    perDecision: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value / decisions])),
}));
