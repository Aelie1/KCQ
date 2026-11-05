import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogStylePreferences } from "../../src/ui/web/app/gameLogMode";
import { resetPreferences } from "../../src/ui/web/app/resetPreferences";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("log style preferences", () => {
    it("defaults to Both and Game without writing and persists styles independently", () => {
        const write = vi.spyOn(Storage.prototype, "setItem");
        const styles = createLogStylePreferences();
        expect([styles.full, styles.compact]).toEqual(["both", "game"]);
        expect(write).not.toHaveBeenCalled();
        for (const value of ["story", "game", "both"] as const) {
            styles.setFull(value);
            expect([styles.full, styles.compact]).toEqual([value, "game"]);
            expect(window.localStorage.getItem("kcq.fullLogStyle")).toBe(value);
            expect(createLogStylePreferences().full).toBe(value);
        }
        for (const value of ["story", "game"] as const) {
            styles.setCompact(value);
            expect([styles.full, styles.compact]).toEqual(["both", value]);
            expect(window.localStorage.getItem("kcq.compactLogStyle")).toBe(value);
            expect(createLogStylePreferences().compact).toBe(value);
        }
    });
    it.each(["", "Story", "unknown", "null", '"story"', "{}", "combat"])("uses defaults for invalid new values: %s", value => {
        window.localStorage.setItem("kcq.fullLogStyle", value);
        window.localStorage.setItem("kcq.compactLogStyle", value);
        window.localStorage.setItem("kcq.gameLogMode", "story");
        const styles = createLogStylePreferences();
        expect([styles.full, styles.compact]).toEqual(["both", "game"]);
        styles.setFull("invalid" as never); styles.setCompact("both" as never);
        expect([styles.full, styles.compact]).toEqual(["both", "game"]);
    });
    it("migrates explicit Story for both settings and persists the migration", () => {
        window.localStorage.setItem("kcq.gameLogMode", "story");
        const styles = createLogStylePreferences();
        expect([styles.full, styles.compact]).toEqual(["story", "story"]);
        expect(window.localStorage.getItem("kcq.fullLogStyle")).toBe("story");
        expect(window.localStorage.getItem("kcq.compactLogStyle")).toBe("story");
        styles.setFull("both");
        expect(createLogStylePreferences().full).toBe("both");
    });
    it.each(["combat", "unknown"])("uses new defaults for legacy %s", value => {
        window.localStorage.setItem("kcq.gameLogMode", value);
        const styles = createLogStylePreferences();
        expect([styles.full, styles.compact]).toEqual(["both", "game"]);
    });
    it.each(["full", "compact"] as const)("migrates only missing preferences when %s already exists", existing => {
        window.localStorage.setItem("kcq.gameLogMode", "story");
        window.localStorage.setItem(`kcq.${existing}LogStyle`, "game");
        const styles = createLogStylePreferences();
        expect([styles.full, styles.compact]).toEqual(existing === "full" ? ["game", "story"] : ["story", "game"]);
    });
    it("resets migrated styles persistently without touching unrelated storage", () => {
        window.localStorage.setItem("kcq.gameLogMode", "story");
        window.localStorage.setItem("other", "keep");
        const styles = createLogStylePreferences();
        resetPreferences({ logStyles: styles });
        expect([styles.full, styles.compact]).toEqual(["both", "game"]);
        const recreated = createLogStylePreferences();
        expect([recreated.full, recreated.compact]).toEqual(["both", "game"]);
        expect(window.localStorage.getItem("other")).toBe("keep");
    });
    it("keeps live selections and resets when storage is unavailable", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
        const styles = createLogStylePreferences();
        styles.setFull("game"); styles.setCompact("story");
        expect([styles.full, styles.compact]).toEqual(["game", "story"]);
        resetPreferences({ logStyles: styles });
        expect([styles.full, styles.compact]).toEqual(["both", "game"]);
    });
    it("tolerates an unavailable localStorage property", () => {
        vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("blocked"); });
        const styles = createLogStylePreferences();
        styles.setFull("story"); styles.setCompact("story");
        expect([styles.full, styles.compact]).toEqual(["story", "story"]);
    });
});
