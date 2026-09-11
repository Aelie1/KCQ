import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { runConsoleClient } from "../src/console/client";
import { formatBuff, formatEffects, formatEvents, formatIntention } from "../src/console/format";
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
        bindings: [{ id: "latexArms", value: 55, level: "extreme", data: {} }],
        buffs: [],
        status: [{ id: "bound", value: 3 }],
    }],
    enemies: [{
        id: "skunkette1",
        currHp: 12,
        currDef: 0,
        cooldowns: {},
        buffs: [],
        intention: {
            move: "latexSpray",
            targets: [{
                target: "ko",
                band: "hit",
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
            targets: [{ target: "ko", band: "graze", effects: [] }],
            effects: [{ type: "buff", target: "queen", buff: "puddle", operation: "add" }],
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

    it("describes serialized buff effects", () => {
        expect(formatBuff({
            id: "pounce",
            active: false,
            duration: 2,
            linkedEntity: "skunkette1",
            statuses: [{ id: "immobilized", value: 1 }],
            modifiers: { defense: -2, hit: 4 },
        })).toBe(
            "Pounce (pending) (2 rounds) (linked: skunkette1) "
            + "(IMMOBILIZED) (Def -2) (Hit +4)",
        );
    });

    it("groups equal binding effects without merging different operations", () => {
        expect(formatEffects([
            { type: "binding", target: "ko", binding: "latexArms", amount: 10 },
            { type: "binding", target: "ko", binding: "latexLegs", amount: 10 },
            { type: "damage", source: "foe", target: "ko", amount: 10 },
            { type: "binding", target: "ko", binding: "latexTorso", amount: 6 },
            { type: "binding", target: "ally", binding: "latexHead", amount: 10 },
        ], true)).toEqual([
            "ko latexArms, latexLegs +10",
            "ko 10 damage",
            "ko latexTorso +6",
            "ally latexHead +10",
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

    it("wraps long status and buff lists without losing their contents", () => {
        const longState: GameState = {
            ...state,
            characters: [{
                ...state.characters[0],
                bindings: [],
                status: [
                    { id: "bound", value: 1 },
                    { id: "gagged", value: 2 },
                    { id: "hobbled", value: 3 },
                    { id: "vibrating", value: 4 },
                    { id: "submissive", value: 4 },
                    { id: "breathless", value: 4 },
                    { id: "blinded", value: 4 },
                    { id: "immobilized", value: 1 },
                    { id: "helpless", value: 1 },
                    { id: "stunned", value: 1 },
                    { id: "incapacitated", value: 1 },
                ],
                buffs: [{
                    id: "veryLongBuffName",
                    active: true,
                    linkedEntity: "skunkette1",
                    statuses: [{ id: "immobilized", value: 1 }],
                    modifiers: { hitarms: -2, hitmouth: -3, defense: -4, willpower: 2 },
                }],
            }],
        };
        const rendered = renderScreen({
            encounter: "plains_1",
            seed: 8224,
            state: longState,
            actionLines: [],
            logLines: [],
        }, 120, 60);

        expect(rendered).toContain("Status: bound 1, gagged 2");
        expect(rendered).toContain("incapacitated 1");
        expect(rendered).toContain("Buffs: Very Long Buff Name");
        expect(rendered).toContain("(Mouth Hit -3)");
        expect(rendered).toContain("(Def -4)");
        expect(rendered).toContain("(Willpower +2)");
        expect(rendered).not.toContain("…");
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
        expect(rendered).toContain("~~~ ROUND 2 ~~~");
        expect(rendered).toContain("Seed 8224");
        expect(rendered).toContain("Escape / assist - unavailable: no legal escapes");
    });

    it("shows a fully acted character without assigning it a menu number", async () => {
        const engine = new GameEngine(encounterList, 8224);
        engine.loadCharacter(ko);
        engine.loadCharacter(makeCharacterDef("ally"));
        engine.loadEncounter("plains_1");

        const rendered = await runScriptedConsole(engine, ["1", "1", "1", "4"]);

        expect(rendered).toContain("[-] ko  UNAVAILABLE: actorAlreadyActed");
        expect(rendered).toContain("[2] ally  READY");
        expect(rendered).toContain("[3] End turn");
        expect(rendered).toContain("[4] Quit");
        expect(engine.getGameState().turn.round).toBe(1);
    });

    it("does not number unavailable characters and ignores them for automatic end turn", async () => {
        const helplessBinding = makeBindingDef("helpless-source", {
            easy: [{ definition: helpless, value: 1 }],
        });
        const { engine } = setupBoundEngine(helplessBinding, thresholds.easy);
        const wait = makeMove("player-wait", "mouth", { targets: 0 });
        engine.loadCharacter(makeCharacterDef("ally", [wait]));

        const rendered = await runScriptedConsole(engine, ["2", "1", "4"]);

        expect(rendered).toContain("[-] hero  UNAVAILABLE: actorSkipped");
        expect(rendered).toContain("[2] ally  READY");
        expect(rendered).toContain("Choose an action for ally.");
        expect(rendered).not.toContain("Choose an action for hero.");
        expect(rendered).toContain("No target");
        expect(rendered).toMatch(/No target\s+-\s+-\s+100%\s+-/);
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

    it("exits immediately with dimensions when the terminal is too small", async () => {
        const engine = new GameEngine(encounterList, 8224);
        engine.loadCharacter(ko);
        engine.loadEncounter("plains_1");
        const input = new PassThrough();
        const output = Object.assign(new PassThrough(), { columns: 80, rows: 20 });
        let rendered = "";
        output.on("data", (chunk: Buffer) => {
            rendered += chunk.toString();
        });

        await runConsoleClient(engine, "plains_1", [], { input, output });

        expect(rendered).toBe("Terminal too small: current 80x19; required 120x36.\n");
        expect(rendered).not.toContain("Retry");
        expect(rendered).not.toContain("Choice>");
    });
});
