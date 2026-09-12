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
import type { GameEvent, GameState, Intention } from "../src/engine/types";
import { oneEnemyEncounter } from "./testContent";
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
        bindings: [{
            id: "latexArms",
            value: 55,
            level: "extreme",
            data: {},
            status: [{ id: "bound", value: 3 }],
        }],
        buffs: [],
        modifiers: { defense: -2 },
        blockedMoveTypes: []
    }],
    enemies: [{
        id: "skunkette1",
        currHp: 12,
        maxHp: 20,
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
    traps: []
};

const bindingThresholds = new GameEngine([], 1).getThresholds();

const longIntention: Intention = {
    move: "royalMist",
    targets: [{
        target: "ko",
        band: "crit",
        effects: [
            { type: "buff", target: "ko", buff: "latexMist", operation: "add" },
            { type: "binding", target: "ko", binding: "latexTorso", amount: 19 },
            { type: "binding", target: "ko", binding: "latexHead", amount: 19 },
            { type: "binding", target: "ko", binding: "latexArms", amount: 19 },
            { type: "binding", target: "ko", binding: "latexLegs", amount: 19 },
        ],
    }],
    effects: [],
};

function renderState(
    gameState: GameState,
    availability: { id: string; available: boolean; reason?: "actorAlreadyActed" | "actorSkipped" | "actorIncapacitated" }[],
    bindings: string[] = [],
    width = 180,
    height = 70,
): string {
    return renderScreen({
        encounter: "test",
        seed: 1,
        state: gameState,
        availability,
        bindings,
        bindingThresholds,
        actionLines: [],
        logLines: [],
    }, width, height);
}

async function runScriptedConsole(
    engine: GameEngine,
    scriptedAnswers: string[],
    initialEvents: GameEvent[] = [],
) {
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

    await runConsoleClient(engine, "plains_1", initialEvents, { input, output });
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

    it("wraps long intention effects beneath the effect column without losing content", () => {
        const lines = formatIntention(longIntention, 59);
        const effectColumn = lines[1].indexOf("latexMist");

        expect(lines.length).toBeGreaterThan(2);
        expect(lines[1]).toContain("ko           CRIT");
        for (const continuation of lines.slice(2)) {
            expect(continuation.slice(0, effectColumn)).toBe(" ".repeat(effectColumn));
            expect(continuation).not.toContain("ko           CRIT");
        }
        for (const effect of ["latexMist", "latexTorso", "latexHead", "latexArms", "latexLegs"] as const) {
            expect(lines.join("\n")).toContain(effect);
        }
        expect(lines.join("\n")).not.toContain("…");

        const rendered = renderState(
            { ...state, enemies: [{ ...state.enemies[0], intention: longIntention }] },
            [{ id: "ko", available: true }],
        );
        expect(rendered).toContain("latexLegs +19");
        expect(rendered).not.toContain("latexTorso,…");
    });

    it("turns action events into readable log lines", () => {
        expect(formatEvents([
            { type: "moveUsed", actor: "ko", move: "telekinesis", targets: [{ target: "foe1", result: "hit" }] },
            { type: "enemyDamaged", target: "foe1", amount: 10 },
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
            + "(Immobilized) (Def -2) (Hit +4)",
        );
    });

    it("groups equal binding effects without merging different operations", () => {
        expect(formatEffects([
            { type: "binding", target: "ko", binding: "latexArms", amount: 10 },
            { type: "binding", target: "ko", binding: "latexLegs", amount: 10 },
            { type: "damage", target: "ko", amount: 10 },
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
            availability: [{ id: "ko", available: true }],
            bindings: ["latexArms"],
            bindingThresholds,
            actionLines: ["[1] telekinesis"],
            logLines: ["Encounter plains_1 began."],
        }, 120, 36);
        const lines = rendered.split("\n");

        expect(lines).toHaveLength(36);
        expect(lines.every((line) => line.length === 120)).toBe(true);
        const divider = lines[2].indexOf("┬");
        const leftWidth = divider - 1;
        const rightWidth = lines[2].length - divider - 2;
        expect(leftWidth / (leftWidth + rightWidth)).toBeCloseTo(2 / 3, 2);
        expect(rendered).toContain("PARTY");
        expect(rendered).toContain("ENEMIES");
        expect(rendered).toContain("ACTIONS / TARGETING");
        expect(rendered).toContain("RECENT LOG");
        expect(rendered).toContain("latexArms");
        expect(rendered).toContain("Intent: latexSpray");
        expect(rendered).toContain("Seed 8224");
        expect(rendered).toContain("skunkette1 [HP: 12/20]");
    });

    it("gives the upper panes five more rows at the normal console height", () => {
        const rendered = renderState(
            state,
            [{ id: "ko", available: true }],
            ["latexArms"],
            180,
            49,
        );
        const middleDivider = rendered.split("\n").findIndex((line) => line.includes("┼"));

        expect(middleDivider - 3).toBe(29);
        expect(middleDivider).toBe(32);
    });

    it("renders encounter-defined binding rows in order with calculated threshold markers", () => {
        const bindingState: GameState = {
            ...state,
            characters: [{
                ...state.characters[0],
                bindings: [
                    { id: "notInEncounter", value: 100, level: "max", data: {}, status: [] },
                    {
                        id: "latexArms",
                        value: 36,
                        level: "hard",
                        data: {},
                        status: [
                            { id: "bound", value: 3 },
                            { id: "immobilized", value: 1 },
                        ],
                    },
                    {
                        id: "latexTorso",
                        value: 23,
                        level: "medium",
                        data: {},
                        status: [{ id: "gagged", value: 2 }],
                    },
                ],
            }],
        };
        const rendered = renderState(
            bindingState,
            [{ id: "ko", available: true }],
            ["latexLegs", "latexArms", "latexTorso"],
        );

        expect(rendered.indexOf("latexLegs")).toBeLessThan(rendered.indexOf("latexArms"));
        expect(rendered.indexOf("latexArms")).toBeLessThan(rendered.indexOf("latexTorso"));
        expect(rendered).toContain("latexLegs   [-+-+-+---+-----+----] 0/100  ---");
        expect(rendered).toContain(
            "latexArms   [#######--+-----+----] 36/100  Hard    [Bound 3] [Immobilized]",
        );
        expect(rendered).toContain(
            "latexTorso  [#####+---+-----+----] 23/100  Medium    [Gagged 2]",
        );
        expect(rendered).not.toContain("notInEncounter");
        expect(rendered).not.toContain("Status:");
    });

    it("shows action state, stance, signed modifiers, and blocked body parts on headers", () => {
        const characters = [
            {
                ...state.characters[0], id: "ready", standing: true, acted: false,
                bindings: [],
                modifiers: {
                    hitarms: -4,
                    hitmouth: -4,
                    hitlegs: -3,
                    hit: 1,
                    defense: -2,
                    escape: 2,
                    effect: 3,
                    potency: 1,
                    traps: -2,
                    willpower: -1,
                    spread: 1,
                },
                blockedMoveTypes: ["arms" as const],
            },
            {
                ...state.characters[0], id: "acted", standing: false, acted: true,
                bindings: [], modifiers: {}, blockedMoveTypes: [],
            },
            {
                ...state.characters[0], id: "skip", standing: true, acted: true,
                bindings: [], modifiers: {}, blockedMoveTypes: [],
            },
            {
                ...state.characters[0], id: "incap", standing: false, acted: true,
                bindings: [], modifiers: {}, blockedMoveTypes: [],
            },
        ];
        const rendered = renderState(
            { ...state, characters },
            [
                { id: "ready", available: true },
                { id: "acted", available: false, reason: "actorAlreadyActed" },
                { id: "skip", available: false, reason: "actorSkipped" },
                { id: "incap", available: false, reason: "actorIncapacitated" },
            ],
            [],
            120,
        );

        for (const token of [
            "[Ready]", "[Standing]", "[Arms: Blk]", "[Mouth: -4]", "[Legs: -3]",
            "[Hit: +1]", "[Def: -2]", "[Esc: +2]", "[Eff: +3]", "[Pot: +1]",
            "[Trap: -2]", "[Will: -1]", "[Spr: +1]",
        ]) {
            expect(rendered).toContain(token);
        }
        expect(rendered).not.toContain("[Arms: -4]");
        const readyHeaderLines = rendered.split("\n")
            .map((line) => line.slice(1, 79).trimEnd())
            .filter((line) => line.includes("ready [") || /^\s+\[/.test(line));
        expect(readyHeaderLines.length).toBeGreaterThan(1);
        expect(readyHeaderLines.every((line) =>
            (line.match(/\[/g) ?? []).length === (line.match(/\]/g) ?? []).length,
        )).toBe(true);
        expect(readyHeaderLines.some((line) => line.includes("…"))).toBe(false);
        expect(rendered).toContain("acted [Acted] [Moving]");
        expect(rendered).toContain("skip [Skip] [Standing]");
        expect(rendered).toContain("incap [Incap] [Moving]");
    });

    it("renders each character buff on its own line", () => {
        const buffState: GameState = {
            ...state,
            characters: [{
                ...state.characters[0],
                bindings: [],
                buffs: [
                    { id: "firstBuff", active: false, duration: 2 },
                    { id: "secondBuff", active: true, modifiers: { defense: -1 } },
                ],
            }],
        };
        const rendered = renderState(buffState, [{ id: "ko", available: true }]);

        expect(rendered).toContain("First Buff (pending) (2 rounds)");
        expect(rendered).toContain("Second Buff (Def -1)");
        expect(rendered.split("\n").some((line) => line.includes("First Buff") && line.includes("Second Buff")))
            .toBe(false);
    });

    it("wraps long buff lists without adding an aggregate status row", () => {
        const longState: GameState = {
            ...state,
            characters: [{
                ...state.characters[0],
                bindings: [],
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
            availability: [{ id: "ko", available: true }],
            bindings: [],
            bindingThresholds,
            actionLines: [],
            logLines: [],
        }, 120, 60);

        expect(rendered).not.toContain("Status:");
        expect(rendered).toContain("Buffs:");
        expect(rendered).toContain("Very Long Buff Name");
        expect(rendered).toContain("(Mouth Hit -3)");
        expect(rendered).toContain("(Def -4)");
        expect(rendered).toContain("(Willpower +2)");
        expect(rendered).not.toContain("…");
    });

    it("formats defined accuracy bands on one line and omits missing bands", () => {
        expect(formatAccuracyRow("foe", { miss: 10, graze: 15, hit: 65, crit: 10 }))
            .toBe("foe — Miss: 10%   Graze: 15%   Hit: 65%   Crit: 10%");
        expect(formatAccuracyRow("No target", { miss: 60, hit: 40 }))
            .toBe("Miss: 60%   Hit: 40%");
    });

    it("automatically ends the turn after the last available character acts", async () => {
        const engine = new GameEngine(encounterList, 8224);
        engine.loadCharacter(ko);
        const events = engine.loadEncounter("plains_1");
        const rendered = await runScriptedConsole(engine, ["1", "1", "1", "3"], events);

        expect(engine.getGameState().turn.round).toBe(2);
        expect(rendered).toContain("skunkette1 — Miss:");
        expect(rendered).not.toMatch(/TARGET\s+MISS\s+GRAZE/);
        expect(rendered).toMatch(/telekinesis on skunkette1: (MISS|GRAZE|HIT|CRIT)/);
        expect(rendered).toContain("No characters available. Ending turn automatically.");
        expect(rendered).toContain("~~~ ROUND 2 ~~~");
        expect(rendered).toContain("Seed 8224");
        expect(rendered).toContain("Escape / assist -- no legal escapes");
        expect(rendered).not.toMatch(/unavailable:/i);
    });

    it("puts a single accuracy preview on the move row", async () => {
        const engine = new GameEngine([oneEnemyEncounter], 8224);
        engine.loadCharacter(ko);
        const events = engine.loadEncounter(oneEnemyEncounter.id);

        const rendered = await runScriptedConsole(engine, ["1", "7", "3"], events);

        expect(rendered).toContain(
            "[1] telekinesis [mouth; 1 enemy]   foe1 — Miss: 10%   Graze: 15%   Hit: 65%   Crit: 10%",
        );
        expect(rendered).toContain(
            "[2] starlight [mouth; no target]   Miss: 10%   Graze: 15%   Hit: 65%   Crit: 10%",
        );
    });

    it("replaces stored bindings when a newer encounter event is received", async () => {
        const engine = new GameEngine(encounterList, 8224);
        engine.loadCharacter(ko);
        engine.loadEncounter("plains_1");
        const events: GameEvent[] = [
            { type: "encounterLoad", id: "old", success: true, bindings: ["oldBinding"] },
            { type: "encounterLoad", id: "new", success: true, bindings: ["latexHead"] },
        ];

        const rendered = await runScriptedConsole(engine, ["3"], events);

        expect(rendered).toContain("latexHead");
        expect(rendered).not.toContain("oldBinding");
    });

    it("shows a fully acted character without assigning it a menu number", async () => {
        const engine = new GameEngine(encounterList, 8224);
        engine.loadCharacter(ko);
        engine.loadCharacter(makeCharacterDef("ally"));
        const events = engine.loadEncounter("plains_1");

        const rendered = await runScriptedConsole(engine, ["1", "1", "1", "4"], events);

        expect(rendered).toContain("[-] ko  -- actorAlreadyActed");
        expect(rendered).toContain("[2] ally  Ready");
        expect(rendered).toContain("[3] End turn");
        expect(rendered).toContain("[4] Quit");
        expect(engine.getGameState().turn.round).toBe(1);
    });

    it("does not number unavailable characters and ignores them for automatic end turn", async () => {
        const helplessBinding = makeBindingDef("helpless-source", {
            easy: [{ definition: helpless, value: 1 }],
        });
        const { engine } = setupBoundEngine(helplessBinding, thresholds.easy);
        const wait = makeMove("player-wait", "mouth", { side: "none", targets: 0 });
        engine.loadCharacter(makeCharacterDef("ally", [wait]));

        const rendered = await runScriptedConsole(engine, ["2", "1", "4"]);

        expect(rendered).toContain("[-] hero  -- actorSkipped");
        expect(rendered).toContain("[2] ally  Ready");
        expect(rendered).toContain("Choose an action for ally.");
        expect(rendered).not.toContain("Choose an action for hero.");
        expect(rendered).toContain("Hit: 100%");
        expect(rendered).not.toContain("No target");
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
