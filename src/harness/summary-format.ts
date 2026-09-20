import type { BatchSummary, DistributionSummary, OutcomeMetric, RunReference } from "./summary";

/** Plain-text presentation of existing summary values; no statistics are recomputed. */
export function formatBatchSummary(summary: BatchSummary): string[] {
    const lines = [
        `${summary.encounterId} / ${summary.policyId}`,
        `${summary.runCount} runs / master seed ${summary.masterSeed}`,
        "",
        `Victory: ${formatOutcome(summary.outcomes.victory)}`,
        `Defeat:  ${formatOutcome(summary.outcomes.defeat)}`,
        `Max:     ${formatOutcome(summary.outcomes.maxActions)}`,
        `Errors:  ${formatOutcome(summary.outcomes.error)}`,
        "",
        `Actions: ${formatDistribution(summary.fightLength.actionCount)}`,
        `Rounds:  ${formatDistribution(summary.fightLength.round)}`,
        "",
    ];

    const moves = Object.entries(summary.actionUsage.moves)
        .sort(([leftId, leftCount], [rightId, rightCount]) =>
            rightCount - leftCount || (leftId < rightId ? -1 : leftId > rightId ? 1 : 0));
    if (moves.length > 0) {
        lines.push("Moves:", ...moves.map(([id, count]) => `  ${id}  ${count}`));
    }
    lines.push(
        `Escape: ${summary.actionUsage.escapeActions}`,
        `Stance: ${summary.actionUsage.stanceActions}`,
        `End turn: ${summary.actionUsage.endTurnActions}`,
    );

    const characters = Object.keys(summary.finalParty).sort();
    if (characters.length > 0) {
        lines.push("", "Final binding:", ...characters.map((id) => {
            const condition = summary.finalParty[id];
            return `  ${id}  avg ${condition.averageTotalBinding.toFixed(1)} / max ${condition.maxTotalBinding}`;
        }));
    }

    appendReferences(lines, "Defeats", summary.interestingRuns.defeats);
    appendReferences(lines, "Errors", summary.interestingRuns.errors);
    appendReferences(lines, "Max actions", summary.interestingRuns.maxActions);
    return lines;
}

function formatOutcome(outcome: OutcomeMetric): string {
    return `${outcome.count} (${(outcome.rate * 100).toFixed(1)}%)`;
}

function formatDistribution(distribution: DistributionSummary | null): string {
    if (distribution === null) return "n/a";
    return `min ${distribution.min} / median ${distribution.median}`
        + ` / mean ${distribution.mean.toFixed(1)} / p90 ${distribution.p90} / max ${distribution.max}`;
}

function appendReferences(lines: string[], label: string, references: RunReference[]): void {
    if (references.length === 0) return;
    lines.push("", `${label}:`, ...references.map((run) =>
        `  run ${run.runIndex}  engine ${run.engineSeed}  policy ${run.policySeed}`
        + `  actions ${run.actionCount}  round ${run.round}`));
}
