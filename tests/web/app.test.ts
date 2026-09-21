import { describe, expect, it, vi } from "vitest";
import type { BattleUI } from "../../src/console/controller";
import { characterList, encounterList } from "../../src/content/content";
import { createBattle, startBattle } from "../../src/web/app";

describe("web battle application", () => {
    it("loads the full character list in order for every selectable encounter", () => {
        for (const encounter of encounterList) {
            const battle = createBattle(encounter);
            const view = battle.engine.getGameView();

            expect(view.characters.map((character) => character.id)).toEqual(
                characterList.map((character) => character.id),
            );
            expect(view.encounter?.id).toBe(encounter.id);
            expect(battle.encounterId).toBe(encounter.id);
        }
    });

    it("creates a fresh engine and game state for every battle", () => {
        const first = createBattle(encounterList[0]);
        const second = createBattle(encounterList[0]);

        expect(first.engine).not.toBe(second.engine);

        first.engine.executeAction({ type: "endTurn" });

        expect(first.engine.getGameView().turn.round).toBeGreaterThan(
            second.engine.getGameView().turn.round,
        );
        expect(second.engine.getGameView().turn.round).toBe(1);
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

        await expect(startBattle(encounterList[0], ui)).resolves.toBeUndefined();
        expect(close).toHaveBeenCalledOnce();
    });
});
