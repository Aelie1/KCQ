import { performance } from "node:perf_hooks";

export interface ProgressReporterOptions {
    intervalMs?: number;
    now?: () => number;
    write?: (line: string) => void;
    formatLine?: (completed: number, total: number, elapsedMs: number) => string;
}

export interface ProgressReporter {
    readonly startedAt: number;
    update(completed: number, total: number): void;
    elapsedMs(): number;
}

const DEFAULT_PROGRESS_INTERVAL_MS = 60_000;

/** Creates a synchronous-loop reporter: callers invoke update after completed work. */
export function createProgressReporter(
    options: ProgressReporterOptions = {},
): ProgressReporter {
    const intervalMs = options.intervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;
    const now = options.now ?? (() => performance.now());
    const write = options.write ?? console.log;
    const formatLine = options.formatLine ?? formatBatchProgress;
    const startedAt = now();
    let nextReportAt = intervalMs;

    return {
        startedAt,
        update(completed, total): void {
            const elapsedMs = Math.max(0, now() - startedAt);
            if (completed >= total || elapsedMs < nextReportAt) return;
            write(formatLine(completed, total, elapsedMs));
            while (nextReportAt <= elapsedMs) nextReportAt += intervalMs;
        },
        elapsedMs(): number {
            return Math.max(0, now() - startedAt);
        },
    };
}

export function formatBatchProgress(
    completed: number,
    total: number,
    elapsedMs: number,
): string {
    const metrics = formatProgressMetrics(completed, total, elapsedMs);
    return `[${formatProgressClock(elapsedMs)}] ${metrics}`;
}

export function formatProgressMetrics(
    completed: number,
    total: number,
    elapsedMs: number,
): string {
    const percentage = total === 0 ? 100 : (completed / total) * 100;
    const rate = elapsedMs > 0 ? completed / (elapsedMs / 1_000) : 0;
    const eta = rate > 0
        ? formatEta(((Math.max(0, total - completed)) / rate) * 1_000)
        : "unknown";
    return `${formatCount(completed)} / ${formatCount(total)} (${percentage.toFixed(1)}%)`
        + `  ${formatRate(rate)} fights/s  ETA ${eta}`;
}

export function formatCompletion(
    completed: number,
    elapsedMs: number,
    subject = "runs",
): string {
    const rate = elapsedMs > 0 ? completed / (elapsedMs / 1_000) : 0;
    return `Completed ${formatCount(completed)} ${subject} in ${formatElapsedTime(elapsedMs)}`
        + ` (${formatRate(rate)} fights/s)`;
}

/** Compact duration for completion messages, retaining tenths of a second. */
export function formatElapsedTime(elapsedMs: number): string {
    const tenths = Math.max(0, Math.round(elapsedMs / 100));
    const hours = Math.floor(tenths / 36_000);
    const minutes = Math.floor((tenths % 36_000) / 600);
    const seconds = (tenths % 600) / 10;
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds.toFixed(1)}s`);
    return parts.join(" ");
}

/** Fixed-width elapsed clock used at the start of periodic progress lines. */
export function formatProgressClock(elapsedMs: number): string {
    const seconds = Math.max(0, Math.floor(elapsedMs / 1_000));
    const hours = Math.floor(seconds / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    const remainder = seconds % 60;
    return [hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":");
}

/** Whole-second estimate for live progress where sub-second precision is noise. */
export function formatEta(elapsedMs: number): string {
    const seconds = Math.max(0, Math.ceil(elapsedMs / 1_000));
    const hours = Math.floor(seconds / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    const remainder = seconds % 60;
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainder > 0 || parts.length === 0) parts.push(`${remainder}s`);
    return parts.join(" ");
}

function formatRate(rate: number): string {
    if (!Number.isFinite(rate) || rate <= 0) return "0";
    return formatCount(Math.round(rate));
}

function formatCount(value: number): string {
    return value.toLocaleString("en-US");
}
