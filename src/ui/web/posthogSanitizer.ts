import type { TelemetryEvent } from "./telemetry";

export interface PostHogEventPayload {
    uuid: string;
    event: string;
    properties: Record<string, unknown>;
    timestamp?: Date;
    $set?: Record<string, unknown>;
    $set_once?: Record<string, unknown>;
    $unset?: string[];
}

const GAMEPLAY_PROPERTIES: Record<TelemetryEvent, readonly string[]> = {
    battle_started: [
        "replay_id",
        "release",
        "encounter",
        "seed",
        "initial_state",
    ],
    battle_action: [
        "replay_id",
        "sequence",
        "source",
        "action",
        "success",
        "failure_reason",
        "state_after",
    ],
    battle_finished: [
        "replay_id",
        "outcome",
        "action_count",
        "final_state",
    ],
    battle_quit: [
        "replay_id",
        "action_count",
        "current_state",
    ],
    battle_abandoned: [
        "replay_id",
        "action_count",
        "current_state",
    ],
};

export function sanitizePostHogEvent(
    payload: PostHogEventPayload | null,
    anonymousPlayerId: string,
): PostHogEventPayload | null {
    try {
        if (!payload || !isTelemetryEvent(payload.event)) return null;

        const source = payload.properties;
        const token = source.token;
        const replayId = source.replay_id;
        if (typeof token !== "string" || token.length === 0) return null;
        if (typeof replayId !== "string" || replayId.length === 0) return null;
        if (anonymousPlayerId.length === 0) return null;

        const properties: Record<string, unknown> = {
            token,
            distinct_id: anonymousPlayerId,
            $process_person_profile: false,
            $geoip_disable: true,
        };
        for (const property of GAMEPLAY_PROPERTIES[payload.event]) {
            if (property in source) properties[property] = source[property];
        }

        return {
            uuid: payload.uuid,
            event: payload.event,
            properties,
            ...(payload.timestamp === undefined ? {} : { timestamp: payload.timestamp }),
        };
    } catch {
        return null;
    }
}

function isTelemetryEvent(event: string): event is TelemetryEvent {
    return Object.prototype.hasOwnProperty.call(GAMEPLAY_PROPERTIES, event);
}
