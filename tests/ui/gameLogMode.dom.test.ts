import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGameLogModePreference } from "../../src/ui/web/app/gameLogMode";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("Game Log mode preference", () => {
    it("defaults to combat without writing, and restores both selections when recreated", () => {
        const write = vi.spyOn(Storage.prototype, "setItem");
        const [mode, select] = createGameLogModePreference();
        expect(mode()).toBe("combat");
        expect(write).not.toHaveBeenCalled();
        for (const value of ["story", "combat"] as const) {
            select(value);
            expect(mode()).toBe(value);
            expect(window.localStorage.getItem("kcq.gameLogMode")).toBe(value);
            expect(createGameLogModePreference()[0]()).toBe(value);
        }
    });

    it.each(["", "Story", "unknown", "null", '"story"', "{}"])("falls back to combat for stored value %s", value => {
        window.localStorage.setItem("kcq.gameLogMode", value);
        expect(createGameLogModePreference()[0]()).toBe("combat");
    });

    it("retains the live selection when storage reads and writes throw", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
        const [mode, select] = createGameLogModePreference();
        expect(mode()).toBe("combat");
        select("story"); expect(mode()).toBe("story");
        select("combat"); expect(mode()).toBe("combat");
    });

    it("also tolerates an unavailable localStorage property", () => {
        vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("blocked"); });
        const [mode, select] = createGameLogModePreference();
        expect(mode()).toBe("combat");
        select("story"); expect(mode()).toBe("story");
    });
});
