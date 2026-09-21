import posthog from "posthog-js";
import { getOrCreateAnonymousPlayerId } from "./anonymousPlayer";
import { sanitizePostHogEvent, type PostHogEventPayload } from "./posthogSanitizer";
import { createGameplayTelemetry } from "./telemetry";

export const gameplayTelemetry = createGameplayTelemetry({
    projectToken: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN,
    apiHost: import.meta.env.VITE_POSTHOG_API_HOST,
}, (projectToken, apiHost) => {
    const anonymousPlayerId = getOrCreateAnonymousPlayerId(
        window.localStorage,
        () => crypto.randomUUID(),
    );
    if (!anonymousPlayerId) throw new Error("Anonymous telemetry identity is unavailable.");

    posthog.init(projectToken, {
        api_host: apiHost,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        person_profiles: "never",
        capture_heatmaps: false,
        capture_dead_clicks: false,
        capture_exceptions: false,
        disable_surveys: true,
        advanced_disable_flags: true,
        disable_persistence: true,
        disableDeviceModel: true,
        get_device_id: () => anonymousPlayerId,
        save_campaign_params: false,
        save_referrer: false,
        before_send: (event) => sanitizePostHogEvent(
            event as PostHogEventPayload | null,
            anonymousPlayerId,
        ) as typeof event,
    });
    return posthog;
});
