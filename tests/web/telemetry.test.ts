import { describe, expect, it, vi } from "vitest";
import { ko } from "../../src/content/characters/ko";
import { encounterList } from "../../src/content/content";
import { createCustomEngine } from "../../src/engine/protected/engine";
import {
    ANONYMOUS_PLAYER_ID_KEY,
    getOrCreateAnonymousPlayerId,
    type AnonymousIdStorage,
} from "../../src/web/anonymousPlayer";
import {
    sanitizePostHogEvent,
    type PostHogEventPayload,
} from "../../src/web/posthogSanitizer";
import {
    compactStateDigest,
    createBattleTelemetryObserver,
    createGameplayTelemetry,
    type GameplayTelemetry,
} from "../../src/web/telemetry";

const PLAYER_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_PLAYER_ID = "20000000-0000-4000-8000-000000000002";

describe("browser gameplay telemetry", () => {
    it("creates a compact digest from public tactical state", () => {
        const engine = createCustomEngine(encounterList, [ko], 8224);
        engine.loadCharacter(ko.id);
        engine.loadEncounter("plains_1");
        const view = engine.getGameState();
        view.characters[0].data = { subspace: 4, subspaceMax: 10 };
        view.characters[0].bindings = [{
            id: "rope",
            value: 12,
            level: "easy",
            data: { hidden: 3 },
            status: [{ id: "bound", value: 1 }],
        }];
        view.characters[0].buffs = [{
            id: "focused",
            duration: 2,
            modifiers: { defense: 1 },
        }];
        view.enemies[0].buffs = [{ id: "marked" }];
        view.traps = [{ id: "snare", amount: 2 }];

        const digest = compactStateDigest(view);

        expect(digest).toEqual({
            turn: view.turn,
            characters: [{
                id: "ko",
                acted: false,
                standing: false,
                bonusEscapes: 0,
                bindings: [{ id: "rope", value: 12 }],
                buffs: [{ id: "focused", duration: 2 }],
                data: { subspace: 4, subspaceMax: 10 },
            }],
            enemies: view.enemies.map((enemy, index) => ({
                id: enemy.id,
                currHp: enemy.currHp,
                buffs: index === 0 ? [{ id: "marked" }] : [],
            })),
            traps: [{ id: "snare", amount: 2 }],
        });
        expect(digest.characters[0]).not.toHaveProperty("modifiers");
        expect(digest.enemies[0]).not.toHaveProperty("intentions");
        expect(digest).not.toHaveProperty("actions");
        expect(digest).not.toHaveProperty("encounter");
    });

    it.each([
        {},
        { projectToken: "project-token" },
        { apiHost: "https://example.test" },
        { projectToken: " ", apiHost: "https://example.test" },
    ])("stays disabled when configuration is incomplete: %o", (config) => {
        const initialize = vi.fn();
        const telemetry = createGameplayTelemetry(config, initialize);

        expect(telemetry.enabled).toBe(false);
        expect(() => telemetry.capture("battle_started", {})).not.toThrow();
        expect(initialize).not.toHaveBeenCalled();
    });

    it("emits the custom battle event schema and contains capture failures", () => {
        const engine = createCustomEngine(encounterList, [ko], 8224);
        engine.loadCharacter(ko.id);
        engine.loadEncounter("plains_1");
        const capture = vi.fn();
        const telemetry: GameplayTelemetry = { enabled: true, capture };
        const observer = createBattleTelemetryObserver({
            telemetry,
            replayId: "replay-1",
            release: "v1.2.3",
            encounter: "plains_1",
            seed: engine.getSeed(),
            initialState: engine.getGameState(),
            getCurrentState: () => engine.getGameState(),
        });
        const action = { type: "endTurn" as const };
        const result = engine.executeAction(action);

        observer.onAction?.(action, result, "player");
        observer.onOutcome?.("defeat");

        expect(capture.mock.calls.map(([event]) => event)).toEqual([
            "battle_started",
            "battle_action",
            "battle_finished",
        ]);
        expect(capture.mock.calls[0][1]).toMatchObject({
            replay_id: "replay-1",
            release: "v1.2.3",
            encounter: "plains_1",
            seed: 8224,
            initial_state: expect.any(Object),
        });
        expect(capture.mock.calls[1][1]).toMatchObject({
            replay_id: "replay-1",
            sequence: 1,
            source: "player",
            action,
            success: true,
            state_after: expect.any(Object),
        });
        expect(capture.mock.calls[2][1]).toMatchObject({
            replay_id: "replay-1",
            outcome: "defeat",
            action_count: 1,
            final_state: expect.any(Object),
        });

        const quitCapture = vi.fn();
        const quitObserver = createBattleTelemetryObserver({
            telemetry: { enabled: true, capture: quitCapture },
            replayId: "replay-2",
            release: "v1.2.3",
            encounter: "plains_1",
            seed: engine.getSeed(),
            initialState: engine.getGameState(),
            getCurrentState: () => engine.getGameState(),
        });
        quitObserver.onQuit?.();
        expect(quitCapture).toHaveBeenLastCalledWith("battle_quit", {
            replay_id: "replay-2",
            action_count: 0,
            current_state: expect.any(Object),
        });

        const failingTelemetry = createGameplayTelemetry({
            projectToken: "project-token",
            apiHost: "https://example.test",
        }, () => ({ capture: () => { throw new Error("offline"); } }));
        expect(() => failingTelemetry.capture("battle_quit", {})).not.toThrow();
    });

    it("reports pagehide abandonment once with current state using sendBeacon", () => {
        const engine = createCustomEngine(encounterList, [ko], 8224);
        engine.loadCharacter(ko.id);
        engine.loadEncounter("plains_1");
        const capture = vi.fn();
        const observer = createBattleTelemetryObserver({
            telemetry: { enabled: true, capture },
            replayId: "replay-abandoned",
            release: "test",
            encounter: "plains_1",
            seed: engine.getSeed(),
            initialState: engine.getGameState(),
            getCurrentState: () => engine.getGameState(),
        });
        const action = { type: "endTurn" as const };
        observer.onAction?.(action, engine.executeAction(action), "player");

        observer.onPageHide({ persisted: false });
        observer.onPageHide({ persisted: false });

        expect(observer.lifecycleState).toBe("abandoned");
        expect(capture.mock.calls.filter(([event]) => event === "battle_abandoned"))
            .toEqual([["battle_abandoned", {
                replay_id: "replay-abandoned",
                action_count: 1,
                current_state: compactStateDigest(engine.getGameState()),
            }, {
                send_instantly: true,
                transport: "sendBeacon",
            }]]);
    });

    it("does not abandon finished, explicitly quit, or bfcache battles", () => {
        const makeObserver = (replayId: string) => {
            const engine = createCustomEngine(encounterList, [ko], 8224);
            engine.loadCharacter(ko.id);
            engine.loadEncounter("plains_1");
            const capture = vi.fn();
            return {
                capture,
                observer: createBattleTelemetryObserver({
                    telemetry: { enabled: true, capture },
                    replayId,
                    release: "test",
                    encounter: "plains_1",
                    seed: engine.getSeed(),
                    initialState: engine.getGameState(),
                    getCurrentState: () => engine.getGameState(),
                }),
            };
        };
        const finished = makeObserver("finished");
        finished.observer.onOutcome?.("victory");
        finished.observer.onPageHide({ persisted: false });
        const quit = makeObserver("quit");
        quit.observer.onQuit?.();
        quit.observer.onPageHide({ persisted: false });
        const cached = makeObserver("cached");
        cached.observer.onPageHide({ persisted: true });

        expect(finished.observer.lifecycleState).toBe("finished");
        expect(quit.observer.lifecycleState).toBe("quit");
        expect(cached.observer.lifecycleState).toBe("active");
        for (const capture of [finished.capture, quit.capture, cached.capture]) {
            expect(capture.mock.calls.some(([event]) => event === "battle_abandoned"))
                .toBe(false);
        }
    });

    it("swallows telemetry failures while reporting abandonment", () => {
        const engine = createCustomEngine(encounterList, [ko], 8224);
        engine.loadCharacter(ko.id);
        engine.loadEncounter("plains_1");
        const observer = createBattleTelemetryObserver({
            telemetry: {
                enabled: true,
                capture: () => { throw new Error("beacon unavailable"); },
            },
            replayId: "failure",
            release: "test",
            encounter: "plains_1",
            seed: engine.getSeed(),
            initialState: engine.getGameState(),
            getCurrentState: () => engine.getGameState(),
        });

        expect(() => observer.onPageHide({ persisted: false })).not.toThrow();
        expect(observer.lifecycleState).toBe("abandoned");
    });
});

describe("PostHog event privacy", () => {
    it("persists a locally generated anonymous player ID across browser visits", () => {
        const values = new Map<string, string>();
        const storage: AnonymousIdStorage = {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => { values.set(key, value); },
        };
        const generate = vi.fn(() => PLAYER_ID);

        expect(getOrCreateAnonymousPlayerId(storage, generate)).toBe(PLAYER_ID);
        expect(values.get(ANONYMOUS_PLAYER_ID_KEY)).toBe(PLAYER_ID);
        expect(getOrCreateAnonymousPlayerId(storage, () => OTHER_PLAYER_ID)).toBe(PLAYER_ID);
        expect(generate).toHaveBeenCalledOnce();
    });

    it("uses different anonymous identities for different browser installations", () => {
        const first = memoryStorage();
        const second = memoryStorage();

        expect(getOrCreateAnonymousPlayerId(first, () => PLAYER_ID)).toBe(PLAYER_ID);
        expect(getOrCreateAnonymousPlayerId(second, () => OTHER_PLAYER_ID)).toBe(OTHER_PLAYER_ID);
    });

    it.each([
        ["battle_started", {
            replay_id: "replay-started",
            release: "v1.2.3",
            encounter: "plains_1",
            seed: 8224,
            initial_state: { turn: { round: 1 } },
        }],
        ["battle_action", {
            replay_id: "replay-action",
            sequence: 1,
            source: "player",
            action: { type: "endTurn" },
            success: false,
            failure_reason: "wrongPhase",
            state_after: { turn: { round: 1 } },
        }],
        ["battle_finished", {
            replay_id: "replay-finished",
            outcome: "victory",
            action_count: 7,
            final_state: { turn: { outcome: "victory" } },
        }],
        ["battle_quit", {
            replay_id: "replay-quit",
            action_count: 3,
            current_state: { turn: { outcome: "ongoing" } },
        }],
        ["battle_abandoned", {
            replay_id: "replay-abandoned",
            action_count: 4,
            current_state: { turn: { outcome: "ongoing" } },
        }],
    ] as const)("preserves gameplay properties for %s", (event, gameplay) => {
        const payload = postHogPayload(event, gameplay);

        const sanitized = sanitizePostHogEvent(payload, PLAYER_ID);

        expect(sanitized).toMatchObject({
            uuid: payload.uuid,
            event,
            timestamp: payload.timestamp,
            properties: {
                token: "project-token",
                distinct_id: PLAYER_ID,
                $process_person_profile: false,
                $geoip_disable: true,
                ...gameplay,
            },
        });
    });

    it("removes browser, session, device, GeoIP, and SDK metadata", () => {
        const sanitized = sanitizePostHogEvent(postHogPayload("battle_action", {
            replay_id: "replay-action",
            sequence: 1,
            source: "player",
            action: { type: "endTurn" },
            success: true,
            state_after: {},
        }), PLAYER_ID);

        expect(sanitized?.properties).toEqual({
            token: "project-token",
            distinct_id: PLAYER_ID,
            $process_person_profile: false,
            $geoip_disable: true,
            replay_id: "replay-action",
            sequence: 1,
            source: "player",
            action: { type: "endTurn" },
            success: true,
            state_after: {},
        });
        expect(sanitized).not.toHaveProperty("$set");
        expect(sanitized).not.toHaveProperty("$set_once");
        expect(sanitized).not.toHaveProperty("$unset");
    });

    it("drops events outside the five gameplay event types", () => {
        expect(sanitizePostHogEvent(postHogPayload("$pageview", {
            replay_id: "replay-pageview",
        }), PLAYER_ID)).toBeNull();
    });

    it("uses the anonymous player ID across battles without conflating replay IDs", () => {
        const first = sanitizePostHogEvent(postHogPayload("battle_quit", {
            replay_id: "replay-one",
            action_count: 0,
            current_state: {},
        }), PLAYER_ID);
        const second = sanitizePostHogEvent(postHogPayload("battle_quit", {
            replay_id: "replay-two",
            action_count: 0,
            current_state: {},
        }), PLAYER_ID);
        const otherInstallation = sanitizePostHogEvent(postHogPayload("battle_quit", {
            replay_id: "replay-three",
            action_count: 0,
            current_state: {},
        }), OTHER_PLAYER_ID);

        expect(first?.properties.distinct_id).toBe(PLAYER_ID);
        expect(second?.properties.distinct_id).toBe(PLAYER_ID);
        expect(first?.properties.replay_id).not.toBe(second?.properties.replay_id);
        expect(otherInstallation?.properties.distinct_id).toBe(OTHER_PLAYER_ID);
    });
});

function memoryStorage(): AnonymousIdStorage {
    const values = new Map<string, string>();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); },
    };
}

function postHogPayload(
    event: string,
    gameplay: Record<string, unknown>,
): PostHogEventPayload {
    return {
        uuid: "00000000-0000-4000-8000-000000000000",
        event,
        timestamp: new Date("2026-09-21T12:00:00Z"),
        properties: {
            token: "project-token",
            distinct_id: "posthog-generated-id",
            $device_id: "persistent-device-id",
            $session_id: "session-id",
            $window_id: "window-id",
            $browser: "Chrome",
            $browser_language: "en-US",
            $browser_language_prefix: "en",
            $device_type: "Desktop",
            $session_entry_host: "example.test",
            $session_entry_pathname: "/game",
            $session_entry_referrer: "https://referrer.test",
            $session_entry_referring_domain: "referrer.test",
            $session_entry_url: "https://example.test/game",
            $timezone: "America/New_York",
            $timezone_offset: -240,
            $geoip_city_name: "Ashburn",
            $geoip_country_code: "US",
            $ip: "proxy-ip",
            $lib: "web",
            $lib_version: "1.434.4",
            $config_defaults: "unset",
            $sdk_debug_retry_queue_size: 0,
            ...gameplay,
        },
        $set: { email: "not-allowed@example.test" },
        $set_once: { initial_browser: "Chrome" },
        $unset: ["legacy_property"],
    };
}
