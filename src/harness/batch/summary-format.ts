import type { BatchSummary, DistributionSummary, OutcomeMetric } from "./summary";

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
        `Damage:  mean ${formatMean(summary.metrics.meanDamage)}`,
        `Peak bondage: mean ${formatMean(summary.metrics.meanPeakBondage)}`,
        `Escapes: mean ${formatMean(summary.metrics.meanEscapes)}`,
        `Win 95%: ${summary.metrics.win95 === null ? "n/a" : formatInterval(summary.metrics.win95)}`,
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

function formatMean(value: number | null): string {
    return value === null ? "n/a" : value.toFixed(1);
}

function formatInterval(interval: { lower: number; upper: number }): string {
    return `${(interval.lower * 100).toFixed(1)}%-${(interval.upper * 100).toFixed(1)}%`;
}
