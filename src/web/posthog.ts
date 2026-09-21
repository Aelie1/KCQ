import posthog from "posthog-js";
import { createGameplayTelemetry } from "./telemetry";

const AUTOMATIC_PROPERTY_DENYLIST = [
    "$browser",
    "$browser_version",
    "$current_url",
    "$device",
    "$device_type",
    "$host",
    "$os",
    "$os_version",
    "$pathname",
    "$raw_user_agent",
    "$referrer",
    "$referring_domain",
    "$screen_height",
    "$screen_width",
    "$viewport_height",
    "$viewport_width",
];

export const gameplayTelemetry = createGameplayTelemetry({
    projectToken: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN,
    apiHost: import.meta.env.VITE_POSTHOG_API_HOST,
}, (projectToken, apiHost) => {
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
        ip: false,
        save_campaign_params: false,
        save_referrer: false,
        property_denylist: AUTOMATIC_PROPERTY_DENYLIST,
    });
    return posthog;
});
