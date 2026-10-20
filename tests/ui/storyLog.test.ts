import { describe, expect, it } from "vitest";
import type { GameEvent, MoveEvent } from "../../src/engine/public/types";
import { createGameLogEntries, type GameLogPresentationEntry } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createGameLogViewModel } from "../../src/ui/web/app/viewModels/gameLog";
import { createStoryLogViewModel } from "../../src/ui/web/app/viewModels/storyLog";
import { stockStrings } from "../helpers/stockStrings";

const move = (targets: MoveEvent["targets"], id = "telekinesis", effects: MoveEvent["effects"] = []): MoveEvent =>
    ({ type: "useMove", actor: "ko", move: id, targets, effects });
const target = (id: string, result: MoveEvent["targets"][number]["result"]): MoveEvent["targets"][number] => ({ target: id, result, effects: [] });
const render = (events: GameEvent[], strings = stockStrings) => createStoryLogViewModel(createGameLogEntries(events), new Presentation(strings));
const paragraphs = (events: GameEvent[], strings = stockStrings) => render(events, strings).flatMap(entry => entry.paragraphs);

describe("Story Log localization", () => {
    const keys = ["narrative.move.telekinesis.graze.plural", "narrative.move.telekinesis.graze", "narrative.move.telekinesis.hit", "narrative.generic.hit"];
    it.each([0, 1, 2, 3])("selects the first available key at priority %s", priority => {
        const strings = { ...stockStrings };
        keys.forEach((key, index) => { delete strings[key]; if (index >= priority) strings[key] = `priority ${index}: {targets}`; });
        expect(paragraphs([move([target("ko", "graze"), target("matsuko", "graze")])], strings))
            .toEqual([`priority ${priority}: Ko-chan, Matsuko`]);
    });
    it("skips plural for a singular target and substitutes every supported slot", () => {
        expect(paragraphs([move([{ ...target("skunkette1", "hit"), effects: [{ type: "enemyDamaged", target: "skunkette1", amount: 7 }] }])], {
            ...stockStrings, "narrative.move.telekinesis.hit.plural": "wrong plural",
            "narrative.move.telekinesis.hit": "{actor}|{target}|{targets}|{move}|{damage}|{band}",
        })[0]).toBe("Ko-chan|Skunkette 1|Skunkette 1|Telekinesis|7|Hit");
    });
    it.each(["", "...", "   "])("ignores placeholder translations %j", placeholder => {
        expect(paragraphs([move([target("ko", "crit")])], { ...stockStrings,
            "narrative.move.telekinesis.crit": placeholder, "narrative.move.telekinesis.hit": "fallback",
        })).toEqual(["fallback"]);
    });
    it.each(["miss", "graze", "hit", "crit"] as const)("renders %s without confusing misses with hits", band => {
        const text = paragraphs([move([target("ko", band)])]).join(" ");
        expect(text).toContain(band === "miss" ? "attack misses" : "landing an attack");
        expect(text).not.toMatch(/\[narrative\.|\{\w+\}/);
    });
    it("demonstrates actual move IDs, plural, and band fallback", () => {
        expect(paragraphs([move([target("ko", "hit")], "latexMist")])[0]).toContain("catching");
        expect(paragraphs([move([target("ko", "hit"), target("matsuko", "hit")], "latexMist")])[0]).toContain("are caught");
        expect(paragraphs([move([target("ko", "graze")], "latexMist")])[0]).toContain("catching");
        expect(paragraphs([move([target("ko", "crit")], "latexMist")])[0]).toContain("critical strike");
        expect(paragraphs([move([target("ko", "miss")], "latexMist")])[0]).toContain("attack misses");
    });
    it("reuses localized entity names and target-list order", () => {
        expect(paragraphs([move([target("ko", "hit"), target("matsuko", "hit")])], {
            ...stockStrings, "entity.ko.name": "K", "entity.matsuko.name": "M",
            "ui.gameLog.targetList": "{second} / {first}", "narrative.generic.hit": "{targets}",
        })).toEqual(["M / K"]);
    });
});

describe("Story Log semantic grouping and chronology", () => {
    const strings = { ...stockStrings, "narrative.generic.hit": "{band}: {targets}", "narrative.generic.miss": "miss: {targets}" };
    it("groups identical bands across their binding consequences", () => {
        const targets = ["ko", "matsuko"].map(id => ({ ...target(id, "hit"), effects: [{ type: "bondageAdded" as const, target: id, binding: "latexArms", amount: 5 }] }));
        expect(paragraphs([move(targets)], strings)).toEqual([
            "Hit: Ko-chan, Matsuko", "Ko-chan's Skunk Arms bindings change by 5.", "Matsuko's Skunk Arms bindings change by 5.",
        ]);
    });
    it("keeps mixed exact bands separate before category fallback", () => {
        expect(paragraphs([move([target("ko", "graze"), target("matsuko", "hit"), target("hinari", "crit"), target("ko", "miss")])], strings))
            .toEqual(["Graze: Ko-chan", "Hit: Matsuko", "Crit: Hinari", "miss: Ko-chan"]);
    });
    it("retains interleaved repeated hits across save restoration and separate actions", () => {
        const event = move([target("ko", "hit"), target("matsuko", "miss"), target("ko", "crit"), target("hinari", "hit")]);
        const entries = createGameLogEntries([event, event]);
        expect(createStoryLogViewModel(entries, new Presentation(strings)).map(entry => entry.paragraphs)).toEqual([
            ["Hit: Ko-chan", "miss: Matsuko", "Crit: Ko-chan", "Hit: Hinari"],
            ["Hit: Ko-chan", "miss: Matsuko", "Crit: Ko-chan", "Hit: Hinari"],
        ]);
        expect(createStoryLogViewModel(JSON.parse(JSON.stringify(entries)), new Presentation(strings)))
            .toEqual(createStoryLogViewModel(entries, new Presentation(strings)));
    });
    it("preserves repeated identical hits on one target", () => {
        expect(paragraphs([move([target("ko", "hit"), target("ko", "hit"), target("matsuko", "hit")])], strings))
            .toEqual(["Hit: Ko-chan", "Hit: Ko-chan, Matsuko"]);
    });
    it("keeps defeats and spawns between hits", () => {
        expect(paragraphs([move([
            { ...target("skunkette1", "hit"), effects: [{ type: "enemyDefeated", target: "skunkette1" }] },
            { ...target("skunkette1", "miss"), effects: [{ type: "enemySpawned", target: "skunkette1" }] },
            target("skunkette1", "crit"),
        ])], strings)).toEqual(["Hit: Skunkette 1", "Skunkette 1 is defeated.", "miss: Skunkette 1", "Skunkette 1 joins the battle.", "Crit: Skunkette 1"]);
    });
    it("supports older histories and leaves mechanical rendering and source data unchanged", () => {
        const entries = createGameLogEntries([move([target("ko", "hit"), target("ko", "miss")])]);
        for (const outcome of entries[0]!.outcomes) { delete outcome.order; if (outcome.kind === "damage") outcome.hits.forEach(hit => delete hit.order); }
        const saved = JSON.stringify(entries);
        const before = createGameLogViewModel(entries, new Presentation(stockStrings));
        expect(createStoryLogViewModel(entries, new Presentation(strings))[0]!.paragraphs).toEqual(["Hit: Ko-chan", "miss: Ko-chan"]);
        expect(JSON.stringify(entries)).toBe(saved);
        expect(createGameLogViewModel(entries, new Presentation(stockStrings))).toEqual(before);
    });
});

describe("Story Log other events", () => {
    it("preserves phase boundaries, assists, stances, and recurring activations", () => {
        const entries: GameLogPresentationEntry[] = [
            { kind: "escape", actor: "ko", target: "ko", outcomes: [] },
            { kind: "escape", actor: "ko", target: "hinari", outcomes: [] },
            { kind: "stance", changes: [{ kind: "stance", actor: "ko", final: "standing" }], outcomes: [] },
            { kind: "phase", phase: "enemy", round: 3, outcomes: [
                { kind: "bindingTick", target: "ko", binding: "latexArms", outcomes: [{ kind: "character", target: "ko", operation: "incapacitated" }] },
                { kind: "bindingTick", target: "ko", binding: "latexArms", outcomes: [{ kind: "character", target: "ko", operation: "rescued" }] },
            ] },
        ];
        const models = createStoryLogViewModel(entries, new Presentation(stockStrings));
        expect(models[3]!.title).toBe("Round 3 · Enemy Phase");
        expect(models.flatMap(entry => entry.paragraphs)).toEqual([
            "Ko-chan attempts to escape their bindings.", "Ko-chan helps Hinari escape their bindings.", "Ko-chan changes stance to Standing.",
            "The Enemy phase begins.", "Ko-chan's Skunk Arms bindings stir.", "Ko-chan is incapacitated.",
            "Ko-chan's Skunk Arms bindings stir.", "Ko-chan is rescued.",
        ]);
    });
    it("renders unrolled actions and effects without claiming an accuracy result", () => {
        const text = paragraphs([move([target("ko", "none")], "latexMist", [
            { type: "buffAdded", target: "ko", buff: "latexMist" },
            { type: "buffRemoved", target: "matsuko", buff: "latexMist" },
            { type: "enemyHealed", target: "skunkette1", amount: 5 },
        ])]).join(" ");
        expect(text).toContain("Ko-chan uses Latex Mist.");
        expect(text).toContain("Ko-chan gains Latex Mist.");
        expect(text).toContain("Matsuko loses Latex Mist.");
        expect(text).toContain("Skunkette 1 recovers 5 health.");
        expect(text).not.toMatch(/caught|landing|misses/);
    });
    it("suppresses consequences explicitly summarized by transitions", () => {
        const entries = createGameLogEntries([move([], "telekinesis", [
            { type: "buffAdded", target: "ko", buff: "fullySkunked" }, { type: "characterIncapacitated", target: "ko" },
        ])]);
        const text = createStoryLogViewModel(entries, new Presentation(stockStrings))[0]!.paragraphs.join(" ");
        expect(text).toContain("Ko-chan is incapacitated.");
        expect(text).not.toContain("gains");
    });
});

it("provides localized prose for every other semantic outcome family", () => {
    const entries: GameLogPresentationEntry[] = [{ kind: "phase", phase: "player", outcomes: [
        { kind: "binding", target: "ko", binding: "latexArms", change: -4, blocked: 2 },
        { kind: "buff", buff: "latexMist", participants: [{ target: "ko", initial: { present: true }, final: { present: true } }] },
        { kind: "resource", target: "hinari", resource: "subspace", change: -3 },
        { kind: "trap", trap: "trapPuddle", change: 2, triggers: [{ actor: "ko", amount: 1 }] },
        { kind: "enemy", target: "skunkette1", operation: "spawned" },
        { kind: "enemy", target: "skunkette1", operation: "defeated" },
        { kind: "interrupt", actor: "ko", reason: "actorAlreadyActed" },
        { kind: "refresh", target: "ko" },
        { kind: "retarget", target: "skunkette1", destination: "ko" },
        ...(["cancelled", "weakened", "discorded"] as const).map(operation => ({ kind: "intention" as const, target: "skunkette1", move: "telekinesis", operation })),
        { kind: "bonus", target: "ko", amount: 1 },
        { kind: "damage", target: "skunkette1", damage: 4, healing: 3, blocked: 2, hits: [{ result: "none", damage: 4, healing: 3, blocked: 2 }] },
    ] },
    { kind: "encounter", id: "plains_1", success: true, outcomes: [] },
    { kind: "encounter", id: "missing", success: false, outcomes: [] },
    { kind: "character", id: "ko", success: true, outcomes: [] },
    { kind: "character", id: "missing", success: false, outcomes: [] }];
    const models = createStoryLogViewModel(entries, new Presentation(stockStrings));
    const text = models.flatMap(entry => entry.paragraphs).join(" ");
    expect(text).not.toMatch(/\[|\{\w+\}|undefined/);
    for (const phrase of ["change by -4", "resists 2", "effect changes", "changes by -3", "triggers", "joins the battle", "is defeated", "interrupted", "act again", "redirects", "cancelled", "weakened", "backfires", "escape attempts", "takes 4 damage", "recovers 3 health", "blocks 2 damage", "could not be loaded", "ready for battle"]) {
        expect(text).toContain(phrase);
    }
});

it("allows authored action templates for moves without an accuracy roll", () => {
    expect(paragraphs([move([target("ko", "none")])], { ...stockStrings,
        "narrative.move.telekinesis.action": "{actor} prepares {move}.",
        "narrative.move.telekinesis.hit": "Must not use an attack template",
    })).toEqual(["Ko-chan prepares Telekinesis."]);
});
