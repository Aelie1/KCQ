import { isDeepStrictEqual } from "node:util";
import { createEngine } from "../engine/public/engine";
import type {
    BattleState,
    Engine,
    GameView,
    PlayerAction,
} from "../engine/public/types";
import {
    compactStateDigest,
    type CompactStateDigest,
} from "../web/telemetry";
import type { FightReplay, ReplayStep } from "./harness";

export const POSTHOG_REPLAY_COLUMNS = [
    "timestamp",
    "event",
    "replay_id",
    "sequence",
    "release",
    "encounter",
    "seed",
    "source",
    "action",
    "success",
    "failure_reason",
    "initial_state",
    "state_after",
    "outcome",
    "action_count",
    "final_state",
    "current_state",
] as const;

export type PostHogReplayColumn = (typeof POSTHOG_REPLAY_COLUMNS)[number];

export type PostHogReplayEventRow = Record<PostHogReplayColumn, string>;

export interface ParsedPostHogAction {
    sequence: number;
    source: "player" | "automatic";
    action: PlayerAction;
    success: boolean;
    failureReason?: string;
    stateAfter?: CompactStateDigest;
}

export interface ParsedPostHogTerminal {
    type: "finished" | "quit";
    outcome?: BattleState;
    actionCount?: number;
    state?: CompactStateDigest;
}

export interface ParsedPostHogReplay {
    replayId: string;
    release: string;
    encounter: string;
    seed: number;
    initialState: CompactStateDigest;
    actions: ParsedPostHogAction[];
    terminal?: ParsedPostHogTerminal;
}

export interface ImportedPostHogReplay {
    replayId: string;
    release: string;
    encounter: string;
    seed: number;
    replay: FightReplay;
    terminal?: ParsedPostHogTerminal["type"];
}

interface ReplayRecord {
    location: string;
    values: PostHogReplayEventRow;
}

export function parsePostHogReplayCsv(csv: string): ParsedPostHogReplay {
    const table = parseCsv(csv);
    if (table.length === 0) throw new Error("PostHog CSV is empty.");

    const header = table[0].map((value, index) => index === 0
        ? value.replace(/^\uFEFF/u, "")
        : value);
    const duplicateHeaders = duplicates(header);
    if (duplicateHeaders.length > 0) {
        throw new Error(`PostHog CSV has duplicate columns: ${duplicateHeaders.join(", ")}.`);
    }
    const missingColumns = POSTHOG_REPLAY_COLUMNS.filter((column) => !header.includes(column));
    if (missingColumns.length > 0) {
        throw new Error(`PostHog CSV is missing columns: ${missingColumns.join(", ")}.`);
    }

    const records: ReplayRecord[] = table.slice(1).flatMap((row, index) => {
        if (row.every((value) => value === "")) return [];
        if (row.length !== header.length) {
            throw new Error(
                `PostHog CSV row ${index + 2} has ${row.length} columns; expected ${header.length}.`,
            );
        }
        return [{
            location: `CSV row ${index + 2}`,
            values: Object.fromEntries(POSTHOG_REPLAY_COLUMNS.map((column) => [
                column,
                row[header.indexOf(column)],
            ])) as PostHogReplayEventRow,
        }];
    });

    return parseReplayRecords(records, "PostHog CSV");
}

/** Convert normalized query rows through the same validation used by CSV imports. */
export function parsePostHogReplayEvents(
    rows: readonly PostHogReplayEventRow[],
): ParsedPostHogReplay {
    return parseReplayRecords(rows.map((values, index) => ({
        location: `API result row ${index + 1}`,
        values,
    })), "PostHog API results");
}

function parseReplayRecords(
    records: readonly ReplayRecord[],
    source: string,
): ParsedPostHogReplay {
    const replayIds = [...new Set(records
        .map((record) => record.values.replay_id.trim())
        .filter(Boolean))].sort();
    if (replayIds.length === 0) throw new Error(`${source} has zero replay IDs.`);
    if (replayIds.length > 1) {
        throw new Error(`${source} has multiple replay IDs: ${replayIds.join(", ")}.`);
    }

    const replayId = replayIds[0];
    const replayRecords = records.filter((record) => record.values.replay_id.trim() === replayId);
    const supportedEvents = new Set([
        "battle_started",
        "battle_action",
        "battle_finished",
        "battle_quit",
    ]);
    const unsupported = replayRecords.filter((record) => !supportedEvents.has(record.values.event));
    if (unsupported.length > 0) {
        throw replayError(replayId,
            `unsupported event ${JSON.stringify(unsupported[0].values.event)} on ${unsupported[0].location}`);
    }

    const starts = replayRecords.filter((record) => record.values.event === "battle_started");
    if (starts.length !== 1) {
        throw replayError(replayId, `expected exactly one battle_started row; found ${starts.length}`);
    }
    const start = starts[0];
    const encounter = requiredValue(start, "encounter");
    const seed = parseInteger(requiredValue(start, "seed"), "seed", start.location);
    const initialState = parseDigest(requiredValue(start, "initial_state"), "initial_state", start.location);

    const actions = replayRecords
        .filter((record) => record.values.event === "battle_action")
        .map((record): ParsedPostHogAction => {
            const sequence = parseInteger(
                requiredValue(record, "sequence"),
                "sequence",
                record.location,
            );
            if (sequence < 1) {
                throw replayError(replayId,
                    `sequence on ${record.location} must be a positive integer; received ${sequence}`);
            }
            const source = requiredValue(record, "source");
            if (source !== "player" && source !== "automatic") {
                throw replayError(replayId,
                    `invalid source ${JSON.stringify(source)} at sequence ${sequence}`);
            }
            const action = parseAction(requiredValue(record, "action"), replayId, sequence);
            const success = parseBoolean(
                requiredValue(record, "success"),
                "success",
                record.location,
            );
            const failureReason = record.values.failure_reason.trim() || undefined;
            if (!success && !failureReason) {
                throw replayError(replayId,
                    `failed action at sequence ${sequence} is missing failure_reason`);
            }
            const stateAfter = record.values.state_after.trim()
                ? parseDigest(record.values.state_after, "state_after", record.location)
                : undefined;
            if (success && !stateAfter) {
                throw replayError(replayId,
                    `successful action at sequence ${sequence} is missing state_after`);
            }
            return {
                sequence,
                source,
                action,
                success,
                ...(failureReason === undefined ? {} : { failureReason }),
                ...(stateAfter === undefined ? {} : { stateAfter }),
            };
        })
        .sort((left, right) => left.sequence - right.sequence);

    const duplicateSequences = duplicates(actions.map((action) => action.sequence));
    if (duplicateSequences.length > 0) {
        throw replayError(replayId,
            `duplicate action sequence${duplicateSequences.length === 1 ? "" : "s"}: ${duplicateSequences.join(", ")}`);
    }
    for (let index = 0; index < actions.length; index++) {
        const expected = index + 1;
        if (actions[index].sequence !== expected) {
            throw replayError(replayId,
                `missing action sequence ${expected}; next sequence is ${actions[index].sequence}`);
        }
    }

    const terminalRecords = replayRecords.filter((record) =>
        record.values.event === "battle_finished" || record.values.event === "battle_quit");
    if (terminalRecords.length > 1) {
        throw replayError(replayId,
            `expected at most one battle_finished/battle_quit row; found ${terminalRecords.length}`);
    }
    const terminal = terminalRecords[0]
        ? parseTerminal(terminalRecords[0], replayId)
        : undefined;

    return {
        replayId,
        release: start.values.release,
        encounter,
        seed,
        initialState,
        actions,
        ...(terminal === undefined ? {} : { terminal }),
    };
}

export function reconstructFightReplay(parsed: ParsedPostHogReplay): ImportedPostHogReplay {
    const engine = createEngine(parsed.seed);
    loadStockBattle(engine, parsed.encounter, parsed.replayId);

    const initialState = structuredClone(engine.getGameView());
    assertStateMatches(
        parsed,
        "initial_state",
        parsed.initialState,
        compactStateDigest(initialState),
    );

    const steps: ReplayStep[] = [];
    for (const recorded of parsed.actions) {
        const action = cloneAction(recorded.action);
        const result = engine.executeAction(action);
        if (result.success !== recorded.success) {
            const actual = result.success ? "success" : `failure (${result.reason})`;
            const expected = recorded.success
                ? "success"
                : `failure (${recorded.failureReason})`;
            throw actionDivergence(parsed, recorded,
                `recorded ${expected}, but the engine produced ${actual}`);
        }

        if (result.success) {
            assertStateMatches(
                parsed,
                "state_after",
                recorded.stateAfter!,
                compactStateDigest(result.view),
                recorded,
            );
            steps.push({
                action: cloneAction(action),
                success: true,
                events: structuredClone(result.events),
                state: structuredClone(result.view),
            });
        } else {
            if (result.reason !== recorded.failureReason) {
                throw actionDivergence(parsed, recorded,
                    `recorded failure ${recorded.failureReason}, but the engine produced ${result.reason}`);
            }
            steps.push({
                action: cloneAction(action),
                success: false,
                reason: result.reason,
            });
        }
    }

    validateTerminal(parsed, engine.getGameView());
    return {
        replayId: parsed.replayId,
        release: parsed.release,
        encounter: parsed.encounter,
        seed: parsed.seed,
        replay: {
            initialState,
            steps,
        },
        ...(parsed.terminal === undefined ? {} : { terminal: parsed.terminal.type }),
    };
}

export function importPostHogReplayCsv(csv: string): ImportedPostHogReplay {
    return reconstructFightReplay(parsePostHogReplayCsv(csv));
}

/** Dependency-free RFC 4180-style parser with quoted commas, quotes, and newlines. */
export function parseCsv(csv: string): string[][] {
    if (csv.length === 0) return [];
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    let closedQuote = false;

    const finishField = (): void => {
        row.push(field);
        field = "";
        closedQuote = false;
    };
    const finishRow = (): void => {
        finishField();
        rows.push(row);
        row = [];
    };

    for (let index = 0; index < csv.length; index++) {
        const character = csv[index];
        if (inQuotes) {
            if (character === '"') {
                if (csv[index + 1] === '"') {
                    field += '"';
                    index += 1;
                } else {
                    inQuotes = false;
                    closedQuote = true;
                }
            } else {
                field += character;
            }
            continue;
        }

        if (closedQuote && character !== "," && character !== "\r" && character !== "\n") {
            throw new Error(`Malformed CSV: unexpected ${JSON.stringify(character)} after a closing quote.`);
        }
        if (character === '"') {
            if (field.length > 0) {
                throw new Error("Malformed CSV: quote inside an unquoted field.");
            }
            inQuotes = true;
        } else if (character === ",") {
            finishField();
        } else if (character === "\r" || character === "\n") {
            if (character === "\r" && csv[index + 1] === "\n") index += 1;
            finishRow();
        } else {
            field += character;
        }
    }

    if (inQuotes) throw new Error("Malformed CSV: unterminated quoted field.");
    if (field.length > 0 || row.length > 0 || closedQuote || csv.endsWith(",")) finishRow();
    return rows;
}

function parseTerminal(record: ReplayRecord, replayId: string): ParsedPostHogTerminal {
    const type = record.values.event === "battle_finished" ? "finished" : "quit";
    const actionCount = record.values.action_count.trim()
        ? parseInteger(record.values.action_count, "action_count", record.location)
        : undefined;
    if (actionCount !== undefined && actionCount < 0) {
        throw replayError(replayId,
            `action_count on ${record.location} must be non-negative`);
    }

    if (type === "finished") {
        const outcome = requiredValue(record, "outcome");
        if (outcome !== "victory" && outcome !== "defeat") {
            throw replayError(replayId,
                `battle_finished has invalid outcome ${JSON.stringify(outcome)}`);
        }
        const state = record.values.final_state.trim()
            ? parseDigest(record.values.final_state, "final_state", record.location)
            : undefined;
        return {
            type,
            outcome,
            ...(actionCount === undefined ? {} : { actionCount }),
            ...(state === undefined ? {} : { state }),
        };
    }

    const state = record.values.current_state.trim()
        ? parseDigest(record.values.current_state, "current_state", record.location)
        : undefined;
    return {
        type,
        ...(actionCount === undefined ? {} : { actionCount }),
        ...(state === undefined ? {} : { state }),
    };
}

function validateTerminal(parsed: ParsedPostHogReplay, finalView: GameView): void {
    const terminal = parsed.terminal;
    if (!terminal) return;
    if (terminal.actionCount !== undefined && terminal.actionCount !== parsed.actions.length) {
        throw replayError(parsed.replayId,
            `terminal action_count expected ${terminal.actionCount}, reconstructed ${parsed.actions.length}`);
    }
    if (terminal.type === "finished" && finalView.turn.outcome !== terminal.outcome) {
        throw replayError(parsed.replayId,
            `terminal outcome expected ${terminal.outcome}, reconstructed ${finalView.turn.outcome}`);
    }
    if (terminal.state) {
        assertStateMatches(
            parsed,
            terminal.type === "finished" ? "final_state" : "current_state",
            terminal.state,
            compactStateDigest(finalView),
        );
    }
}

function loadStockBattle(engine: Engine, encounter: string, replayId: string): void {
    if (!engine.listEncounters().includes(encounter)) {
        throw replayError(replayId, `unknown encounter ${JSON.stringify(encounter)}`);
    }
    for (const id of engine.listCharacters()) {
        const loaded = engine.loadCharacter(id).some((event) =>
            event.type === "characterLoad" && event.id === id && event.success);
        if (!loaded) throw replayError(replayId, `failed to load stock character ${id}`);
    }
    const loaded = engine.loadEncounter(encounter).some((event) =>
        event.type === "encounterLoad" && event.id === encounter && event.success);
    if (!loaded) throw replayError(replayId, `failed to load encounter ${encounter}`);
}

function assertStateMatches(
    parsed: ParsedPostHogReplay,
    label: string,
    expected: CompactStateDigest,
    actual: CompactStateDigest,
    action?: ParsedPostHogAction,
): void {
    if (isDeepStrictEqual(expected, actual)) return;
    const difference = firstDifference(expected, actual);
    if (action) {
        throw actionDivergence(parsed, action,
            `${label} diverged: ${difference}`);
    }
    throw replayError(parsed.replayId, `${label} diverged: ${difference}`);
}

function firstDifference(expected: unknown, actual: unknown, path = "$"): string {
    if (Object.is(expected, actual)) return "values differ";
    if (Array.isArray(expected) || Array.isArray(actual)) {
        if (!Array.isArray(expected) || !Array.isArray(actual)) {
            return `${path}: expected ${formatValue(expected)}, actual ${formatValue(actual)}`;
        }
        if (expected.length !== actual.length) {
            return `${path}.length: expected ${expected.length}, actual ${actual.length}`;
        }
        for (let index = 0; index < expected.length; index++) {
            if (!isDeepStrictEqual(expected[index], actual[index])) {
                return firstDifference(expected[index], actual[index], `${path}[${index}]`);
            }
        }
    } else if (isRecord(expected) && isRecord(actual)) {
        const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
        for (const key of keys) {
            if (!(key in expected)) return `${path}.${key}: unexpected ${formatValue(actual[key])}`;
            if (!(key in actual)) return `${path}.${key}: expected ${formatValue(expected[key])}, actual missing`;
            if (!isDeepStrictEqual(expected[key], actual[key])) {
                return firstDifference(expected[key], actual[key], `${path}.${key}`);
            }
        }
    }
    return `${path}: expected ${formatValue(expected)}, actual ${formatValue(actual)}`;
}

function parseAction(json: string, replayId: string, sequence: number): PlayerAction {
    let value: unknown;
    try {
        value = JSON.parse(json);
    } catch (error: unknown) {
        throw replayError(replayId,
            `malformed action JSON at sequence ${sequence}: ${errorMessage(error)}`);
    }
    if (!isPlayerAction(value)) {
        throw replayError(replayId,
            `invalid PlayerAction at sequence ${sequence}: ${formatValue(value)}`);
    }
    return cloneAction(value);
}

function isPlayerAction(value: unknown): value is PlayerAction {
    if (!isRecord(value) || typeof value.type !== "string") return false;
    switch (value.type) {
        case "move":
            return typeof value.actor === "string"
                && typeof value.move === "string"
                && Array.isArray(value.targets)
                && value.targets.every((target) => typeof target === "string");
        case "escape":
            return typeof value.actor === "string"
                && typeof value.target === "string"
                && typeof value.binding === "string";
        case "stance":
            return typeof value.actor === "string";
        case "endTurn":
            return true;
        default:
            return false;
    }
}

function parseDigest(json: string, name: string, location: string): CompactStateDigest {
    let value: unknown;
    try {
        value = JSON.parse(json);
    } catch (error: unknown) {
        throw new Error(`Malformed ${name} JSON on ${location}: ${errorMessage(error)}.`);
    }
    if (!isRecord(value)) {
        throw new Error(`Invalid ${name} on ${location}: expected a JSON object.`);
    }
    return value as unknown as CompactStateDigest;
}

function requiredValue(record: ReplayRecord, column: PostHogReplayColumn): string {
    const value = record.values[column].trim();
    if (!value) throw new Error(`${record.location} is missing ${column}.`);
    return value;
}

function parseInteger(value: string, name: string, location: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        throw new Error(
            `${location} has invalid ${name}; expected a safe integer, received ${JSON.stringify(value)}.`,
        );
    }
    return parsed;
}

function parseBoolean(value: string, name: string, location: string): boolean {
    switch (value.trim().toLowerCase()) {
        case "true": return true;
        case "false": return false;
        default:
            throw new Error(
                `${location} has invalid ${name}; expected true or false, received ${JSON.stringify(value)}.`,
            );
    }
}

function actionDivergence(
    parsed: ParsedPostHogReplay,
    action: ParsedPostHogAction,
    description: string,
): Error {
    return replayError(parsed.replayId,
        `sequence ${action.sequence}, action ${JSON.stringify(action.action)}: ${description}`);
}

function replayError(replayId: string, message: string): Error {
    return new Error(`Replay ${replayId}: ${message}.`);
}

function cloneAction(action: PlayerAction): PlayerAction {
    return action.type === "move"
        ? { ...action, targets: [...action.targets] }
        : { ...action };
}

function duplicates<T extends string | number>(values: readonly T[]): T[] {
    const seen = new Set<T>();
    const duplicateValues = new Set<T>();
    for (const value of values) {
        if (seen.has(value)) duplicateValues.add(value);
        seen.add(value);
    }
    return [...duplicateValues];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): string {
    const formatted = JSON.stringify(value);
    if (formatted === undefined) return String(value);
    return formatted.length > 240 ? `${formatted.slice(0, 237)}...` : formatted;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
