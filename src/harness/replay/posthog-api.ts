import {
    POSTHOG_REPLAY_COLUMNS,
    type PostHogReplayEventRow,
} from "./posthog-replay";

const QUERY_LIMIT = 50_000;

export interface PostHogApiConfig {
    personalApiKey: string;
    projectId: string;
    apiHost: string;
}

export interface RemoteReplayMetadata {
    replayId: string;
    release: string;
    encounter: string;
    seed: number;
    startedAt: string;
    latestEventAt: string;
    terminal?: "finished" | "quit" | "abandoned";
    round: number;
    actionCount: number;
    anonymousPlayerId?: string;
    sessionId?: string;
}

export interface PostHogReplayClient {
    discoverReplays(): Promise<RemoteReplayMetadata[]>;
    fetchReplayEvents(replayId: string): Promise<PostHogReplayEventRow[]>;
}

type FetchFunction = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function postHogConfigFromEnvironment(
    environment: NodeJS.ProcessEnv,
): PostHogApiConfig {
    const personalApiKey = environment.POSTHOG_PERSONAL_API_KEY?.trim();
    const projectId = environment.POSTHOG_PROJECT_ID?.trim();
    const apiHost = environment.POSTHOG_API_HOST?.trim() || "https://us.posthog.com";
    const missing = [
        !personalApiKey && "POSTHOG_PERSONAL_API_KEY",
        !projectId && "POSTHOG_PROJECT_ID",
    ].filter((name): name is string => Boolean(name));
    if (missing.length > 0) {
        throw new Error(`Missing required PostHog environment variable${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
    }
    const requiredPersonalApiKey = personalApiKey!;
    const requiredProjectId = projectId!;
    if (!/^\d+$/u.test(requiredProjectId)) {
        throw new Error("POSTHOG_PROJECT_ID must be a numeric project ID.");
    }

    let url: URL;
    try {
        url = new URL(apiHost);
    } catch {
        throw new Error("POSTHOG_API_HOST must be a valid HTTP(S) URL.");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error("POSTHOG_API_HOST must be a valid HTTP(S) URL.");
    }
    url.pathname = url.pathname.replace(/\/+$/u, "");
    url.search = "";
    url.hash = "";

    return {
        personalApiKey: requiredPersonalApiKey,
        projectId: requiredProjectId,
        apiHost: url.toString().replace(/\/$/u, ""),
    };
}

export class PostHogApiClient implements PostHogReplayClient {
    readonly #config: PostHogApiConfig;
    readonly #fetch: FetchFunction;

    constructor(config: PostHogApiConfig, fetchFunction: FetchFunction = fetch) {
        this.#config = config;
        this.#fetch = fetchFunction;
    }

    async discoverReplays(): Promise<RemoteReplayMetadata[]> {
        const rows = await this.#query(`
            SELECT
                toString(properties.replay_id) AS replay_id,
                argMinIf(toString(properties.release), timestamp, event = 'battle_started') AS release,
                argMinIf(toString(properties.encounter), timestamp, event = 'battle_started') AS encounter,
                argMinIf(toString(properties.seed), timestamp, event = 'battle_started') AS seed,
                minIf(timestamp, event = 'battle_started') AS started_at,
                argMinIf(toString(distinct_id), timestamp, event = 'battle_started') AS anonymous_player_id,
                argMinIf(toString(properties.kcq_session_id), timestamp, event = 'battle_started') AS kcq_session_id,
                argMinIf(toString(properties.$session_id), timestamp, event = 'battle_started') AS posthog_session_id,
                max(timestamp) AS latest_event_at,
                replaceOne(argMaxIf(event, timestamp, event IN ('battle_finished', 'battle_quit', 'battle_abandoned')), 'battle_', '') AS terminal,
                greatest(
                    greatest(
                        1,
                        maxIf(
                            JSONExtractInt(properties.state_after, 'turn', 'round'),
                            event = 'battle_action'
                        )
                    ),
                    greatest(
                        maxIf(
                            JSONExtractInt(properties.final_state, 'turn', 'round'),
                            event = 'battle_finished'
                        ),
                        maxIf(
                            JSONExtractInt(properties.current_state, 'turn', 'round'),
                            event IN ('battle_quit', 'battle_abandoned')
                        )
                    )
                ) AS current_round,
                countIf(event = 'battle_action') AS action_count
            FROM events
            WHERE event IN ('battle_started', 'battle_action', 'battle_finished', 'battle_quit', 'battle_abandoned')
              AND notEmpty(toString(properties.replay_id))
            GROUP BY replay_id
            HAVING countIf(event = 'battle_started') > 0
            ORDER BY started_at, replay_id
            LIMIT ${QUERY_LIMIT}
        `, "kcq_replay_discovery");
        if (rows.length === QUERY_LIMIT) {
            throw new Error(`PostHog replay discovery reached the ${QUERY_LIMIT}-row safety limit.`);
        }
        return rows.map((row, index) => parseMetadata(row, index));
    }

    async fetchReplayEvents(replayId: string): Promise<PostHogReplayEventRow[]> {
        if (!replayId.trim()) throw new Error("Cannot fetch a blank replay ID.");
        const selection = POSTHOG_REPLAY_COLUMNS.map((column) => {
            if (column === "timestamp" || column === "event") return column;
            return `properties.${column} AS ${column}`;
        }).join(",\n                ");
        const rows = await this.#query(`
            SELECT
                ${selection}
            FROM events
            WHERE event IN ('battle_started', 'battle_action', 'battle_finished', 'battle_quit', 'battle_abandoned')
              AND toString(properties.replay_id) = ${hogQlString(replayId)}
            ORDER BY timestamp, uuid
            LIMIT ${QUERY_LIMIT}
        `, "kcq_replay_events");
        if (rows.length === QUERY_LIMIT) {
            throw new Error(`Replay ${replayId} reached the ${QUERY_LIMIT}-event safety limit.`);
        }
        return rows.map((row, index) => {
            const normalized = Object.fromEntries(POSTHOG_REPLAY_COLUMNS.map((column) => [
                column,
                apiValueToString(row[column], column, index),
            ]));
            return normalized as PostHogReplayEventRow;
        });
    }

    async #query(query: string, name: string): Promise<Array<Record<string, unknown>>> {
        const endpoint = `${this.#config.apiHost}/api/projects/${encodeURIComponent(this.#config.projectId)}/query/`;
        let response: Response;
        try {
            response = await this.#fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.#config.personalApiKey}`,
                },
                body: JSON.stringify({
                    query: { kind: "HogQLQuery", query },
                    name,
                    refresh: "force_blocking",
                }),
            });
        } catch (error: unknown) {
            throw new Error(`PostHog query request failed: ${errorMessage(error)}.`);
        }
        if (!response.ok) {
            const detail = redactCredential(await safeResponseText(response), this.#config.personalApiKey);
            throw new Error(`PostHog query failed with HTTP ${response.status}${detail ? `: ${detail}` : "."}`);
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch (error: unknown) {
            throw new Error(`PostHog returned malformed JSON: ${errorMessage(error)}.`);
        }
        return parseQueryResponse(payload);
    }
}

export function parseQueryResponse(payload: unknown): Array<Record<string, unknown>> {
    if (!isRecord(payload) || !Array.isArray(payload.columns) || !Array.isArray(payload.results)) {
        throw new Error("Malformed PostHog query response: expected columns and results arrays.");
    }
    if (!payload.columns.every((column) => typeof column === "string")) {
        throw new Error("Malformed PostHog query response: every column name must be a string.");
    }
    const columns = payload.columns as string[];
    if (new Set(columns).size !== columns.length) {
        throw new Error("Malformed PostHog query response: duplicate column names.");
    }
    return payload.results.map((result, index) => {
        if (!Array.isArray(result) || result.length !== columns.length) {
            throw new Error(`Malformed PostHog query response row ${index + 1}: expected ${columns.length} values.`);
        }
        return Object.fromEntries(columns.map((column, columnIndex) => [
            column,
            result[columnIndex],
        ]));
    });
}

function parseMetadata(row: Record<string, unknown>, index: number): RemoteReplayMetadata {
    const location = `PostHog replay discovery row ${index + 1}`;
    const replayId = requiredString(row.replay_id, "replay_id", location);
    const release = optionalString(row.release);
    const encounter = requiredString(row.encounter, "encounter", location);
    const seedText = requiredString(row.seed, "seed", location);
    const seed = Number(seedText);
    if (!Number.isSafeInteger(seed)) {
        throw new Error(`${location} has an invalid safe-integer seed.`);
    }
    const startedAtText = requiredString(row.started_at, "started_at", location);
    const startedAtDate = new Date(startedAtText);
    if (Number.isNaN(startedAtDate.getTime())) {
        throw new Error(`${location} has an invalid started_at timestamp.`);
    }
    const anonymousPlayerId = optionalString(row.anonymous_player_id) || undefined;
    const sessionId = optionalString(row.kcq_session_id)
        || optionalString(row.posthog_session_id)
        || undefined;
    const latestEventAtText = requiredString(row.latest_event_at, "latest_event_at", location);
    const latestEventAtDate = new Date(latestEventAtText);
    if (Number.isNaN(latestEventAtDate.getTime())) {
        throw new Error(`${location} has an invalid latest_event_at timestamp.`);
    }
    if (latestEventAtDate.getTime() < startedAtDate.getTime()) {
        throw new Error(`${location} has latest_event_at before started_at.`);
    }
    const terminalText = optionalString(row.terminal);
    if (terminalText !== "" && terminalText !== "finished"
        && terminalText !== "quit" && terminalText !== "abandoned") {
        throw new Error(`${location} has an invalid terminal state.`);
    }
    const round = requiredNonnegativeInteger(row.current_round, "current_round", location);
    if (round < 1) throw new Error(`${location} has an invalid current_round.`);
    const actionCount = requiredNonnegativeInteger(row.action_count, "action_count", location);
    return {
        replayId,
        release,
        encounter,
        seed,
        startedAt: startedAtDate.toISOString(),
        latestEventAt: latestEventAtDate.toISOString(),
        ...(terminalText ? { terminal: terminalText } : {}),
        round,
        actionCount,
        ...(anonymousPlayerId ? { anonymousPlayerId } : {}),
        ...(sessionId ? { sessionId } : {}),
    };
}

function requiredNonnegativeInteger(value: unknown, name: string, location: string): number {
    const text = requiredString(value, name, location);
    const parsed = Number(text);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error(`${location} has an invalid ${name}.`);
    }
    return parsed;
}

function apiValueToString(value: unknown, column: string, rowIndex: number): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
        const encoded = JSON.stringify(value);
        if (encoded !== undefined) return encoded;
    } catch {
        // Fall through to the response-shape error below.
    }
    throw new Error(`Malformed PostHog replay event row ${rowIndex + 1}: ${column} is not serializable.`);
}

function requiredString(value: unknown, name: string, location: string): string {
    const normalized = optionalString(value);
    if (!normalized) throw new Error(`${location} is missing ${name}.`);
    return normalized;
}

function optionalString(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number") return String(value).trim();
    throw new Error("Malformed PostHog query response: expected a scalar value.");
}

function hogQlString(value: string): string {
    return `'${value.replace(/\\/gu, "\\\\").replace(/'/gu, "\\'")}'`;
}

async function safeResponseText(response: Response): Promise<string> {
    try {
        return (await response.text()).trim().slice(0, 500);
    } catch {
        return "";
    }
}

function redactCredential(value: string, credential: string): string {
    return credential ? value.replaceAll(credential, "[redacted]") : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
