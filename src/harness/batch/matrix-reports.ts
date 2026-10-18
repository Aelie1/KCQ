import type { KCQCharacter } from "../../content";
import { stockCharacters } from "../../stock";
import { harnessDifficulties } from "../configuration";
import { formatTable } from "./comparison";
import type { MatrixEntry } from "./matrix";

export interface PartyParityReport {
    encounterId: string;
    difficulty: MatrixEntry["difficulty"];
    policyId: string;
    referenceParty: readonly KCQCharacter[] | null;
    highestWinRate: number | null;
    lowestWinRate: number | null;
    spreadPp: number | null;
    rows: { entry: MatrixEntry; differencePp: number | null }[];
}

export interface DifficultyProgressionReport {
    encounterId: string;
    party: readonly KCQCharacter[];
    policyId: string;
    rows: { entry: MatrixEntry; previousDifficulty: MatrixEntry["difficulty"] | null; changePp: number | null }[];
}

export function summarizePartyParity(entries: readonly MatrixEntry[], reference: readonly KCQCharacter[] = stockCharacters): PartyParityReport[] {
    return groups(entries, entry => [entry.encounterId, entry.difficulty, entry.policyId]).map(group => {
        const first = group[0];
        const referenceEntry = group.find(entry => entry.party.length === reference.length && reference.every(id => entry.party.includes(id)));
        const rates = group.filter(entry => entry.metrics.runs > 0).map(entry => entry.metrics.winRate);
        const highestWinRate = rates.length ? Math.max(...rates) : null;
        const lowestWinRate = rates.length ? Math.min(...rates) : null;
        return { encounterId: first.encounterId, difficulty: first.difficulty, policyId: first.policyId,
            referenceParty: referenceEntry?.party ?? null, highestWinRate, lowestWinRate,
            spreadPp: highestWinRate === null || lowestWinRate === null ? null : (highestWinRate - lowestWinRate) * 100,
            rows: group.map(entry => ({ entry,
                differencePp: !referenceEntry || referenceEntry === entry || !referenceEntry.metrics.runs || !entry.metrics.runs
                    ? null : (entry.metrics.winRate - referenceEntry.metrics.winRate) * 100 })),
        };
    });
}

export function summarizeDifficultyProgression(entries: readonly MatrixEntry[]): DifficultyProgressionReport[] {
    return groups(entries, entry => [entry.encounterId, entry.party, entry.policyId]).map(group => {
        const sorted = [...group].sort((a, b) => harnessDifficulties.indexOf(a.difficulty) - harnessDifficulties.indexOf(b.difficulty));
        const first = sorted[0];
        return { encounterId: first.encounterId, party: first.party, policyId: first.policyId,
            rows: sorted.map((entry, index) => {
                const previous = sorted[index - 1];
                return { entry, previousDifficulty: previous?.difficulty ?? null,
                    changePp: !previous || !previous.metrics.runs || !entry.metrics.runs ? null
                        : (entry.metrics.winRate - previous.metrics.winRate) * 100 };
            }),
        };
    });
}

export function formatPartyParity(entries: readonly MatrixEntry[]): string[] {
    return summarizePartyParity(entries).flatMap(report => [
        `Party parity: ${report.encounterId} / ${report.difficulty} / ${report.policyId}`,
        `Highest: ${percent(report.highestWinRate)} / Lowest: ${percent(report.lowestWinRate)} / Spread: ${pp(report.spreadPp, false)}`,
        `Reference: ${report.referenceParty?.join("/") ?? "none (reference party absent)"}`,
        ...formatTable(["party", "policy", ...metricHeaders, "difference vs reference"], report.rows.map(({ entry, differencePp }) =>
            [entry.party.join("/"), entry.policyId, ...metricCells(entry), pp(differencePp)])), "",
    ]);
}

export function formatDifficultyProgression(entries: readonly MatrixEntry[]): string[] {
    return summarizeDifficultyProgression(entries).flatMap(report => [
        `Difficulty progression: ${report.encounterId} / ${report.party.join("/")} / ${report.policyId}`,
        ...formatTable(["difficulty", ...metricHeaders, "change from previous included"], report.rows.map(({ entry, previousDifficulty, changePp }) =>
            [entry.difficulty, ...metricCells(entry), previousDifficulty === null ? "-" : `${pp(changePp)} vs ${previousDifficulty}`])), "",
    ]);
}

const metricHeaders = ["runs", "winRate", "meanRounds", "meanDecisions", "meanPeakBondage", "win95"];
function metricCells(entry: MatrixEntry): string[] {
    const metrics = entry.metrics;
    return [String(metrics.runs), percent(metrics.runs ? metrics.winRate : null), number(entry.meanRounds),
        number(metrics.meanDecisions), number(metrics.meanPeakBondage),
        metrics.win95 === null ? "n/a" : `${percent(metrics.win95.lower)}-${percent(metrics.win95.upper)}`];
}
function percent(value: number | null): string { return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`; }
function number(value: number | null): string { return value === null ? "n/a" : value.toFixed(1); }
function pp(value: number | null, signed = true): string {
    return value === null ? "-" : `${signed && value > 0 ? "+" : ""}${value.toFixed(1)} pp`;
}
function groups(entries: readonly MatrixEntry[], key: (entry: MatrixEntry) => unknown): MatrixEntry[][] {
    const result = new Map<string, MatrixEntry[]>();
    for (const entry of entries) {
        const id = JSON.stringify(key(entry));
        const group = result.get(id) ?? [];
        group.push(entry);
        result.set(id, group);
    }
    return [...result.values()];
}
