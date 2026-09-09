import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { runConsoleClient } from "../src/console/client";
import { formatEvents, formatIntention } from "../src/console/format";
import { formatAccuracyRow, renderScreen } from "../src/console/render";
import { ko } from "../src/content/characters/ko";
import { encounterList } from "../src/content/content";
import { latexArms } from "../src/content/skunk/latex";
import { thresholds } from "../src/engine/constants";
import { GameEngine } from "../src/engine/engine";
import { helpless } from "../src/engine/status";
import type { GameState } from "../src/engine/types";
import {
    makeBindingDef,
    makeCharacterDef,
    makeMove,
    setupBoundEngine,
} from "./helpers";

const state: GameState = {
    turn: { round: 3, step: 1, phase: "player" },
    characters: [{
        id: "ko",
        acted: false,
        standing: true,
        bonusEscapes: 0,
        bindings: [{ id: "latexArms", value: 55, level: "extreme", state: {} }],
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
                effects: [{ type: "binding", target: "ko", binding: "latexArms", amount: 19 }],
            }],
            effects: [],
        },
    }],
};

async function runScriptedConsole(engine: GameEngine, scriptedAnswers: string[]) {
    const input = new PassThrough();
    const output = Object.assign(new PassThrough(), { columns: 180, rows: 50 });
    const answers = [...scriptedAnswers];
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
    return rendered;
}

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
            seed: 8224,
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
        expect(rendered).toContain("latexArms");
        expect(rendered).toContain("Intent: latexSpray");
        expect(rendered).toContain("Seed 8224");
    });

    it("formats all accuracy bands", () => {
        expect(formatAccuracyRow("foe", { miss: 10, graze: 15, hit: 65, crit: 10 }))
            .toContain("10%       15%      65%       10%");
    });

    it("automatically ends the turn after the last available character acts", async () => {
        const engine = new GameEngine(encounterList, 8224);
        engine.loadCharacter(ko);
        engine.loadEncounter("plains_1");
        const rendered = await runScriptedConsole(engine, ["1", "1", "1", "3"]);

        expect(engine.getGameState().turn.round).toBe(2);
        expect(rendered).toContain("TARGET");
        expect(rendered).toMatch(/telekinesis on skunkette1: (MISS|GRAZE|HIT|CRIT)/);
        expect(rendered).toContain("No characters available. Ending turn automatically.");
        expect(rendered).toContain("Seed 8224");
        expect(rendered).toContain("Escape / assist - unavailable: no legal escapes");
    });

    it("shows a fully acted character without assigning it a menu number", async () => {
        const engine = new GameEngine(encounterList, 8224);
        engine.loadCharacter(ko);
        engine.loadCharacter(makeCharacterDef("ally"));
        engine.loadEncounter("plains_1");

        const rendered = await runScriptedConsole(engine, ["1", "1", "1", "3"]);

        expect(rendered).toContain("[-] ko  UNAVAILABLE: actorAlreadyActed");
        expect(rendered).toContain("[1] ally  READY");
        expect(engine.getGameState().turn.round).toBe(1);
    });

    it("does not number unavailable characters and ignores them for automatic end turn", async () => {
        const helplessBinding = makeBindingDef("helpless-source", {
            easy: [{ definition: helpless, value: 1 }],
        });
        const { engine } = setupBoundEngine(helplessBinding, thresholds.easy);
        const wait = makeMove("player-wait", "mouth", { targets: 0 });
        engine.loadCharacter(makeCharacterDef("ally", [wait]));

        const rendered = await runScriptedConsole(engine, ["1", "1", "3"]);

        expect(rendered).toContain("[-] hero  UNAVAILABLE: actorSkipped");
        expect(rendered).toContain("[1] ally  READY");
        expect(rendered).toContain("Choose an action for ally.");
        expect(rendered).not.toContain("Choose an action for hero.");
        expect(rendered).toContain("No characters available. Ending turn automatically.");
        expect(engine.getGameState().turn.round).toBe(3);
    });

    it("refreshes stance and bonus-escape menus in place", async () => {
        const restraint = makeBindingDef("rope");
        const { engine } = setupBoundEngine(restraint, thresholds.impossible);

        const rendered = await runScriptedConsole(
            engine,
            ["1", "5", "4", "1", "1", "3"],
        );

        expect(rendered).toContain("Change stance -> standing");
        expect(rendered).toContain("Change stance -> moving");
        expect(rendered.match(/Choose an action for hero\./g) ?? []).toHaveLength(2);
        expect(rendered.match(/Choose an escape for hero\./g) ?? []).toHaveLength(2);
        expect(rendered.match(/\[1\] hero - rope/g) ?? []).toHaveLength(2);
        const escapeAmounts = [...rendered.matchAll(/hero rope -(\d+)/g)]
            .map((match) => Number(match[1]));
        expect(escapeAmounts).toHaveLength(2);
        expect(escapeAmounts[1]).not.toBe(escapeAmounts[0]);
        expect(rendered).not.toContain("Who should hero free?");
        expect(rendered).not.toContain("Choose a binding on hero.");
        expect(engine.getGameState().turn.round).toBe(3);
    });

    it("previews every effect for an escape option", async () => {
        const { engine } = setupBoundEngine(latexArms, thresholds.hard);

        const rendered = await runScriptedConsole(
            engine,
            ["1", "4", "2", "7", "3"],
        );

        expect(rendered).toContain("[1] hero - latexArms");
        expect(rendered).toContain("     hero latexArms -18");
        expect(rendered).toContain("     hero latexHead +5");
    });
});
