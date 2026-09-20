import { performance } from "node:perf_hooks";
import { runBatch, type BatchResult } from "./batch";
import type { FightPolicy } from "./harness";
import { summarizeBatch, type BatchSummary } from "./summary";

export interface PolicyComparisonInput {
    encounterId: string;
    policies: readonly FightPolicy[];
    masterSeed: number;
    runs: number;
    maxActions: number;
}

export interface PolicyTiming {
    runtimeMs: number;
    meanPerRunMs: number | null;
}

export interface PolicyComparisonEntry {
    policyId: string;
    batch: BatchResult;
    summary: BatchSummary;
    timing: PolicyTiming;
}

export interface PolicyComparisonResult {
    encounterId: string;
    masterSeed: number;
    runs: number;
    maxActions: number;
    policies: PolicyComparisonEntry[];
    policyRuntimeTotalMs: number;
    overallElapsedMs: number;
}

export interface PolicyComparisonProgress {
    encounterId: string;
    policyId: string;
    policyIndex: number;
    policyCount: number;
    policyCompleted: number;
    policyTotal: number;
    overallCompleted: number;
    overallTotal: number;
}

export interface PolicyComparisonExecutionOptions {
    now?: () => number;
    runBatch?: typeof runBatch;
    onProgress?: (progress: PolicyComparisonProgress) => void;
    onPolicyComplete?: (entry: PolicyComparisonEntry) => void;
}

/** Runs policies sequentially over the same deterministic run-index seed corpus. */
export function executePolicyComparison(
    input: PolicyComparisonInput,
    options: PolicyComparisonExecutionOptions = {},
): PolicyComparisonResult {
    const now = options.now ?? (() => performance.now());
    const executeBatch = options.runBatch ?? runBatch;
    const startedAt = now();
    const entries: PolicyComparisonEntry[] = [];
    const overallTotal = input.policies.length * input.runs;

    input.policies.forEach((policy, policyIndex) => {
        const policyStartedAt = now();
        const batch = executeBatch({
            encounterId: input.encounterId,
            policy,
            masterSeed: input.masterSeed,
            runs: input.runs,
            maxActions: input.maxActions,
            replay: false,
        }, {
            onProgress(policyCompleted, policyTotal): void {
                options.onProgress?.({
                    encounterId: input.encounterId,
                    policyId: policy.id,
                    policyIndex,
                    policyCount: input.policies.length,
                    policyCompleted,
                    policyTotal,
                    overallCompleted: (policyIndex * input.runs) + policyCompleted,
                    overallTotal,
                });
            },
        });
        const runtimeMs = Math.max(0, now() - policyStartedAt);
        const entry: PolicyComparisonEntry = {
            policyId: policy.id,
            batch,
            summary: summarizeBatch(batch),
            timing: {
                runtimeMs,
                meanPerRunMs: input.runs === 0 ? null : runtimeMs / input.runs,
            },
        };
        entries.push(entry);
        options.onPolicyComplete?.(entry);
    });

    return {
        encounterId: input.encounterId,
        masterSeed: input.masterSeed,
        runs: input.runs,
        maxActions: input.maxActions,
        policies: entries,
        policyRuntimeTotalMs: entries.reduce((total, entry) => total + entry.timing.runtimeMs, 0),
        overallElapsedMs: Math.max(0, now() - startedAt),
    };
}

export function formatPolicyComparison(result: PolicyComparisonResult): string[] {
    const metricRows = result.policies.map(({ policyId, summary }) => {
        const metrics = summary.metrics;
        return [
            policyId,
            String(metrics.runs),
            formatPercent(metrics.winRate),
            formatNumber(metrics.meanDecisions),
            formatNumber(metrics.meanDamage),
            formatNumber(metrics.meanPeakBondage),
            formatNumber(metrics.meanEscapes),
            metrics.win95 === null
                ? "n/a"
                : `${formatPercent(metrics.win95.lower)}-${formatPercent(metrics.win95.upper)}`,
        ];
    });

    const runtimeTotal = result.policyRuntimeTotalMs;
    const timingRows = result.policies.map(({ policyId, timing }) => [
        policyId,
        formatRuntime(timing.runtimeMs),
        timing.meanPerRunMs === null ? "n/a" : `${timing.meanPerRunMs.toFixed(3)} ms`,
        runtimeTotal === 0 ? "0.0%" : formatPercent(timing.runtimeMs / runtimeTotal),
    ]);

    return [
        `===== ${result.encounterId} =====`,
        "",
        ...formatTable(
            ["policy", "runs", "winRate", "meanDecisions", "meanDamage", "meanPeakBondage", "meanEscapes", "win95"],
            metricRows,
        ),
        "",
        "Timing:",
        ...formatTable(["policy", "runtime", "meanPerRun", "share"], timingRows),
        "",
        `Policy runtime total: ${formatRuntime(result.policyRuntimeTotalMs)}`,
        `Overall wall time:    ${formatRuntime(result.overallElapsedMs)}`,
    ];
}

export function formatRuntime(milliseconds: number): string {
    const value = Math.max(0, milliseconds);
    if (value < 1_000) return `${value.toFixed(1)} ms`;
    if (value < 60_000) return `${(value / 1_000).toFixed(1)} s`;
    const minutes = Math.floor(value / 60_000);
    const seconds = (value % 60_000) / 1_000;
    return `${minutes}m ${seconds.toFixed(1)}s`;
}

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null): string {
    return value === null ? "n/a" : value.toFixed(1);
}

function formatTable(headers: readonly string[], rows: readonly string[][]): string[] {
    const widths = headers.map((header, column) => Math.max(
        header.length,
        ...rows.map((row) => row[column]?.length ?? 0),
    ));
    const border = (left: string, middle: string, right: string, fill: string): string =>
        left + widths.map((width) => fill.repeat(width + 2)).join(middle) + right;
    const row = (values: readonly string[]): string =>
        `| ${values.map((value, column) => value.padEnd(widths[column])).join(" | ")} |`;

    return [
        border("+", "+", "+", "-"),
        row(headers),
        border("+", "+", "+", "-"),
        ...rows.map(row),
        border("+", "+", "+", "-"),
    ];
}
