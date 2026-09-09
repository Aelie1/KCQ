import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { runConsoleClient } from "../src/console/client";
import { formatEvents, formatIntention } from "../src/console/format";
import { formatAccuracyRow, renderScreen } from "../src/console/render";
import { ko } from "../src/content/characters/ko";
import { encounterList } from "../src/content/content";
import { GameEngine } from "../src/engine/engine";
import type { GameState } from "../src/engine/types";

const state: GameState = {
    turn: { round: 3, step: 1, phase: "player" },
    characters: [{
        id: "ko",
        acted: false,
        standing: true,
        bonusEscapes: 0,
        bindings: [{ id: "latexarms", value: 55, level: "extreme", state: {} }],
        buffs: [],
        status: [{ id: "bound", value: 3 }],
    }],
    enemies: [{
        id: "skunkette1",
        currHp: 12,
        currDef: 0,
        buffs: [],
        intention: {
            move: "latexSpray",
            targets: [{
                target: "ko",
                result: "hit",
                effects: [{ type: "binding", target: "ko", binding: "latexarms", amount: 19 }],
            }],
            effects: [],
        },
    }],
};

describe("console formatting", () => {
    it("formats intentions with target-attached and top-level effects", () => {
        expect(formatIntention({
            move: "royalMist",
            targets: [{ target: "ko", result: "graze", effects: [] }],
            effects: [{ type: "buff", source: "queen", target: "queen", buff: "puddle" }],
        })).toEqual([
            "  Intent: royalMist",
            "    ko           GRAZE ",
            "    + queen puddle added",
        ]);
    });

    it("turns action events into readable log lines", () => {
        expect(formatEvents([
            { type: "moveUsed", actor: "ko", move: "telekinesis", targets: [{ target: "foe1", result: "hit" }] },
            { type: "damage", target: "foe1", amount: 10 },
            { type: "enemyDefeated", target: "foe1" },
        ])).toEqual([
            "ko used telekinesis on foe1: HIT",
            "foe1 took 10 damage.",
            "foe1 was defeated.",
        ]);
    });

    it("renders a fixed-size four-panel screen", () => {
        const rendered = renderScreen({
            encounter: "plains_1",
            state,
            actionLines: ["[1] telekinesis"],
            logLines: ["Encounter plains_1 began."],
        }, 120, 36);
        const lines = rendered.split("\n");

        expect(lines).toHaveLength(36);
        expect(lines.every((line) => line.length === 120)).toBe(true);
        expect(rendered).toContain("PARTY");
        expect(rendered).toContain("ENEMIES");
        expect(rendered).toContain("ACTIONS / TARGETING");
        expect(rendered).toContain("RECENT LOG");
        expect(rendered).toContain("latexarms");
        expect(rendered).toContain("Intent: latexSpray");
    });

    it("formats all accuracy bands", () => {
        expect(formatAccuracyRow("foe", { miss: 10, graze: 15, hit: 65, crit: 10 }))
            .toContain("10%       15%      65%       10%");
    });

    it("plays an attack and enemy phase using only numbered input", async () => {
        const engine = new GameEngine(encounterList, 8224);
        engine.loadCharacter(ko);
        engine.loadEncounter("plains_1");
        const input = new PassThrough();
        const output = Object.assign(new PassThrough(), { columns: 180, rows: 50 });
        const answers = ["1", "1", "1", "2", "3"];
        let rendered = "";
        output.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            rendered += text;
            if (text === "> ") {
                const answer = answers.shift();
                if (answer) setImmediate(() => input.write(`${answer}\n`));
            }
        });

        await runConsoleClient(engine, "plains_1", [], { input, output });

        expect(answers).toEqual([]);
        expect(engine.getGameState().turn.round).toBe(2);
        expect(rendered).toContain("TARGET");
        expect(rendered).toMatch(/telekinesis on skunkette1: (MISS|GRAZE|HIT|CRIT)/);
    });
});
