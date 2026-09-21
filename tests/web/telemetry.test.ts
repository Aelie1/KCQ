import { describe, expect, it, vi } from "vitest";
import { ko } from "../../src/content/characters/ko";
import { encounterList } from "../../src/content/content";
import { createCustomEngine } from "../../src/engine/protected/engine";
import {
    compactStateDigest,
    createBattleTelemetryObserver,
    createGameplayTelemetry,
    type GameplayTelemetry,
} from "../../src/web/telemetry";

describe("browser gameplay telemetry", () => {
    it("creates a compact digest from public tactical state", () => {
        const engine = createCustomEngine(encounterList, [ko], 8224);
        engine.loadCharacter(ko.id);
        engine.loadEncounter("plains_1");
        const view = engine.getGameView();
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
            initialView: engine.getGameView(),
            getCurrentView: () => engine.getGameView(),
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
            initialView: engine.getGameView(),
            getCurrentView: () => engine.getGameView(),
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
});
