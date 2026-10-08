import { describe, expect, it, vi } from "vitest";
import { createStockEngine, stockCharacters } from "../../src/stock";
import type { BattleUI } from "../../src/ui/console/controller";
import {
    attachBattlePageLifecycle,
    createBattle,
    DEFAULT_DIFFICULTY,
    ENCOUNTER_DIFFICULTIES,
    startBattle,
    type PageLifecycleTarget,
} from "../../src/ui/web/app";
import type { BattleTelemetryObserver } from "../../src/ui/web/telemetry";

describe("web battle application", () => {
    it("offers all five difficulties with Standard selected by default", () => {
        expect(DEFAULT_DIFFICULTY).toBe("standard");
        expect(ENCOUNTER_DIFFICULTIES.map(({ id }) => id)).toEqual([
            "casual",
            "standard",
            "veteran",
            "extreme",
            "mythic",
        ]);
    });

    it("loads the full character list in order for every selectable encounter", () => {
        for (const encounter of createStockEngine().listEncounters()) {
            const engine = createStockEngine();
            const battle = createBattle(engine, encounter);
            const view = battle.engine.getGameState();

            expect(view.characters.map((character) => character.id)).toEqual(
                stockCharacters,
            );
            expect(view.encounter?.id).toBe(encounter);
            expect(battle.encounterId).toBe(encounter);
        }
    });

    it("uses the engine-selected difficulty as battle state", () => {
        const engine = createStockEngine();
        engine.setDifficulty("mythic");

        const battle = createBattle(engine, engine.listEncounters()[0]);

        expect(battle.engine.getGameState().difficulty).toEqual({
            id: "mythic",
            playerModifiers: {},
            enemyModifiers: { potency: 2 },
        });
    });

    it("starts the selected encounter through the engine difficulty API", () => {
        const engine = createStockEngine();
        const setDifficulty = vi.spyOn(engine, "setDifficulty");

        const battle = createBattle(engine, engine.listEncounters()[0], "extreme");

        expect(setDifficulty).toHaveBeenCalledOnce();
        expect(setDifficulty).toHaveBeenCalledWith("extreme");
        expect(battle.engine.getGameState().difficulty).toEqual({
            id: "extreme",
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
        const engine = createStockEngine();

        await expect(startBattle(engine, engine.listEncounters()[0], ui)).resolves.toBeUndefined();
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
