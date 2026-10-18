import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runSingleFight } from "../../src/harness/harness";
import { writeFightResult } from "../../src/harness/output";

vi.mock("../../src/harness/harness", () => ({ runSingleFight: vi.fn() }));
vi.mock("../../src/harness/output", () => ({ writeFightResult: vi.fn(() => "test-result.json") }));

const originalArgv = process.argv;
beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = [process.execPath, "fight-main.ts", "plains_1", "123", "idle"];
});
afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
});

describe("fight CLI configuration", () => {
    it("retains the original defaults when flags are omitted", async () => {
        await import("../../src/harness/cli/fight-main");
        expect(runSingleFight).toHaveBeenCalledExactlyOnceWith({
            encounterId: "plains_1", engineSeed: 123, policy: expect.objectContaining({ id: "idle" }),
            policySeed: 0, maxActions: 1000, replay: true,
        });
    });

    it("passes one explicit configuration to execution and saved replay output", async () => {
        process.argv.push("42", "--party=sakari,naruyo,ko", "--difficulty", "extreme");
        await import("../../src/harness/cli/fight-main");
        const input = vi.mocked(runSingleFight).mock.calls[0][0];
        expect(input).toMatchObject({
            party: ["sakari", "naruyo", "ko"], difficulty: "extreme", policySeed: 42, replay: true,
        });
        expect(writeFightResult).toHaveBeenCalledWith(input, undefined);
    });

    it("rejects invalid configuration before execution or output", async () => {
        process.argv.push("--party=ko,ko,hinari");
        await expect(import("../../src/harness/cli/fight-main")).rejects.toThrow(/duplicate/);
        expect(runSingleFight).not.toHaveBeenCalled();
        expect(writeFightResult).not.toHaveBeenCalled();
    });
});
