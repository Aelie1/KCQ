import { describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import { startBattle } from "../../src/ui/console/app";
import type { BattleUI } from "../../src/ui/console/controller";

describe("console battle application", () => {
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
});
