import { PassThrough, Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { runConsoleReplay, type ConsoleReplayInput } from "../../src/console/replay";
import type { GameView, PlayerAction } from "../../src/engine/public/types";
import type { FightReplay } from "../../src/harness/harness";

// Fail if viewing ever acquires a runtime dependency on simulation or the runner.
vi.mock("../../src/engine/private/engine", () => {
    throw new Error("Replay viewing must not load the simulation engine");
});
vi.mock("../../src/harness/harness", () => {
    throw new Error("Replay viewing must not load the fight runner");
});

const clearScreen = "\x1b[2J\x1b[H";

function recordedState(round: number, hp: number, binding: number): GameView {
    return {
        turn: { round, step: 1, phase: "player", outcome: "ongoing" },
        characters: [{
            id: "hero",
            acted: false,
            standing: true,
            bonusEscapes: 0,
            bindings: [{ id: "rope", value: binding, level: "easy", data: {}, status: [] }],
            buffs: [],
            data: {},
            modifiers: {},
            blockedMoveTypes: [],
        }],
        enemies: [{
            id: "recorded-foe",
            rank: "enemy",
            currHp: hp,
            maxHp: 90,
            currDef: 0,
            cooldowns: {},
            buffs: [],
            intentions: [{ move: "recorded-intention", targets: [], effects: [] }],
        }],
        traps: [{ id: "recordedTrap", amount: round }],
        encounter: { id: "recorded-encounter", enemies: ["recorded-foe"], bindings: ["rope"], traps: ["recordedTrap"] },
        actions: [{
            id: "hero",
            available: true,
            moves: [],
            escapes: [],
            stance: { available: true },
        }],
    };
}

function replayInput(): ConsoleReplayInput {
    return {
        encounter: "recorded-encounter",
        seed: 42,
        bindingThresholds: { max: 100, thresholds: { easy: 10, hard: 30 } },
        replay: {
            initialState: recordedState(1, 90, 0),
            steps: [{
                action: { type: "move", actor: "hero", move: "recorded-strike", targets: ["recorded-foe"] },
                success: true,
                events: [{ type: "enemyDamaged", target: "recorded-foe", amount: 17 }],
                state: recordedState(1, 73, 12),
            }, {
                action: { type: "endTurn" },
                success: true,
                events: [{ type: "enemyDamaged", target: "recorded-foe", amount: 32 }],
                state: recordedState(2, 41, 24),
            }],
        },
    };
}

async function viewReplay(
    replay: ConsoleReplayInput,
    commands: string[],
    size = { columns: 180, rows: 50 },
): Promise<string[]> {
    // Sending commands in one chunk also exercises queued input and EOF handling.
    const input = Readable.from([commands.map((command) => `${command}\n`).join("")]);
    const output = Object.assign(new PassThrough(), size);
    const frames: string[] = [];
    output.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.startsWith(clearScreen) && text !== clearScreen) frames.push(text);
    });
    await runConsoleReplay(replay, { input, output });
    expect(input.listenerCount("data")).toBe(0);
    return frames;
}

function expectPosition(frame: string, position: number, hp: number, total = 2): void {
    expect(frame).toContain(`REPLAY  Step ${position} / ${total}`);
    expect(frame).toContain(`recorded-foe [HP: ${hp}/90]`);
}

function freezeReplay(value: unknown): void {
    if (value && typeof value === "object") {
        Object.values(value).forEach(freezeReplay);
        Object.freeze(value);
    }
}

describe("console replay viewer", () => {
    it("starts at the recorded initial state with metadata and the normal panels", async () => {
        const [frame] = await viewReplay(replayInput(), ["quit"]);

        expectPosition(frame, 0, 90);
        expect(frame).toContain("Initial replay state.");
        expect(frame).not.toContain("Action:");
        expect(frame).toContain("Seed 42 / Round 1 / PLAYER");
        expect(frame).toContain("recorded-encounter");
        expect(frame).toContain("PARTY");
        expect(frame).toContain("hero [Ready]");
        expect(frame).toContain("rope");
        expect(frame).toContain("0/0");
        expect(frame).toContain("ENEMIES");
        expect(frame).toContain("Intent: recorded-intention");
        expect(frame).toMatch(/Recorded \[[-#]+\] 1\/100/);
        expect(frame).not.toContain("took 17 damage");
    });

    it("advances through recorded states and restores state and cumulative events on previous", async () => {
        const frames = await viewReplay(replayInput(), ["next", "n", "previous", "n", "q"]);

        expect(frames).toHaveLength(5);
        expectPosition(frames[1], 1, 73);
        expect(frames[1]).toContain("Action: move hero: recorded-strike; targets: [recorded-foe]");
        expect(frames[1]).toContain("12/0");
        expect(frames[1]).toContain("recorded-foe took 17 damage.");
        expect(frames[1]).not.toContain("took 32 damage");
        expectPosition(frames[2], 2, 41);
        expect(frames[2]).toContain("Round 2 / PLAYER");
        expect(frames[2]).toContain("Action: endTurn");
        expect(frames[2]).toContain("24/0");
        expect(frames[2]).toContain("recorded-foe took 17 damage.");
        expect(frames[2]).toContain("recorded-foe took 32 damage.");
        expectPosition(frames[3], 1, 73);
        expect(frames[3]).not.toContain("took 32 damage");
        // Relative equality verifies determinism without baking in a terminal layout.
        expect(frames[3]).toBe(frames[1]);
        expect(frames[4]).toBe(frames[2]);
    });

    it("clamps both boundaries and supports start/end without quitting on a terminal outcome", async () => {
        const input = replayInput();
        const lastStep = input.replay.steps[1];
        if (lastStep.success) lastStep.state.turn.outcome = "defeat";
        const frames = await viewReplay(input, ["p", "end", "next", "previous", "start", "q"]);

        expect(frames).toHaveLength(6);
        expect(frames[1]).toBe(frames[0]);
        expectPosition(frames[2], 2, 41);
        expect(frames[2]).toContain("Outcome: DEFEAT");
        expect(frames[3]).toBe(frames[2]);
        expectPosition(frames[4], 1, 73);
        expect(frames[5]).toBe(frames[0]);
    });

    it("retains the last successful state through consecutive failures and shows each reason", async () => {
        const input = replayInput();
        input.replay.steps.splice(1, 0, {
            action: { type: "escape", actor: "hero", target: "ally", binding: "rope" },
            success: false,
            reason: "invalidTarget",
        }, {
            action: { type: "stance", actor: "hero" },
            success: false,
            reason: "actorAlreadyActed",
        });
        const frames = await viewReplay(input, ["n", "n", "n", "n", "p", "p", "p", "q"]);

        expectPosition(frames[2], 2, 73, 4);
        expect(frames[2]).toContain("Action: escape hero -> ally: rope");
        expect(frames[2]).toContain("Failed: invalidTarget");
        expect(frames[2]).toContain("Action failed: invalidTarget.");
        expect(frames[2]).toContain("took 17 damage");
        expectPosition(frames[3], 3, 73, 4);
        expect(frames[3]).toContain("Action: stance hero");
        expect(frames[3]).toContain("Failed: actorAlreadyActed");
        expectPosition(frames[4], 4, 41, 4);
        expect(frames[5]).toBe(frames[3]);
        expect(frames[6]).toBe(frames[2]);
        expect(frames[7]).toBe(frames[1]);
        expect(frames[7]).not.toContain("invalidTarget");
    });

    it("retains initialState when the very first step fails", async () => {
        const input = replayInput();
        input.replay.steps = [{ action: { type: "endTurn" }, success: false, reason: "wrongPhase" }];
        const frames = await viewReplay(input, ["n", "p", "q"]);

        expectPosition(frames[1], 1, 90, 1);
        expect(frames[1]).toContain("Action: endTurn");
        expect(frames[1]).toContain("Failed: wrongPhase");
        expect(frames[1]).not.toContain("Initial replay state.");
        expect(frames[2]).toBe(frames[0]);
    });

    it("views frozen replay data without mutation or access to the simulation engine", async () => {
        const input = replayInput();
        const before: FightReplay = structuredClone(input.replay);
        freezeReplay(input);

        const frames = await viewReplay(input, ["n", "n", "p", "start", "end", "q"]);

        expectPosition(frames[5], 2, 41);
        expect(input.replay).toEqual(before);
    });

    it("keeps an empty replay at position zero and permits missing encounter metadata", async () => {
        const input = replayInput();
        input.replay.steps = [];
        input.replay.initialState.encounter = null;
        const frames = await viewReplay(input, ["n", "p", "start", "end", "q"]);

        expect(frames).toHaveLength(5);
        for (const frame of frames) {
            expectPosition(frame, 0, 90, 0);
            expect(frame).toBe(frames[0]);
            expect(frame).toContain("Bindings: none");
        }
    });

    it.each<{ action: PlayerAction; description: string }>([
        { action: { type: "move", actor: "hero", move: "sweep", targets: [] }, description: "move hero: sweep; targets: []" },
        { action: { type: "move", actor: "hero", move: "sweep", targets: ["a", "b"] }, description: "move hero: sweep; targets: [a, b]" },
        { action: { type: "escape", actor: "hero", target: "ally", binding: "rope" }, description: "escape hero -> ally: rope" },
        { action: { type: "stance", actor: "hero" }, description: "stance hero" },
        { action: { type: "endTurn" }, description: "endTurn" },
    ])("identifies the recorded action: $description", async ({ action, description }) => {
        const input = replayInput();
        input.replay.steps[0].action = action;
        const frames = await viewReplay(input, ["n", "q"]);
        expect(frames[1]).toContain(`Action: ${description}`);
    });

    it("ignores unknown commands and accepts trimmed, case-insensitive controls", async () => {
        const frames = await viewReplay(replayInput(), ["unknown", " NEXT ", " Previous ", " QUIT ", "n"]);

        expect(frames).toHaveLength(4);
        expectPosition(frames[1], 0, 90);
        expect(frames[1]).toContain("Use next, previous, start, end, or quit.");
        expectPosition(frames[2], 1, 73);
        expect(frames[3]).toBe(frames[0]);
    });

    it("exits cleanly on EOF without requiring quit", async () => {
        const frames = await viewReplay(replayInput(), ["n"]);
        expect(frames).toHaveLength(2);
        expectPosition(frames[1], 1, 73);
    });

    it("accepts interactive commands and redraws after an undersized terminal is resized", async () => {
        const input = new PassThrough();
        const output = Object.assign(new PassThrough(), { columns: 80, rows: 20 });
        let rendered = "";
        output.on("data", (chunk: Buffer) => { rendered += chunk.toString(); });
        let finished = false;
        const viewer = runConsoleReplay(replayInput(), { input, output })
            .finally(() => { finished = true; });
        await new Promise((resolve) => setImmediate(resolve));
        expect(finished).toBe(false);
        expect(rendered).toContain("Terminal too small: current 80x19; required 120x36.");

        output.columns = 180;
        output.rows = 50;
        input.write("n\n");
        await new Promise((resolve) => setImmediate(resolve));
        expectPosition(rendered, 1, 73);

        input.write("p\n");
        await new Promise((resolve) => setImmediate(resolve));
        expectPosition(rendered, 0, 90);
        input.write("q\n");
        await viewer;
        expect(rendered.endsWith(clearScreen)).toBe(true);
        expect(input.listenerCount("data")).toBe(0);
    });

    it("keeps replay information and controls visible at the renderer's minimum size", async () => {
        const frames = await viewReplay(replayInput(), ["n", "q"], { columns: 120, rows: 37 });
        expectPosition(frames[1], 1, 73);
        expect(frames[1]).toContain("Action: move hero: recorded-strike");
        expect(frames[1]).toContain("[n] next  [p] previous  [q] quit");
        expect(frames[1]).toContain("[start] initial state  [end] final step");
    });
});
