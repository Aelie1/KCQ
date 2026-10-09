import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { skunk } from "../../src/content/skunk/skunk";
import { trapPuddle } from "../../src/content/skunk/puddles";
import { makeCharacterDef, makeEncounterDef } from "../helpers/helpers";
import { createTestEngine } from "../helpers/testCatalog";
import { rockfall } from "../../src/content/characters/hinari";
import { latexArms, latexHead, latexLegs, latexTorso } from "../../src/content/skunk/latex";
import { latexMist, latexSpray, skunkette } from "../../src/content/skunk/skunkette";
import { isCharacter, isEnemy } from "../../src/engine/protected/helpers";
import { s } from "../../src/engine/protected/status";
import { immobilized } from "../../src/engine/protected/statuses";
import type { Buff, Enemy, EventFrame, GameState, LeafEvent, MoveEvent } from "../../src/engine/public/types";
import { createGameLogEntries, type GameLogPresentationEntry } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { DevApp } from "../../src/ui/web/app/dev/DevApp";
import { gameLogFixture } from "../../src/ui/web/app/fixtures/gameLog";
import { makeFixtureCharacter } from "../../src/ui/web/app/fixtures/publicFixture";
import { GameLogPanel } from "../../src/ui/web/app/panels/GameLogPanel";
import { createGameLogViewModel } from "../../src/ui/web/app/viewModels/gameLog";
import { execute, makeBehavioralCharacter, makeBehavioralEngine, makeBehavioralMove } from "../helpers/behavioralHelpers";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
const enemy = (id: string, buffs: Buff[] = []): Enemy => ({
    id, defId: "skunkette", rank: "enemy", maxHp: 200, currHp: 200, currDef: 0, modifiers: {}, buffs, intentions: [], cooldowns: {},
});
const state = (): GameState => ({
    turn: { round: 4, step: 1, phase: "player", outcome: "ongoing" },
    characters: [makeFixtureCharacter("ko"), makeFixtureCharacter("hinari"), makeFixtureCharacter("matsuko")],
    enemies: [enemy("skunkette1"), enemy("skunkette2")], traps: [],
    encounter: null, difficulty: { id: "standard", playerModifiers: {}, enemyModifiers: {} },
});
const move = (targets: MoveEvent["targets"] = [], effects: LeafEvent[] = [], id = "telekinesis"): MoveEvent => ({
    type: "useMove", actor: "ko", move: id, targets, effects,
});
const damaged = (target: string, amount: number): LeafEvent => ({ type: "enemyDamaged", target, amount });
const renderEntries = (entries: readonly GameLogPresentationEntry[], p = presentation): string =>
    renderToString(() => createComponent(GameLogPanel, { entries, presentation: p, state: state() }));
const text = (html: string): string => html.replace(/<[^>]*>/g, "").replaceAll("&gt;", ">").replaceAll("&amp;", "&").replaceAll("&#39;", "'");
const count = (html: string, kind: string) => (html.match(new RegExp('data-outcome="' + kind + '"', "g")) ?? []).length;

describe("compact graphical Game Log", () => {
    it("renders the actual Latex Puddle roll from execution through localized log output", () => {
        const hero = makeCharacterDef("ko");
        const encounter = makeEncounterDef("puddle-log", {
            enemies: [skunk.id], traps: [{ definition: trapPuddle, amount: 0 }],
        });
        const engine = createTestEngine([encounter], [hero], 16, { enemies: [skunk] });
        engine.loadCharacter(hero.id); engine.loadEncounter(encounter.id);
        const before = engine.getGameState();
        const projected = before.enemies[0]!.intentions[0]!.effects.find(effect => effect.type === "trap");
        const result = execute(engine, { type: "endTurn" });
        const frame = result.frames.find(frame => frame.event.type === "useMove" && frame.event.move === "latexPuddle")!;
        expect(frame.event).toMatchObject({ type: "useMove", targets: [], band: "graze",
            effects: [{ type: "trapAdded", amount: projected?.amount }] });
        const saved = JSON.stringify(result.frames);
        const entries = createGameLogEntries(result.frames, before).filter(entry => entry.kind === "move" && entry.move === "latexPuddle");
        const translated = new Presentation({ ...stockStrings, "hitBand.graze.name": "Effleure" });
        const html = renderEntries(entries, translated);
        expect(text(html)).toContain("Skunk 1—Latex PuddleEffleure");
        expect(html).toContain("kcq-game-log__value--graze");
        expect(JSON.stringify(result.frames)).toBe(saved);
    });
    it.each(["miss", "graze", "hit", "crit"] as const)("retains the recorded %s band for zero-target moves", band => {
        const entries = createGameLogEntries([{ ...move([], [{ type: "trapAdded", actor: "skunk1", trap: "trapPuddle", amount: 16 }], "latexPuddle"), band }]);
        expect(entries[0]).toMatchObject({ kind: "move", band });
        expect(createGameLogViewModel(entries, presentation)[0]!.band).toEqual({ text: presentation.hitBand(band), tone: band });
        const html = renderEntries(entries);
        expect(html).toContain("kcq-game-log__value--" + band);
        expect(text(html)).toContain(presentation.move("latexPuddle") + presentation.hitBand(band));
        expect(count(html, "trap")).toBe(1);
        expect(count(html, "damage")).toBe(0);
    });
    it("never invents an accuracy band for zero-target events without one", () => {
        const entries = createGameLogEntries([move([], [], "callReinforcements")]);
        expect(createGameLogViewModel(entries, presentation)[0]!.band).toBeUndefined();
    });
    it("omits trap trigger quantities with numeric endpoints but keeps amounts when endpoints are missing", () => {
        const event = move([], [{ type: "trapTriggered", actor: "matsuko", trap: "trapPuddle", amount: 16 }]);
        const before = state(); before.traps = [{ id: "trapPuddle", amount: 16 }];
        const after = state();
        const known = text(renderEntries(createGameLogEntries([{ event, state: after }], before)));
        expect(known).toContain("Latex Puddle16 → 0Triggered by Matsuko");
        expect(known).not.toContain("×16");
        const unknown = text(renderEntries(createGameLogEntries([event])));
        expect(unknown).toContain("Triggered by Matsuko ×16");
        expect(text(renderEntries(createGameLogEntries([event], before)))).toContain("Triggered by Matsuko ×16");
        const partial = createGameLogEntries([event]);
        const trap = partial[0]!.outcomes[0]!;
        if (trap.kind !== "trap") throw new Error("Expected trap outcome");
        trap.final = 0;
        expect(text(renderEntries(partial))).toContain("Triggered by Matsuko ×16");
        const translated = new Presentation({ ...stockStrings, "ui.gameLog.trapTriggeredActor": "Activation: {actor}" });
        expect(text(renderEntries(createGameLogEntries([{ event, state: after }], before), translated))).toContain("Activation: Matsuko");
    });
    it("renders localized fixture entries in chronological event order", () => {
        const html = renderToString(() => createComponent(GameLogPanel, gameLogFixture));
        const body = text(html);
        expect(body.indexOf("Escape")).toBeLessThan(body.indexOf("Telekinesis"));
        expect(body.indexOf("Telekinesis")).toBeLessThan(body.indexOf("Rockfall"));
        expect(body.indexOf("Rockfall")).toBeLessThan(body.indexOf("Immolation"));
        expect(body.indexOf("Immolation")).toBeLessThan(body.indexOf("Round 4 · Enemy Phase"));
        expect(body.indexOf("Round 4 · Enemy Phase")).toBeLessThan(body.indexOf("Skunkette 1—Latex Spray"));
        expect(body.indexOf("Latex Spray")).toBeLessThan(body.indexOf("Round 5 · Player Phase"));
        expect(html).toContain('aria-label="Chronological game events"');
        expect(body).not.toMatch(/latexArms|latexTorso|telekinesis|tried to|took .* damage/);
        expect(body).not.toContain("[");
        expect(html).not.toContain("title=");
    });

    it("keeps single hits and horizontal multi-hit results within one move and target row", () => {
        const html = renderEntries(createGameLogEntries([
            move([{ target: "skunkette1", result: "hit", effects: [damaged("skunkette1", 18)] }]),
            move([
                { target: "skunkette1", result: "miss", effects: [] },
                { target: "skunkette1", result: "graze", effects: [damaged("skunkette1", 3)] },
                { target: "skunkette1", result: "hit", effects: [damaged("skunkette1", 8)] },
                { target: "skunkette1", result: "crit", effects: [damaged("skunkette1", 16)] },
            ], [], "rockfall"),
        ]));
        expect(count(html, "damage")).toBe(2);
        expect(html.match(/data-kind="move"/g)).toHaveLength(2);
        for (const hit of ["Hit 18", "Miss", "Graze 3", "Hit 8", "Crit 16"]) expect(text(html)).toContain(hit);
        expect(html).toContain("kcq-game-log__value--crit");
        expect(text(html).match(/Rockfall/g)).toHaveLength(1);
        expect(text(html).match(/Skunkette 1/g)).toHaveLength(2);
    });

    it("distinguishes AoE targets and preserves healing and blocked damage", () => {
        const html = renderEntries(createGameLogEntries([move([
            { target: "skunkette1", result: "graze", effects: [damaged("skunkette1", 6), { type: "damageBlocked", target: "skunkette1", amount: 4 }] },
            { target: "skunkette2", result: "crit", effects: [damaged("skunkette2", 24)] },
        ], [{ type: "enemyHealed", target: "skunkette2", amount: 5 }], "immolation")]));
        expect(count(html, "damage")).toBe(2);
        expect(text(html)).toContain("Skunkette 1Graze 6Blocked 4");
        expect(text(html)).toContain("Skunkette 2Crit 24Heal 5");
        expect(text(html).match(/Immolation/g)).toHaveLength(1);
    });

    it("shows one binding change with recorded amount and severity endpoints", () => {
        const before = state();
        before.characters[0]!.bindings = [{ id: "latexArms", value: 10, level: "light", data: {}, status: [], tickEffects: [] }];
        const after = structuredClone(before);
        after.characters[0]!.bindings[0]!.value = 28;
        after.characters[0]!.bindings[0]!.level = "moderate";
        const html = renderEntries(createGameLogEntries([{
            state: after, event: move([], [
                { type: "bondageChanged", target: "ko", binding: "latexArms", amount: 23 },
                { type: "bondageChanged", target: "ko", binding: "latexArms", amount: -5 },
                { type: "bondageBlocked", target: "ko", binding: "latexArms", amount: 4 },
            ])
        }], before));
        expect(count(html, "binding")).toBe(1);
        expect(text(html)).toContain("Ko-chanSkunk Arms 10 (Light) → 28 (Moderate)Blocked 4");
        expect(html).toContain("kcq-game-log__value--binding-moderate");
    });

    it("renders buff additions, removals, and severity-only transitions without payload details", () => {
        const before = state();
        before.characters[0]!.buffs = [{ id: "burnout", severity: 4 }, { id: "pounce", severity: 2 }];
        const after = structuredClone(before);
        after.characters[0]!.buffs = [{ id: "burnout", severity: 1 }, { id: "brace", severity: 3, modifiers: { defense: 99 } }];
        const html = renderEntries(createGameLogEntries([{
            state: after, event: move([], [
                { type: "buffUpdated", target: "ko", buff: "burnout" },
                { type: "buffRemoved", target: "ko", buff: "pounce" },
                { type: "buffAdded", target: "ko", buff: "brace" },
            ])
        }], before));
        expect(count(html, "buff")).toBe(3);
        expect(text(html)).toContain("Burnout IV → I");
        expect(text(html)).toContain("Pounce II Removed");
        expect(text(html)).toContain("Brace III Added");
        expect(text(html)).not.toMatch(/99|Defense|modifier|status/);
    });

    it("renders a reciprocal linked Pounce once, with a single shared severity transition", () => {
        const html = renderToString(() => createComponent(GameLogPanel, gameLogFixture));
        const rows = html.match(/<div[^>]+data-outcome="buff"[\s\S]*?(?=<\/article>)/g) ?? [];
        expect(rows.filter(row => text(row).includes("Pounce"))).toHaveLength(1);
        expect(text(html)).toContain("Ko-chan ↔ Skunkette 1Pounce IV → I");
        expect(text(html).match(/IV → I/g)).toHaveLength(1);
    });

    it("keeps distinct linked participant severities in one logical outcome", () => {
        const entries: GameLogPresentationEntry[] = [{
            kind: "move", actor: "ko", move: "telekinesis", outcomes: [{
                kind: "buff", buff: "pounce", participants: [
                    { target: "ko", initial: { present: true, details: { id: "pounce", severity: 4 } }, final: { present: true, details: { id: "pounce", severity: 1 } } },
                    { target: "skunkette1", initial: { present: true, details: { id: "pounce", severity: 3 } }, final: { present: true, details: { id: "pounce", severity: 2 } } },
                ],
            }]
        }];
        const html = renderEntries(entries);
        expect(count(html, "buff")).toBe(1);
        expect(text(html)).toContain("Ko-chan: Pounce IV → I");
        expect(text(html)).toContain("Skunkette 1: Pounce III → II");
    });

    it("shows resource endpoints without a redundant applied delta", () => {
        const before = state();
        before.characters[1]!.data = { subspace: 50, subspaceMax: 100, secret: 123 };
        const after = structuredClone(before);
        after.characters[1]!.data = { subspace: 20, subspaceMax: 100, secret: 456 };
        const html = renderEntries(createGameLogEntries([{
            state: after, event: move([], [
                { type: "dataChanged", target: "hinari", name: "subspace", amount: -25 },
            ])
        }], before));
        expect(count(html, "resource")).toBe(1);
        expect(text(html)).toContain("HinariSubspace50 → 20");
        expect(text(html)).not.toMatch(/secret|123|456|-30|-25/);
        const silent = renderEntries(createGameLogEntries([{ state: after, event: move() }], before));
        expect(count(silent, "resource")).toBe(0);
    });

    it("renders actual deterministic escape outcomes and names the assisted target", () => {
        const html = renderEntries(createGameLogEntries([{
            type: "useEscape", actor: "hinari", target: "ko", effects: [
                { type: "bondageRemoved", target: "ko", binding: "latexArms", amount: -12 },
            ],
        }]));
        expect(text(html)).toContain("Hinari—Escape→ Ko-chan");
        expect(text(html)).toContain("Ko-chanSkunk Arms 12 → 0 (None)");
        expect(text(html)).not.toMatch(/fail|accuracy|chance|attempt|Miss/);
    });

    it("renders phase separators and Pass 1 stance aggregation once", () => {
        const before = state();
        const after = structuredClone(before);
        after.characters[0]!.standing = true;
        const afterSecond = structuredClone(after);
        afterSecond.characters[1]!.standing = true;
        afterSecond.turn.phase = "enemy";
        const events: EventFrame[] = [
            { state: after, event: { type: "changeStance", actor: "ko", effects: [{ type: "stanceSet", actor: "ko", stance: "standing" }] } },
            { state: afterSecond, event: { type: "changeStance", actor: "hinari", effects: [{ type: "stanceSet", actor: "hinari", stance: "standing" }] } },
            { state: afterSecond, event: { type: "changePhase", phase: "enemy", effects: [] } },
        ];
        const html = renderEntries(createGameLogEntries(events, before));
        expect(html.match(/data-kind="stance"/g)).toHaveLength(1);
        expect(count(html, "stance")).toBe(2);
        expect(html).toContain("kcq-game-log__entry--phase");
        expect(text(html)).toContain("Round 4 · Enemy Phase");
        expect(text(html)).toContain("Ko-chanMoving → Standing");
    });

    it("renders trap, intention, interruption, retarget, refresh, and enemy outcomes", () => {
        const before = state();
        before.traps = [{ id: "trapPuddle", amount: 10 }];
        const after = structuredClone(before);
        after.traps[0]!.amount = 5;
        const html = renderEntries(createGameLogEntries([{
            state: after, event: move([], [
                { type: "trapTriggered", actor: "ko", trap: "trapPuddle", amount: 3 },
                { type: "trapRemoved", actor: "hinari", trap: "trapPuddle", amount: 2 },
                { type: "intentionCancelled", target: "skunkette1", move: "pounce" },
                { type: "intentionWeakened", target: "skunkette2", move: "latexMist" },
                { type: "targetChanged", target: "skunkette1", destination: "matsuko" },
                { type: "actionInterrupted", actor: "ko", reason: "bindingRestriction" },
                { type: "actionRefreshed", target: "hinari" },
                { type: "enemySpawned", target: "skunkette3" },
                { type: "enemyDefeated", target: "skunkette2" },
                { type: "stanceSet", actor: "ko", stance: "standing" },
            ])
        }], before));
        expect(count(html, "trap")).toBe(1);
        for (const label of ["Latex Puddle10 → 5", "Triggered by Ko-chan", "Pounce Cancelled", "Latex Mist Weakened", "Retargeted → Matsuko",
            "Interrupted · Bindings prevent this action.", "HinariAction Refreshed", "Skunkette 3Spawned", "Skunkette 2Defeated", "Moving → Standing"]) expect(text(html)).toContain(label);
    });

    it("shows only meaningful encounter and character entries supplied by Pass 1", () => {
        const html = renderEntries(createGameLogEntries([
            { type: "loadCharacter", id: "ko", success: true, effects: [] },
            { type: "loadEncounter", id: "plains_1", success: true, bindings: [], effects: [{ type: "enemySpawned", target: "skunkette1" }] },
            { type: "loadCharacter", id: "hinari", success: true, effects: [{ type: "actionRefreshed", target: "hinari" }] },
        ]));
        expect(html.match(/data-kind="encounter"/g)).toHaveLength(1);
        expect(html.match(/data-kind="character"/g)).toHaveLength(1);
        expect(text(html)).toContain(presentation.encounter("plains_1"));
        expect(text(html)).toContain("Hinari joins the party.");
        expect(text(html)).not.toContain("Ko-chan joins");
    });

    it("handles missing snapshots and optional buff/resource/binding endpoints", () => {
        const html = renderEntries(createGameLogEntries([
            move([], [
                { type: "buffAdded", target: "ko", buff: "brace" },
                { type: "buffUpdated", target: "hinari", buff: "pounce" },
                { type: "buffRemoved", target: "matsuko", buff: "burnout" },
                { type: "bondageChanged", target: "ko", binding: "latexArms", amount: 7 },
                { type: "dataChanged", target: "hinari", name: "subspace", amount: 10 },
            ]),
            { type: "changePhase", phase: "enemy", effects: [] },
        ]));
        for (const label of ["Brace Added", "Pounce Refreshed", "Burnout Removed", "Skunk Arms +7", "Subspace+10", "Enemy Phase"]) expect(text(html)).toContain(label);
        expect(text(html)).not.toMatch(/undefined|NaN|Round undefined|\[buff.severity/);
    });

    it("preserves known partial endpoints and describes same-severity buff updates", () => {
        const before = state();
        before.characters[0]!.buffs = [{ id: "pounce", severity: 4 }];
        const html = renderEntries(createGameLogEntries([{
            state: before, event: move([], [
                { type: "buffUpdated", target: "ko", buff: "pounce" },
            ])
        }], before));
        expect(text(html)).toContain("Pounce IV Refreshed");
        expect(text(html)).not.toContain("IV → IV");

        const after = state();
        after.characters[1]!.data.subspace = 25;
        after.characters[0]!.buffs = [{ id: "pounce", severity: 1 }];
        const partial = renderEntries(createGameLogEntries([{
            state: after, event: move([], [
                { type: "dataChanged", target: "hinari", name: "subspace", amount: 5 },
                { type: "buffUpdated", target: "ko", buff: "pounce" },
            ])
        }]));
        expect(text(partial)).toContain("Subspace+5");
        expect(text(partial)).toContain("Pounce I Refreshed");
        expect(text(partial)).not.toContain("20 → 25");
    });

    it("localizes names, severity, outcomes, transitions, accessibility, and empty state", () => {
        const p = new Presentation({
            ...stockStrings,
            "entity.ko.name": "Actor test", "entity.skunkette.name": "Target {index}",
            "move.telekinesis.name": "Move test", "binding.latexArms.name": "Binding test",
            "buff.pounce.name": "Buff test", "data.subspace.name": "Resource test",
            "buff.severity.4": "Level four", "buff.severity.1": "Level one",
            "ui.gameLog.transition": "{initial} becomes {final}", "hitBand.hit.name": "Result test",
            "ui.gameLog.chronological": "History test", "ui.gameLog.empty": "Empty test",
            "ui.gameLog.added": "Addition test",
        });
        const before = state();
        before.characters[0]!.buffs = [{ id: "pounce", severity: 4 }];
        const after = structuredClone(before);
        after.characters[0]!.buffs[0]!.severity = 1;
        const html = renderEntries(createGameLogEntries([{
            state: after, event: move([
                { target: "skunkette1", result: "hit", effects: [damaged("skunkette1", 18)] },
            ], [
                { type: "buffUpdated", target: "ko", buff: "pounce" },
                { type: "bondageChanged", target: "ko", binding: "latexArms", amount: 2 },
                { type: "dataChanged", target: "ko", name: "subspace", amount: 3 },
            ])
        }], before), p);
        for (const label of ["Actor test", "Target 1", "Move test", "Result test 18", "Binding test", "Buff test Level four becomes Level one", "Resource test+3"]) expect(text(html)).toContain(label);
        expect(html).toContain('aria-label="History test"');
        expect(text(renderEntries([], p))).toContain("Empty test");
    });

    it("uses the production panel for the screenshot review entry", () => {
        const html = renderToString(() => createComponent(DevApp, { initialPanel: "log" as const }));
        expect(html).toMatch(/class="[^"]*\bkcq-game-log\b[^"]*"/);
        expect(html).toContain("kcq-combat-header--subscreen");
        expect(html).not.toContain("kcq-combat-header__settings");
        expect(text(html)).toContain("Pounce IV → I");
        expect(html).not.toContain("Gallery placeholder");
    });
});


const models = (entries: readonly GameLogPresentationEntry[], p = presentation, party = state().characters.map(character => character.id)) =>
    createGameLogViewModel(entries, p, party);
const mistFrames = (ids: string[], severities: number[] = ids.map(() => 3)) => {
    const before = state();
    const after = structuredClone(before);
    const effects: LeafEvent[] = [];
    for (const [index, id] of ids.entries()) {
        const character = after.characters.find(character => character.id === id)!;
        character.buffs = [{ id: "latexMist", severity: severities[index]! }];
        character.bindings = [{ id: "latexLegs", value: 13, level: "light", data: {}, status: [], tickEffects: [] }];
        effects.push({ type: "buffAdded", target: id, buff: "latexMist" },
            { type: "bondageChanged", target: id, binding: "latexLegs", amount: 13 });
    }
    return { before, after, event: { ...move(ids.map(target => ({ target, result: "graze", effects: [] })), effects, "latexMist"), actor: "skunkette1" } as MoveEvent };
};

describe("Game Log presentation refinements", () => {
    it("combines a single Pounce hit and its reciprocal buff into one target row using snapshot presence", () => {
        const before = state();
        const after = structuredClone(before);
        after.enemies[0]!.buffs = [{ id: "pounce", severity: 3, linkedEntity: "hinari" }];
        after.characters[1]!.buffs = [{ id: "pounce", severity: 3, linkedEntity: "skunkette1" }];
        const entries = createGameLogEntries([{
            state: after, event: {
                ...move([
                    { target: "hinari", result: "hit", effects: [{ type: "buffAdded", target: "hinari", buff: "pounce" }] },
                ], [{ type: "buffAdded", target: "skunkette1", buff: "pounce" }], "pounce"), actor: "skunkette1"
            }
        }], before);
        const rows = models(entries)[0]!.rows;
        expect(rows).toHaveLength(1);
        expect(rows[0]!.target).toBe("Hinari");
        expect(rows[0]!.values.map(value => value.text)).toEqual(["Hit", "Pounce III Added"]);
        const html = renderEntries(entries);
        expect(text(html).match(/Pounce III Added/g)).toHaveLength(1);
        expect(count(html, "buff")).toBe(0);
        expect(html).toContain('class="kcq-game-log__value--entity-hinari"');
        expect(html).toContain('class="kcq-game-log__value--success">Added');
    });

    it("shows binding accuracy inline and colors initial, arrow, and final independently", () => {
        const { before, after } = mistFrames(["ko"]);
        const entries = createGameLogEntries([{
            state: after, event: {
                ...move([
                    { target: "ko", result: "graze", effects: [{ type: "bondageChanged", target: "ko", binding: "latexLegs", amount: 13 }] },
                ], [], "latexSpray"), actor: "skunkette1"
            }
        }], before);
        const rows = models(entries)[0]!.rows;
        expect(rows).toHaveLength(1);
        expect(rows[0]!.values.map(value => value.text)).toEqual(["Graze", "Skunk Legs 0 (None) → 13 (Light)"]);
        const html = renderEntries(entries);
        expect(html).toContain('class="kcq-game-log__value--binding-none">0 (None)');
        expect(html).toContain('class="kcq-game-log__value--muted"> → ');
        expect(html).toContain('class="kcq-game-log__value--binding-light">13 (Light)');
        expect(html).toContain('class="kcq-game-log__value--entity-ko">Ko-chan');
        expect(count(html, "binding")).toBe(0);
    });

    it("keeps endpoint colors correct for reductions and removals", () => {
        const { after: before } = mistFrames(["ko"]);
        before.characters[0]!.bindings[0]!.value = 40;
        before.characters[0]!.bindings[0]!.level = "heavy";
        const after = structuredClone(before);
        after.characters[0]!.bindings = [];
        const html = renderEntries(createGameLogEntries([{
            state: after, event: move([], [
                { type: "bondageRemoved", target: "ko", binding: "latexLegs", amount: -40 },
            ])
        }], before));
        expect(html).toContain('class="kcq-game-log__value--binding-heavy">40 (Heavy)');
        expect(html).toContain('class="kcq-game-log__value--binding-none">0 (None)');
    });

    it("consolidates nonadjacent Latex Mist applications across the whole event while retaining target-specific bindings", () => {
        const { before, after, event } = mistFrames(["ko", "matsuko", "hinari"]);
        const entries = createGameLogEntries([{ state: after, event }], before);
        const saved = JSON.stringify(entries);
        const rows = models(entries)[0]!.rows;
        const buffs = rows.filter(row => row.kind === "buff");
        expect(buffs).toHaveLength(1);
        expect(buffs[0]!.target).toBe("All Allies");
        expect(buffs[0]!.values.map(value => value.text)).toEqual(["Latex Mist III Added"]);
        expect(rows.filter(row => row.kind === "damage").map(row => [row.target, ...row.values.map(value => value.text)]))
            .toEqual(["Ko-chan", "Matsuko", "Hinari"].map(target => [target, "Graze", "Skunk Legs 0 (None) → 13 (Light)"]));
        expect(count(renderEntries(entries), "buff")).toBe(1);
        expect(JSON.stringify(entries)).toBe(saved);
    });

    it("uses colored character names for a partial party and the supplied current party for All Allies", () => {
        const { before, after, event } = mistFrames(["ko", "matsuko"]);
        const entries = createGameLogEntries([{ state: after, event }], before);
        const buff = models(entries)[0]!.rows.find(row => row.kind === "buff")!;
        expect(buff.target).toBe("Ko-chan, Matsuko");
        expect(buff.targetParts).toContainEqual({ text: "Ko-chan", tone: "entity-ko" });
        expect(buff.targetParts).toContainEqual({ text: "Matsuko", tone: "entity-matsuko" });
        expect(models(entries, presentation, ["ko", "matsuko"])[0]!.rows.find(row => row.kind === "buff")!.target).toBe("All Allies");
    });

    it("keeps different severities and operations separate and never groups across events", () => {
        const { before, after, event } = mistFrames(["ko", "matsuko", "hinari"], [3, 3, 2]);
        before.characters.find(character => character.id === "hinari")!.buffs = [{ id: "latexMist", severity: 2 }];
        event.targets = [];
        const entries = createGameLogEntries([{ state: after, event }, { state: after, event }], before);
        const first = models(entries)[0]!.rows.filter(row => row.kind === "buff");
        expect(first).toHaveLength(2);
        expect(first.map(row => row.target)).toEqual(["Ko-chan, Matsuko", "Hinari"]);
        expect(first.map(row => row.values[0]!.text)).toEqual(["Latex Mist III Added", "Latex Mist II Refreshed"]);
        expect(models(entries)).toHaveLength(2);
        expect(models(entries)[1]!.rows.filter(row => row.kind === "buff")).toHaveLength(2);
    });

    it("keeps distinct initial-to-final severity transitions separate", () => {
        const { before, after, event } = mistFrames(["ko", "matsuko"]);
        before.characters[0]!.buffs = [{ id: "latexMist", severity: 4 }];
        before.characters.find(character => character.id === "matsuko")!.buffs = [{ id: "latexMist", severity: 2 }];
        event.targets = [];
        const rows = models(createGameLogEntries([{ state: after, event }], before))[0]!.rows.filter(row => row.kind === "buff");
        expect(rows.map(row => row.values[0]!.text)).toEqual(["Latex Mist IV → III", "Latex Mist II → III"]);
    });

    it("preserves multi-hit ambiguity and AoE targets while totaling only recorded damage", () => {
        const entries = createGameLogEntries([move([
            ...[10, 3, 3, 10].map((amount, index) => ({
                target: "skunkette1", result: index === 1 || index === 2 ? "graze" as const : "hit" as const,
                effects: [damaged("skunkette1", amount)]
            })),
            { target: "skunkette2", result: "hit", effects: [damaged("skunkette2", 9)] },
        ], [{ type: "buffRemoved", target: "skunkette1", buff: "pounce" }], "rockfall")]);
        const rows = models(entries)[0]!.rows;
        expect(rows.filter(row => row.kind === "damage").map(row => row.values.map(value => value.text)))
            .toEqual([["Hit 10", "Graze 3", "Graze 3", "Hit 10", "= 26"], ["Hit 9"]]);
        expect(rows.find(row => row.kind === "buff")!.values[0]!.text).toBe("Pounce Removed");
        expect(renderEntries(entries)).toContain("kcq-game-log__value--total");
        const noDamage = models(createGameLogEntries([move([
            { target: "ko", result: "hit", effects: [] }, { target: "ko", result: "graze", effects: [] },
        ], [{ type: "bondageChanged", target: "ko", binding: "latexLegs", amount: 3 }])]))[0]!.rows;
        expect(noDamage.map(row => row.kind)).toEqual(["damage"]);
        expect(noDamage[0]!.values.map(value => value.text)).toEqual(["Hit", "Graze", "Skunk Legs +3"]);
        expect(noDamage.flatMap(row => row.values).some(value => value.tone === "total")).toBe(false);
    });

    it("shows linked removals once with initial severity attached to the buff name", () => {
        const before = state();
        before.characters[0]!.buffs = [{ id: "pounce", severity: 3, linkedEntity: "skunkette1" }];
        before.enemies[0]!.buffs = [{ id: "pounce", severity: 3, linkedEntity: "ko" }];
        const after = structuredClone(before);
        after.characters[0]!.buffs = [];
        after.enemies[0]!.buffs = [];
        const entries = createGameLogEntries([{
            state: after, event: move([], [
                { type: "buffRemoved", target: "ko", buff: "pounce" }, { type: "buffRemoved", target: "skunkette1", buff: "pounce" },
            ], "rockfall")
        }], before);
        const rows = models(entries)[0]!.rows;
        expect(rows).toHaveLength(1);
        expect(rows[0]!.target).toBe("Ko-chan ↔ Skunkette 1");
        expect(rows[0]!.values[0]!.text).toBe("Pounce III Removed");
    });

    it("shows Subspace endpoints once, actual fallback deltas, Action Refreshed, and restrained enemy defeat emphasis", () => {
        const entries: GameLogPresentationEntry[] = [{
            kind: "move", actor: "hinari", move: "rockfall", outcomes: [
                { kind: "resource", target: "hinari", resource: "subspace", initial: 0, final: 25, change: 25 },
                { kind: "resource", target: "hinari", resource: "subspace", final: 10, change: -15 },
                { kind: "refresh", target: "ko" }, { kind: "enemy", target: "skunkette1", operation: "defeated" },
                { kind: "enemy", target: "skunkette2", operation: "spawned" },
            ]
        }];
        const rows = models(entries)[0]!.rows;
        expect(rows[0]!.values).toEqual([{ text: "0 → 25", tone: "success" }]);
        expect(rows[1]!.values).toEqual([{ text: "-15", tone: "warning" }]);
        expect(rows[2]!.values[0]!.text).toBe("Action Refreshed");
        expect(rows[3]!.emphasis).toBe("defeat");
        expect(rows[4]!.emphasis).toBeUndefined();
        const html = renderEntries(entries);
        expect(html).toContain("kcq-game-log__row--defeat");
        expect(html).toContain('class="kcq-game-log__value--entity-neutral">Skunkette 1');
        expect(text(html)).not.toContain("+25");
    });

    it("localizes complete buff and binding phrases with reordered colored slots, target lists, totals, and refreshes", () => {
        const p = new Presentation({
            ...stockStrings,
            "ui.gameLog.allies": "Party test", "ui.gameLog.targetList": "{second} / {first}",
            "buff.severity.text": "{severity} of {name}", "ui.gameLog.buffOutcome": "{operation}: {buff}",
            "ui.gameLog.added": "Added test", "buff.severity.3": "Third test",
            "ui.gameLog.bindingOutcome": "{value} in {binding}", "ui.gameLog.transition": "{final} after {initial}",
            "ui.gameLog.refreshed": "Action test", "ui.gameLog.damageTotal": "Total test {amount}",
        });
        const { before, after, event } = mistFrames(["ko", "matsuko", "hinari"]);
        const entries = createGameLogEntries([{ state: after, event }], before);
        const html = renderEntries(entries, p);
        expect(text(html)).toContain("Party testAdded test: Third test of Latex Mist");
        expect(text(html)).toContain("13 (Light) after 0 (None) in Skunk Legs");
        expect(html).toContain('class="kcq-game-log__value--success">Added test');
        expect(html).toContain('class="kcq-game-log__value--binding-none">0 (None)');
        expect(models(entries, p, ["ko", "hinari"])[0]!.rows.find(row => row.kind === "buff")!.target).toBe("Hinari / Matsuko / Ko-chan");
        const other = renderEntries(createGameLogEntries([move([
            { target: "skunkette1", result: "hit", effects: [damaged("skunkette1", 4)] },
            { target: "skunkette1", result: "graze", effects: [damaged("skunkette1", 2)] },
        ], [{ type: "actionRefreshed", target: "ko" }])]), p);
        expect(text(other)).toContain("Total test 6");
        expect(text(other)).toContain("Ko-chanAction test");
    });

    it("combines multiple unambiguous outcomes but keeps linked outcomes separate when both participants have hits", () => {
        const { before, after, event } = mistFrames(["ko"]);
        const rows = models(createGameLogEntries([{ state: after, event }], before))[0]!.rows;
        expect(rows).toHaveLength(1);
        expect(rows[0]!.values.map(value => value.text)).toEqual(["Graze", "Latex Mist III Added", "Skunk Legs 0 (None) → 13 (Light)"]);
        const entries: GameLogPresentationEntry[] = [{
            kind: "move", actor: "skunkette1", move: "pounce", outcomes: [
                ...["ko", "skunkette1"].map(target => ({
                    kind: "damage" as const, target,
                    hits: [{ result: "hit" as const, damage: 0, healing: 0, blocked: 0 }], damage: 0, healing: 0, blocked: 0
                })),
                {
                    kind: "buff", buff: "pounce", participants: ["ko", "skunkette1"].map(target => ({
                        target,
                        initial: { present: false }, final: { present: true, details: { id: "pounce", severity: 3 } }
                    }))
                },
            ]
        }];
        expect(models(entries)[0]!.rows.map(row => row.kind)).toEqual(["buff"]);
        expect(models(entries)[0]!.rows[0]!.target).toBe("Ko-chan ↔ Skunkette 1");
    });

});


describe("combat log polish regressions", () => {
    it("renders severity on real engine Pounce application even though its first snapshot hides the inactive buff", () => {
        const engine = makeBehavioralEngine([makeBehavioralCharacter("hinari")], [skunkette], 3);
        const initial = engine.getGameState();
        const result = execute(engine, { type: "endTurn" });
        const application = result.frames.find(frame => frame.event.type === "useMove" && frame.event.move === "pounce")!;
        expect(application).toBeDefined();
        expect(application.state.characters[0]!.buffs.find(buff => buff.id === "pounce")).toBeUndefined();
        const entries = createGameLogEntries(result.frames, initial);
        const pounce = entries.find(entry => entry.kind === "move" && entry.move === "pounce")!;
        const buffs = pounce.outcomes.filter(outcome => outcome.kind === "buff");
        expect(buffs).toHaveLength(1);
        expect(buffs[0]!.participants).toHaveLength(2);
        expect(text(renderEntries([pounce]))).toContain("Pounce IV Added");
        expect(text(renderEntries([pounce]))).not.toContain("Updated");
    });

    it.each([
        [3, 3, 2, 2, "Pounce III Refreshed"],
        [3, 3, 2, 4, "Pounce III Extended"],
        [3, 3, 4, 2, "Pounce III Refreshed"],
        [4, 1, 2, 4, "Pounce IV → I"],
        [3, 3, undefined, 4, "Pounce III Refreshed"],
    ])("formats recorded severity %s → %s and duration %s → %s", (initialSeverity, finalSeverity, initialDuration, finalDuration, label) => {
        const before = state();
        before.characters[0]!.buffs = [{ id: "pounce", severity: initialSeverity, duration: initialDuration }];
        const after = structuredClone(before);
        after.characters[0]!.buffs = [{ id: "pounce", severity: finalSeverity, duration: finalDuration }];
        const html = renderEntries(createGameLogEntries([{
            state: after, event: move([], [
                { type: "buffUpdated", target: "ko", buff: "pounce" },
            ])
        }], before));
        expect(text(html)).toContain(label);
    });

    it("uses canonical buff localization for known severities, including reordered names and severity zero", () => {
        expect(presentation.buff("pounce", 0)).toBe("Pounce 0");
        const p = new Presentation({
            ...stockStrings, "buff.severity.text": "{severity} / {name}",
            "buff.severity.0": "Zero", "ui.gameLog.buffRefreshed": "Renewed test", "ui.gameLog.buffExtended": "Longer test"
        });
        const before = state();
        before.characters[0]!.buffs = [{ id: "pounce", severity: 0, duration: 1 }];
        const after = structuredClone(before);
        after.characters[0]!.buffs[0]!.duration = 2;
        const event = move([], [{ type: "buffUpdated", target: "ko", buff: "pounce" }]);
        expect(text(renderEntries(createGameLogEntries([{ event, state: before }], before), p))).toContain("Zero / Pounce Renewed test");
        expect(text(renderEntries(createGameLogEntries([{ event, state: after }], before), p))).toContain("Zero / Pounce Longer test");
    });

    it("renders real Latex Mist as Added on application and Refreshed on reapplication, consolidated across binding leaves", () => {
        const caster = {
            ...skunkette, ai: (_state: Parameters<typeof skunkette.ai>[0], actor: Parameters<typeof skunkette.ai>[1]) => [{
                type: "move" as const, actor, move: { definition: latexMist }, targets: _state.characters,
            }]
        };
        const engine = makeBehavioralEngine([makeBehavioralCharacter("ko"), makeBehavioralCharacter("hinari"), makeBehavioralCharacter("matsuko")], [caster], 3);
        const initial = engine.getGameState();
        const first = execute(engine, { type: "endTurn" });
        const second = execute(engine, { type: "endTurn" });
        const entries = createGameLogEntries([...first.frames, ...second.frames], initial);
        const applications = entries.filter(entry => entry.kind === "move" && entry.move === "latexMist");
        expect(applications).toHaveLength(2);
        expect(models(applications).map(entry => entry.rows.map(row => row.kind))).toEqual([["buff"], ["buff"]]);
        const rows = models(applications).map(entry => entry.rows.filter(row => row.kind === "buff"));
        expect(rows.map(group => group.length)).toEqual([1, 1]);
        expect(rows[0]![0]!.target).toBe("All Allies");
        expect(rows[0]![0]!.values[0]!.text).toMatch(/^Latex Mist [IV]+ Added$/);
        // The second random severity may differ: actual endpoint changes take precedence.
        expect(rows[1]![0]!.values[0]!.text).toMatch(/^Latex Mist [IV]+ (Refreshed|→ [IV]+)$/);
        expect(text(renderEntries(applications))).not.toContain("Updated");
    });

    it("suppresses empty placeholders of every accuracy band after a recorded defeat and keeps the recorded total", () => {
        const entries = createGameLogEntries([move([
            { target: "skunkette1", result: "crit", effects: [damaged("skunkette1", 16)] },
            { target: "skunkette1", result: "hit", effects: [damaged("skunkette1", 9), { type: "enemyDefeated", target: "skunkette1" }] },
            { target: "skunkette1", result: "crit", effects: [] },
            { target: "skunkette1", result: "hit", effects: [] },
        ], [], "rockfall")]);
        expect(models(entries)[0]!.rows[0]!.values.map(value => value.text)).toEqual(["Crit 16", "Hit 9", "= 25"]);
        expect(text(renderEntries(entries))).toContain("Crit 16Hit 9= 25");
        expect(count(renderEntries(entries), "enemy")).toBe(1);
    });

    it("renders only resolved real engine Rockfall hits after defeat", () => {
        const hero = { ...makeBehavioralCharacter("hinari", [rockfall]), data: { subspace: 0 } };
        const engine = makeBehavioralEngine([hero], [{ ...skunkette, hp: 1 }], 3);
        const initial = engine.getGameState();
        const result = execute(engine, { type: "move", actor: "hinari", move: "rockfall", targets: ["skunkette1"] });
        const event = result.frames[0]!.event as MoveEvent;
        expect(event.targets.some(target => target.effects.some(effect => effect.type === "enemyDefeated"))).toBe(true);
        expect(event.targets.filter(target => target.result !== "miss" && target.effects.length === 0).length).toBeGreaterThan(0);
        const rows = models(createGameLogEntries(result.frames, initial))[0]!.rows;
        const damage = rows.find(row => row.kind === "damage")!;
        expect(damage.values.filter(value => ["miss", "graze", "hit", "crit"].includes(value.tone ?? "")).map(value => value.text)).toEqual(["Crit 1"]);
        expect(count(renderEntries(createGameLogEntries(result.frames, initial)), "enemy")).toBe(1);
    });

    it("retains genuine misses, executed zero-damage hits, blocking, and effects after defeat", () => {
        const entries = createGameLogEntries([move([
            { target: "skunkette1", result: "hit", effects: [] },
            { target: "skunkette1", result: "graze", effects: [damaged("skunkette1", 0)] },
            { target: "skunkette1", result: "miss", effects: [] },
            { target: "skunkette1", result: "hit", effects: [damaged("skunkette1", 2), { type: "enemyDefeated", target: "skunkette1" }] },
            { target: "skunkette1", result: "miss", effects: [] },
            { target: "skunkette2", result: "hit", effects: [{ type: "damageBlocked", target: "skunkette2", amount: 5 }] },
            { target: "skunkette1", result: "hit", effects: [{ type: "dataChanged", target: "hinari", name: "subspace", amount: 2 }] },
        ])]);
        expect(models(entries)[0]!.rows[0]!.values.map(value => value.text)).toEqual(["Hit", "Graze", "Miss", "Hit 2", "Hit", "= 2"]);
        expect(text(renderEntries(entries))).toContain("HitBlocked 5");
        // A final snapshot alone cannot identify which zero-damage result was unexecuted.
        const before = state();
        const after = state(); after.enemies = [];
        const ambiguous = createGameLogEntries([{
            state: after, event: move([
                { target: "skunkette1", result: "hit", effects: [] },
            ], [{ type: "enemyDefeated", target: "skunkette1" }])
        }], before);
        expect(models(ambiguous)[0]!.rows[0]!.values[0]!.text).toBe("Hit");
    });

    it("keeps multiple intention move identities and localizes both graphical and leaf paths", () => {
        const effects: LeafEvent[] = [
            { type: "intentionCancelled", target: "skunkette1", move: "pounce" },
            { type: "intentionCancelled", target: "skunkette1", move: "latexMist" },
            { type: "intentionWeakened", target: "skunkette2", move: "pounce" },
            { type: "intentionWeakened", target: "skunkette2", move: "latexMist" },
        ];
        const p = new Presentation({
            ...stockStrings, "move.pounce.name": "Leap test", "move.latexMist.name": "Mist test",
            "ui.gameLog.cancelled": "Cancelled test: {move}", "ui.gameLog.weakened": "Weakened test: {move}"
        });
        const entries = createGameLogEntries([move([{ target: "skunkette1", result: "hit", effects: effects.slice(0, 2) }], effects.slice(2))]);
        expect(entries[0]!.outcomes.filter(outcome => outcome.kind === "intention").map(outcome => outcome.move))
            .toEqual(["pounce", "latexMist", "pounce", "latexMist"]);
        const html = renderEntries(entries, p);
        expect(count(html, "intention")).toBe(4);
        for (const label of ["Cancelled test: Leap test", "Cancelled test: Mist test", "Weakened test: Leap test", "Weakened test: Mist test"]) expect(text(html)).toContain(label);
        expect(text(html)).not.toMatch(/pounce|latexMist/);
    });

    it("scopes binding wrapping and separator clipping without changing ordinary value separators", () => {
        // Ignore selector formatting while checking the same layout rules.
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8").replace(/\s*>\s*/g, " > ");
        const flow = css.match(/\.kcq-game-log__values--bindings \{([^}]+)\}/)![1]!;
        expect(flow).toContain("flex-basis: 100%");
        expect(flow).toContain("overflow: hidden");
        const value = css.match(/\.kcq-game-log__values--bindings > \.kcq-game-log__value \{([^}]+)\}/)![1]!;
        expect(value).toContain("flex: 0 0 auto");
        expect(value).toContain("width: max-content");
        expect(value).toContain("max-width: 100%");
        expect(css).toContain("left: -0.6em");
        const headingRule = css.indexOf(".kcq-game-log__row--bindingTick > .kcq-game-log__recipient::after");
        const defaultRule = css.indexOf(".kcq-game-log__recipient:has(.kcq-game-log__target)::after");
        expect(headingRule).toBeGreaterThan(defaultRule);
        expect(css.slice(headingRule).split("}")[0]).toContain("content: none");
        const recipientRule = css.indexOf(".kcq-game-log__values--bindings .kcq-game-log__recipient::after");
        expect(recipientRule).toBeGreaterThan(defaultRule);
        expect(css.slice(recipientRule).split("}")[0]).toContain("content: none");
        expect(css.match(/\.kcq-game-log__values \{([^}]+)\}/)![1]!).toContain("flex-wrap: wrap");
    });

    it("uses content-sized wrapping rows and consistent inline separators for every outcome type", () => {
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const row = css.match(/\.kcq-game-log__row \{([^}]+)\}/)![1]!;
        expect(row).toContain("display: flex");
        expect(row).toContain("flex-wrap: wrap");
        expect(row).toContain("gap: 0 0.35em");
        expect(css).not.toMatch(/\.kcq-game-log__row--damage\s*\{/);
        for (const selector of ["recipient", "values"]) {
            const rules = css.match(new RegExp("\\.kcq-game-log__" + selector + " \\{([^}]+)\\}"))![1]!;
            expect(rules).toContain("gap: 0 0.35em");
            expect(rules).toContain("flex-wrap: wrap");
            expect(rules).not.toMatch(/(?:\n\s*width: \d|flex-grow|grid-template-columns)/);
        }
        expect(css).toContain('content: "·";');
        expect(css).toContain("margin-right: 0.35em;");
    });
});


describe("Game Log outcome prioritization", () => {
    it.each(["characterIncapacitated", "characterRescued"] as const)("renders %s with a localized accent and normal character name color", type => {
        const operation = type === "characterIncapacitated" ? "incapacitated" : "rescued";
        const p = new Presentation({ ...stockStrings, ["ui.gameLog." + operation]: "Translated outcome", "entity.ko.name": "Translated Ko" });
        const entries = createGameLogEntries([move([], [{ type, target: "ko" }])]);
        const html = renderEntries(entries, p);
        expect(count(html, "character")).toBe(1);
        expect(html).toContain("kcq-game-log__row--" + operation);
        expect(html).toContain('class="kcq-game-log__value--entity-ko">Translated Ko');
        expect(text(html)).toContain("Translated KoTranslated outcome");
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        expect(css).toContain(".kcq-game-log__row--" + operation);
        expect(css).toContain("border-left: 2px solid");
        expect(css).toContain(operation === "rescued" ? "border-left-color: var(--kcq-state-success)" : "border-left-color: var(--kcq-state-danger)");
    });

    it("summarizes the transition buff and stance for rescue without hiding independent effects", () => {
        const before = state(); before.characters[0]!.standing = true;
        before.characters[0]!.buffs = [{ id: "captured" }];
        const after = structuredClone(before); after.characters[0]!.standing = false; after.characters[0]!.buffs = [];
        const entries = createGameLogEntries([{
            state: after, event: move([], [
                { type: "buffRemoved", target: "ko", buff: "captured" },
                { type: "characterRescued", target: "ko" },
                { type: "stanceSet", actor: "ko", stance: "moving" },
                { type: "buffAdded", target: "hinari", buff: "servitude" },
                { type: "bondageChanged", target: "ko", binding: "latexArms", amount: -10 },
                { type: "enemyDefeated", target: "skunkette1" },
            ])
        }], before);
        const html = renderEntries(entries);
        expect(text(html)).toContain("Ko-chanRescued");
        expect(text(html)).not.toContain("captured");
        expect(count(html, "stance")).toBe(0);
        expect(count(html, "binding")).toBe(1);
        expect(text(html)).toContain("Servitude Added");
        expect(count(html, "enemy")).toBe(1);
    });

    it.each(["graze", "hit", "crit", "miss"] as const)("suppresses orphaned %s accuracy when a shared buff succeeds", result => {
        const effects: LeafEvent[] = ["ko", "matsuko", "hinari"].map(target => ({ type: "buffAdded", target, buff: "latexMist" }));
        const entries = createGameLogEntries([move(["ko", "matsuko", "hinari"].map(target => ({ target, result, effects: [] })), effects, "arbitrary-move")]);
        expect(models(entries)[0]!.rows.map(row => [row.kind, row.target, ...row.values.map(value => value.text)]))
            .toEqual([["buff", "All Allies", "Latex Mist Added"]]);
        // Semantic hit evidence stays available; only graphical rows are suppressed.
        expect(entries[0]!.outcomes.filter(outcome => outcome.kind === "damage")).toHaveLength(3);
    });

    it("keeps ordinary failed attacks, including multi-hit misses and a missed AoE recipient", () => {
        const rows = models(createGameLogEntries([move([
            { target: "skunkette1", result: "miss", effects: [] },
            { target: "skunkette1", result: "miss", effects: [] },
            { target: "skunkette2", result: "hit", effects: [damaged("skunkette2", 10)] },
        ], [{ type: "dataChanged", target: "ko", name: "subspace", amount: -5 }])]))[0]!.rows;
        expect(rows[0]!.values.map(value => value.text)).toEqual(["Miss", "Miss"]);
        expect(rows[1]!.values.map(value => value.text)).toEqual(["Hit 10"]);
        expect(models(createGameLogEntries([move([{ target: "skunkette1", result: "miss", effects: [] }])]))[0]!.rows[0]!.values)
            .toEqual([{ text: "Miss", tone: "miss" }]);
    });

    it("suppresses an orphan miss even when its successful buff could otherwise merge inline", () => {
        const rows = models(createGameLogEntries([move([{
            target: "ko", result: "miss", effects: [
                { type: "buffAdded", target: "ko", buff: "latexMist" },
            ]
        }])]))[0]!.rows;
        expect(rows.map(row => row.kind)).toEqual(["buff"]);
        expect(rows[0]!.values[0]!.text).toBe("Latex Mist Added");
    });

    it("suppresses orphan successful bands but preserves an emitted zero-damage hit", () => {
        const entries = createGameLogEntries([move([
            { target: "skunkette1", result: "crit", effects: [] },
        ]), move([{ target: "skunkette1", result: "hit", effects: [damaged("skunkette1", 0)] }])]);
        expect(models(entries)[0]!.rows).toEqual([]);
        expect(models(entries)[1]!.rows[0]!.values.map(value => value.text)).toEqual(["Hit"]);
    });

    it("keeps binding accuracy beside target-specific changes while consolidating the party buff", () => {
        const entries = createGameLogEntries([move([
            { target: "ko", result: "graze", effects: [{ type: "bondageAdded", target: "ko", binding: "latexArms", amount: 12 }, { type: "buffAdded", target: "ko", buff: "latexMist" }] },
            { target: "matsuko", result: "hit", effects: [{ type: "bondageAdded", target: "matsuko", binding: "latexArms", amount: 25 }, { type: "buffAdded", target: "matsuko", buff: "latexMist" }] },
            { target: "hinari", result: "crit", effects: [{ type: "buffAdded", target: "hinari", buff: "latexMist" }] },
        ], [], "latexMist")]);
        const rows = models(entries)[0]!.rows;
        expect(rows.map(row => [row.target, ...row.values.map(value => value.text)])).toEqual([
            ["Ko-chan", "Graze", "Skunk Arms 0 (None) → 12"],
            ["All Allies", "Latex Mist Added"],
            ["Matsuko", "Hit", "Skunk Arms 0 (None) → 25"],
        ]);
    });

    it("summarizes real engine Latex Spray incapacitation and rescue without changing their recorded leaves", () => {
        const prepare = makeBehavioralMove("prepare", "none", {
            targetSide: "none", targets: 0,
            resolve: (_state, actor) => {
                if (!isCharacter(actor) || !_state.enemies[0]) return [];
                return [
                    { type: "stance", actor, stance: "standing" },
                    ...[latexHead, latexArms, latexLegs, latexTorso].map(binding => ({
                        type: "binding" as const, source: actor, target: actor,
                        binding, amount: binding === latexTorso ? 56 : 80
                    })),
                    {
                        type: "buff", target: actor, operation: "add", buff: {
                            id: "pounce", active: true, severity: 2,
                            statuses: [s(immobilized, 1)], linkedEntity: "skunkette1"
                        }
                    },
                    { type: "buff", target: _state.enemies[0]!, operation: "add", buff: { id: "pounce", active: true, severity: 2, linkedEntity: "ko" } },
                ];
            },
        });
        const free = makeBehavioralMove("free", "none", {
            targets: "all", baseDamage: 999,
            resolve: (_state, actor, _move, targets) => targets.flatMap(({ target }) => isEnemy(target) ? [{ type: "damage" as const, source: actor, target, amount: 999 }] : []),
        });
        const caster = {
            ...skunkette, ai: (_state: Parameters<typeof skunkette.ai>[0], actor: Parameters<typeof skunkette.ai>[1]) => actor.id !== "skunkette1" ? [] : [{
                type: "move" as const, actor, move: { definition: { ...latexSpray, accuracy: { hit: 100 } }, binding: latexTorso }, targets: [_state.characters[0]!],
            }]
        };
        const engine = makeBehavioralEngine([makeBehavioralCharacter("ko", [prepare]), makeBehavioralCharacter("hinari", [free])], [caster], 3);
        execute(engine, { type: "move", actor: "ko", move: "prepare", targets: [] });
        const initial = engine.getGameState();
        const result = execute(engine, { type: "endTurn" });
        const spray = result.frames.find(frame => frame.event.type === "useMove" && frame.event.move === "latexSpray")!;
        expect(spray).toBeDefined();
        const saved = JSON.stringify(result.frames);
        const entries = createGameLogEntries(result.frames, initial).filter(entry => entry.kind === "move");
        const html = renderEntries(entries);
        expect(text(html)).toContain("Ko-chanIncapacitated");
        expect(text(html)).not.toMatch(/Pounce II Removed|Standing → Moving|Fully Skunked Added/);
        expect(text(html)).toContain("Skunk Torso");
        expect(text(html)).toContain("Skunkette KoSpawned");
        expect(count(html, "character")).toBe(1);
        expect(JSON.stringify(result.frames)).toBe(saved);
        const beforeRescue = engine.getGameState();
        const rescue = execute(engine, { type: "move", actor: "hinari", move: "free", targets: [] });
        const rescued = renderEntries(createGameLogEntries(rescue.frames, beforeRescue));
        expect(text(rescued)).toContain("Ko-chanRescued");
        expect(text(rescued)).not.toContain("Fully Skunked Removed");
        expect(count(rescued, "enemy")).toBe(2);
        expect(text(rescued)).toContain("Hit 200");
    });
});
