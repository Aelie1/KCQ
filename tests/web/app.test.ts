import { describe, expect, it, vi } from "vitest";
import type { BattleUI } from "../../src/console/controller";
import { contentCatalog } from "../../src/content/content";
import { createEngine } from "../../src/engine/public/engine";
import {
    attachBattlePageLifecycle,
    createBattle,
    startBattle,
    type PageLifecycleTarget,
} from "../../src/web/app";
import type { BattleTelemetryObserver } from "../../src/web/telemetry";

describe("web battle application", () => {
    it("loads the full character list in order for every selectable encounter", () => {
        for (const encounter of contentCatalog.encounters) {
            const engine = createEngine();
            const battle = createBattle(engine, encounter.id);
            const view = battle.engine.getGameState();

            expect(view.characters.map((character) => character.id)).toEqual(
                contentCatalog.characters.map((character) => character.id),
            );
            expect(view.encounter?.id).toBe(encounter.id);
            expect(battle.encounterId).toBe(encounter.id);
        }
    });

    it("uses the engine-selected difficulty as battle state", () => {
        const engine = createEngine();
        engine.setDifficulty("mythic");

        const battle = createBattle(engine, contentCatalog.encounters[0].id);

        expect(battle.engine.getGameState().difficulty).toEqual({
            id: "mythic",
            playerModifiers: {},
            enemyModifiers: { potency: 2 },
        });
    });

    it("returns after the shared controller exits", async () => {
        const close = vi.fn();
        const ui: BattleUI = {
            choose: async ({ choices }) => {
                const quit = choices.find((choice) => choice.label === "Quit");
                if (!quit) throw new Error("Expected the battle's Quit choice.");
                return quit.number;
            },
            close,
        };
        const engine = createEngine();

        await expect(startBattle(engine, contentCatalog.encounters[0].id, ui)).resolves.toBeUndefined();
        expect(close).toHaveBeenCalledOnce();
    });

    it("attaches pagehide and detaches the battle-scoped lifecycle listener", () => {
        let listener: ((event: PageTransitionEvent) => void) | undefined;
        const target: PageLifecycleTarget = {
            addEventListener: (_type, added) => { listener = added; },
            removeEventListener: (_type, removed) => {
                if (listener === removed) listener = undefined;
            },
        };
        const onPageHide = vi.fn();
        const observer = {
            lifecycleState: "active",
            onPageHide,
        } as unknown as BattleTelemetryObserver;

        const detach = attachBattlePageLifecycle(observer, target);
        listener?.({ persisted: false } as PageTransitionEvent);
        expect(onPageHide).toHaveBeenCalledWith({ persisted: false });

        detach();
        expect(listener).toBeUndefined();
    });
});
