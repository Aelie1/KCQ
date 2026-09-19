import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { runConsoleClient } from "../src/console/client";
import { formatBuff, formatEffect, formatEffects, formatEvents, formatIntention } from "../src/console/format";
import { formatAccuracyRow, renderScreen } from "../src/console/render";
import { ko } from "../src/content/characters/ko";
import { encounterList } from "../src/content/content";
import { latexArms } from "../src/content/skunk/latex";
import type { EncounterDef } from "../src/engine/protected/definitions";
import { thresholds } from "../src/engine/protected/helpers";
import { helpless } from "../src/engine/protected/statuses";
import { GameEngine } from "../src/engine/public/engine";
import type { GameEvent, GameState, Intention } from "../src/engine/public/types";
import {
    makeBindingDef,
    makeCharacterDef,
    makeMove,
    setupBoundEngine,
} from "./helpers";
import { multiEnemyEncounter, oneEnemyEncounter, waitEnemy } from "./testContent";

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
        data: {},
        modifiers: { defense: -2 },
        blockedMoveTypes: []
    }],
    enemies: [{
        id: "skunkette1",
        rank: "enemy",
        currHp: 12,
        maxHp: 20,
        currDef: 0,
        cooldowns: {},
        buffs: [],
        intentions: [{
            move: "latexSpray",
            targets: [{
                target: "ko",
                band: "hit",
                effects: [{ type: "binding", target: "ko", binding: "latexArms", amount: 19 }],
            }],
            effects: [],
        }],
    }],
    traps: [],
    encounter: null
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
            { ...state, enemies: [{ ...state.enemies[0], intentions: [longIntention] }] },
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
            duration: 2,
            linkedEntity: "skunkette1",
            statuses: [{ id: "immobilized", value: 1 }],
            modifiers: { defense: -2, hit: 4 },
        })).toBe(
            "Pounce (2 rounds) (linked: skunkette1) "
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

    it("distinguishes zero binding amounts from unresolved deferred amounts", () => {
        const zero = { type: "binding" as const, target: "ko", binding: "latexArms", amount: 0 };
        const unknown = { type: "binding" as const, target: "ko", binding: "latexLegs" };

        expect(formatEffect(zero, true)).toBe("ko latexArms +0");
        expect(formatEffect(unknown, true)).toBe("ko latexLegs +??");
        expect(formatEffects([zero, unknown], true)).toEqual([
            "ko latexArms +0",
            "ko latexLegs +??",
        ]);
        expect(formatEffects([
            zero,
            { ...zero, binding: "latexTorso" },
            unknown,
            { ...unknown, binding: "latexHead" },
        ], true)).toEqual([
            "ko latexArms, latexTorso +0",
            "ko latexLegs, latexHead +??",
        ]);
    });

    it("formats structured trap-trigger and interruption events", () => {
        expect(formatEvents([
            { type: "trapTriggered", actor: "ko", trap: "trapPuddle", amount: 10 },
            { type: "actionInterrupted", actor: "ko", reason: "bindingRestriction" },
        ])).toEqual([
            "ko triggered 10 trapPuddles.",
            "ko's action was interrupted due to bindingRestriction.",
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
            logLines: Array.from({ length: 11 }, (_, index) => `Log line ${index + 1}`),
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
        expect(rendered).not.toContain("LOG");
        expect(rendered).toContain("Log line 1");
        expect(rendered).toContain("Log line 11");
        expect(rendered).toContain("latexArms");
        expect(rendered).toContain("Intent: latexSpray");
        expect(rendered).toContain("Seed 8224");
        expect(rendered).toContain("skunkette1 [HP: 12/20]");
        expect(rendered).not.toContain("[Def 0]");
    });

    it("renders generic trap meters in the header with exact amounts", () => {
        const rendered = renderState(
            { ...state, traps: [{ id: "trapPuddle", amount: 35 }] },
            [{ id: "ko", available: true }],
            [],
            120,
            36,
        );

        const header = rendered.split("\n")[1];
        expect(header).toContain("KO-CHAN'S QUEST  test");
        expect(header).toContain("Puddles [#######-------------] 35/100");
        expect(rendered.split("\n")).toHaveLength(36);
        expect(rendered.split("\n").every((line) => line.length === 120)).toBe(true);
    });

    it("lays out multiple generic trap meters without breaking the screen", () => {
        const rendered = renderState(
            {
                ...state,
                traps: [
                    { id: "trapPuddle", amount: 35 },
                    { id: "trapRibbon", amount: 10 },
                ],
            },
            [{ id: "ko", available: true }],
            [],
            120,
            36,
        );

        const header = rendered.split("\n")[1];
        expect(header).toContain("KO-CHAN'S QUEST  test");
        expect(header).toContain("Puddles 35/100 | Ribbons 10/100");
        expect(rendered.split("\n")).toHaveLength(36);
        expect(rendered.split("\n").every((line) => line.length === 120)).toBe(true);
    });

    it("puts active enemy cooldowns beside intent and omits zero defense", () => {
        const rendered = renderState({
            ...state,
            enemies: [{
                ...state.enemies[0],
                cooldowns: { pounce: 2, latexSpray: 0, oldMove: -1 },
            }],
        }, [{ id: "ko", available: true }]);

        expect(rendered).toContain("Intent: latexSpray      [Pounce 2]");
        expect(rendered).not.toContain("Cooldowns:");
        expect(rendered).not.toContain("Latex Spray 0");
        expect(rendered).not.toContain("Old Move");
        expect(rendered).not.toContain("[Def 0]");

        const withDefense = renderState({
            ...state,
            enemies: [{ ...state.enemies[0], currDef: 1 }],
        }, [{ id: "ko", available: true }]);
        expect(withDefense).toContain("skunkette1 [HP: 12/20] [Def 1]");
    });

    it("shows bonus escapes only while at least one remains", () => {
        const withBonus = renderState({
            ...state,
            characters: [{ ...state.characters[0], bonusEscapes: 1 }],
        }, [{ id: "ko", available: true }]);

        expect(withBonus).toContain("[Escapes: +1]");
        expect(renderState(state, [{ id: "ko", available: true }]))
            .not.toContain("[Escapes:");
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
        expect(rendered).toContain("latexLegs   [-+-+-+---+-----+----] 0/0  ---");
        expect(rendered).toContain(
            "latexArms   [#######--+-----+----] 36/0  Hard    [Bound 3] [Immobilized]",
        );
        expect(rendered).toContain(
            "latexTorso  [#####+---+-----+----] 23/0  Medium    [Gagged 2]",
        );
        const bindingLines = rendered.split("\n");
        const firstBindingLine = bindingLines.findIndex((line) => line.includes("Bindings:"));
        expect(bindingLines[firstBindingLine]).toContain("Bindings: latexLegs");
        expect(bindingLines[firstBindingLine + 1].indexOf("latexArms"))
            .toBe(bindingLines[firstBindingLine].indexOf("latexLegs"));
        expect(rendered).not.toContain("notInEncounter");
        expect(rendered).not.toContain("Status:");
    });

    it("shows Hinari's Subspace resource between action state and stance", () => {
        const hinariState: GameState = {
            ...state,
            characters: [{
                ...state.characters[0],
                id: "hinari",
                standing: false,
                data: { subspace: 83 },
            }],
        };

        const rendered = renderState(hinariState, [{ id: "hinari", available: true }]);
        const withoutSubspace = renderState({
            ...hinariState,
            characters: [{ ...hinariState.characters[0], data: {} }],
        }, [{ id: "hinari", available: true }]);

        expect(rendered).toContain("hinari [Ready] [Subspace 83/100] [Moving]");
        expect(withoutSubspace).toContain("hinari [Ready] [Subspace 0/100] [Moving]");
    });

    it("renders state on headers and modifiers on a dedicated Mods line", () => {
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
                    vulnerability: 3,
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
            "[Hit: +1]", "[Def: -2]", "[Esc: +2]", "[Vuln: +3]", "[Pot: +1]",
            "[Trap: -2]", "[Will: -1]", "[Spr: +1]",
        ]) {
            expect(rendered).toContain(token);
        }
        expect(rendered).not.toContain("[Arms: -4]");
        const leftPanelLines = rendered.split("\n")
            .map((line) => line.slice(1, 79).trimEnd());
        const readyHeader = leftPanelLines.find((line) => line.includes("ready ["));
        const modsLineIndex = leftPanelLines.findIndex((line) => line.includes("Mods:"));
        const modsLines = leftPanelLines.slice(modsLineIndex, modsLineIndex + 2);
        expect(readyHeader).toBe("ready [Ready] [Standing]");
        expect(modsLines[0]).toContain("  Mods: [Arms: Blk] [Mouth: -4]");
        expect(modsLines[1].indexOf("[")).toBe(modsLines[0].indexOf("["));
        expect(modsLines.every((line) =>
            (line.match(/\[/g) ?? []).length === (line.match(/\]/g) ?? []).length,
        )).toBe(true);
        expect(modsLines.some((line) => line.includes("…"))).toBe(false);
        expect(rendered.match(/Mods:/g)).toHaveLength(1);
        expect(rendered).toContain("acted [Acted] [Moving]");
        expect(rendered).toContain("skip [Skip] [Standing]");
        expect(rendered).toContain("incap [Incap] [Moving]");
    });

    it("renders short character buffs in two columns on the Buffs line", () => {
        const buffState: GameState = {
            ...state,
            characters: [{
                ...state.characters[0],
                bindings: [],
                buffs: [
                    { id: "firstBuff", duration: 2 },
                    { id: "secondBuff", modifiers: { defense: -1 } },
                    { id: "thirdBuff", duration: 1 },
                    { id: "fourthBuff", modifiers: { potency: 2 } },
                ],
            }],
        };
        const rendered = renderState(buffState, [{ id: "ko", available: true }]);

        expect(rendered).toContain("First Buff (2 rounds)");
        expect(rendered).toContain("Second Buff (Def -1)");
        const buffLines = rendered.split("\n");
        const firstRow = buffLines.find((line) => line.includes("First Buff"));
        const secondRow = buffLines.find((line) => line.includes("Third Buff"));
        expect(firstRow).toContain("Buffs: First Buff (2 rounds)");
        expect(firstRow).toContain("Second Buff (Def -1)");
        expect(secondRow).toContain("Fourth Buff (Potency +2)");
        expect(secondRow?.indexOf("Third Buff")).toBe(firstRow?.indexOf("First Buff"));
    });

    it("wraps long buff lists without adding an aggregate status row", () => {
        const longState: GameState = {
            ...state,
            characters: [{
                ...state.characters[0],
                bindings: [],
                buffs: [{
                    id: "veryLongBuffName",
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
        const engine = new GameEngine([oneEnemyEncounter], 2);
        engine.loadCharacter(ko);
        const events = engine.loadEncounter(oneEnemyEncounter.id);

        const rendered = await runScriptedConsole(engine, ["1", "7", "3"], events);

        expect(rendered).toContain(
            "[1] telekinesis [mouth; 1 enemy]   foe1 — Miss: 10%   Graze: 15%   Hit: 65%   Crit: 10%",
        );
        expect(rendered).toContain(
            "[2] starlightBindings [mouth; 1 enemy]   foe1",
        );
    });

    it("omits accuracy from move rows that have a failure reason", async () => {
        const { engine } = setupBoundEngine(latexArms, thresholds.extreme);

        const rendered = await runScriptedConsole(engine, ["1", "7", "3"]);
        const unavailableRow = rendered.split("\n")
            .find((line) => line.includes("[2] arms-move"));

        expect(unavailableRow).toContain("bindingRestriction");
        expect(unavailableRow).not.toContain("Miss:");
        expect(unavailableRow).not.toContain("foe1");
    });

    it("executes a one-target move immediately when only one valid target exists", async () => {
        const engine = new GameEngine([oneEnemyEncounter], 8);
        engine.loadCharacter(ko);
        const events = engine.loadEncounter(oneEnemyEncounter.id);

        const rendered = await runScriptedConsole(engine, ["1", "1", "3"], events);

        expect(rendered).not.toContain("Choose target 1 of 1 for telekinesis.");
        expect(rendered).toMatch(/telekinesis on foe1: (MISS|GRAZE|HIT|CRIT)/);
    });

    it("retains target selection when a one-target move has multiple valid targets", async () => {
        const engine = new GameEngine([multiEnemyEncounter], 8224);
        engine.loadCharacter(ko);
        const events = engine.loadEncounter(multiEnemyEncounter.id);

        const rendered = await runScriptedConsole(engine, ["1", "1", "2", "3"], events);

        expect(rendered).toContain("Choose target 1 of 1 for telekinesis.");
        const targetScreen = rendered.split("\x1b[2J\x1b[H")
            .find((screen) => screen.includes("Choose target 1 of 1 for telekinesis."));
        expect(targetScreen).toBeDefined();
        const firstTargetLines = targetScreen?.split("\n")
            .filter((line) => line.includes("[1] foe1")) ?? [];
        const secondTargetLines = targetScreen?.split("\n")
            .filter((line) => line.includes("[2] attacker1")) ?? [];
        expect(firstTargetLines).toHaveLength(1);
        expect(firstTargetLines[0]).toContain("Miss:");
        expect(secondTargetLines).toHaveLength(1);
        expect(secondTargetLines[0]).toContain("Miss:");
        expect(rendered).toMatch(/telekinesis on attacker1: (MISS|GRAZE|HIT|CRIT)/);
    });

    it("only offers valid entries from a move's published targets", async () => {
        const selectiveMove = makeMove("selective", "mouth", {
            isValid: (_move, target) => target?.id === "attacker1" ? "invalidTarget" : undefined,
        });
        const engine = new GameEngine([multiEnemyEncounter], 1);
        engine.loadCharacter(makeCharacterDef("hero", [selectiveMove]));
        const events = engine.loadEncounter(multiEnemyEncounter.id);

        const rendered = await runScriptedConsole(engine, ["1", "1", "3"], events);

        expect(rendered).not.toContain("Choose target 1 of 1 for selective.");
        expect(rendered).toContain("[1] selective [mouth; 1 enemy]   foe1");
        expect(rendered).not.toContain("selective [mouth; 1 enemy]   attacker1");
        expect(rendered).toContain("selective on foe1: HIT");
    });

    it("allows confirmation of an all-target move with no valid entity targets", async () => {
        const emptyAllMove = makeMove("empty-all", "mouth", {
            targets: "all",
            isValid: () => "invalidTarget",
        });
        const engine = new GameEngine([oneEnemyEncounter], 1);
        engine.loadCharacter(makeCharacterDef("hero", [emptyAllMove]));
        const events = engine.loadEncounter(oneEnemyEncounter.id);

        const rendered = await runScriptedConsole(engine, ["1", "1", "1", "3"], events);

        expect(rendered).toContain("empty-all affects every enemy.");
        expect(rendered).toContain("[1] Confirm");
        expect(rendered).not.toContain("not enough targets for empty-all");
    });

    it("orders escape choices by encounter bindings and keeps unknown bindings last", async () => {
        const first = makeBindingDef("firstBinding");
        const second = makeBindingDef("secondBinding");
        const firstUnknown = makeBindingDef("firstUnknownBinding");
        const secondUnknown = makeBindingDef("secondUnknownBinding");
        const encounter: EncounterDef = {
            id: "escape-order",
            enemies: [waitEnemy],
            bindings: [first, second],
            traps: [],
            setup: (internal) => {
                const character = internal.characters[0];
                return [firstUnknown, second, secondUnknown, first].map((binding) => ({
                    type: "binding" as const,
                    source: character,
                    target: character,
                    binding,
                    amount: 10,
                }));
            },
        };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(makeCharacterDef("hero"));
        const events = engine.loadEncounter(encounter.id);

        const rendered = await runScriptedConsole(
            engine,
            ["1", "1", "5", "4", "3"],
            events,
        );

        const firstIndex = rendered.indexOf("[1] hero - firstBinding");
        const secondIndex = rendered.indexOf("[2] hero - secondBinding");
        const firstUnknownIndex = rendered.indexOf("[3] hero - firstUnknownBinding");
        const secondUnknownIndex = rendered.indexOf("[4] hero - secondUnknownBinding");
        expect(firstIndex).toBeGreaterThanOrEqual(0);
        expect(firstIndex).toBeLessThan(secondIndex);
        expect(secondIndex).toBeLessThan(firstUnknownIndex);
        expect(firstUnknownIndex).toBeLessThan(secondUnknownIndex);
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
        const wait = makeMove("player-wait", "mouth", { targetSide: "none", targets: 0 });
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

    it("stays alive while undersized and resumes normal rendering after resize", async () => {
        const engine = new GameEngine(encounterList, 8224);
        engine.loadCharacter(ko);
        engine.loadEncounter("plains_1");
        const input = new PassThrough();
        const output = Object.assign(new PassThrough(), { columns: 80, rows: 20 });
        let rendered = "";
        output.on("data", (chunk: Buffer) => {
            rendered += chunk.toString();
        });

        let finished = false;
        const client = runConsoleClient(engine, "plains_1", [], { input, output })
            .finally(() => {
                finished = true;
            });
        await new Promise((resolve) => setImmediate(resolve));

        expect(rendered).toContain("Terminal too small: current 80x19; required 120x36.");
        expect(finished).toBe(false);

        output.columns = 180;
        output.rows = 50;
        input.write("invalid\n");
        await new Promise((resolve) => setImmediate(resolve));

        expect(rendered).toContain("PARTY");
        expect(rendered).toContain("Choose a character.");

        input.write("3\n");
        await client;
    });
});
