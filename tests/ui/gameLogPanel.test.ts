import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import type { Buff, Enemy, EventFrame, GameState, LeafEvent, MoveEvent } from "../../src/engine/public/types";
import { createGameLogEntries, type GameLogPresentationEntry } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { DevApp } from "../../src/ui/web/app/dev/DevApp";
import { gameLogFixture } from "../../src/ui/web/app/fixtures/gameLog";
import { makeFixtureCharacter } from "../../src/ui/web/app/fixtures/publicFixture";
import { GameLogPanel } from "../../src/ui/web/app/panels/GameLogPanel";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
const enemy = (id: string, buffs: Buff[] = []): Enemy => ({
    id, defId: "skunkette", rank: "enemy", maxHp: 200, currHp: 200, currDef: 0, buffs, intentions: [], cooldowns: {},
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
        const html = renderEntries(createGameLogEntries([{ state: after, event: move([], [
            { type: "bondageChanged", target: "ko", binding: "latexArms", amount: 23 },
            { type: "bondageChanged", target: "ko", binding: "latexArms", amount: -5 },
            { type: "bondageBlocked", target: "ko", binding: "latexArms", amount: 4 },
        ]) }], before));
        expect(count(html, "binding")).toBe(1);
        expect(text(html)).toContain("Ko-chanSkunk Arms10 (Light) → 28 (Moderate)Blocked 4");
        expect(html).toContain("kcq-game-log__value--binding-moderate");
    });

    it("renders buff additions, removals, and severity-only transitions without payload details", () => {
        const before = state();
        before.characters[0]!.buffs = [{ id: "burnout", severity: 4 }, { id: "pounce", severity: 2 }];
        const after = structuredClone(before);
        after.characters[0]!.buffs = [{ id: "burnout", severity: 1 }, { id: "brace", severity: 3, modifiers: { defense: 99 } }];
        const html = renderEntries(createGameLogEntries([{ state: after, event: move([], [
            { type: "buffUpdated", target: "ko", buff: "burnout" },
            { type: "buffRemoved", target: "ko", buff: "pounce" },
            { type: "buffAdded", target: "ko", buff: "brace" },
        ]) }], before));
        expect(count(html, "buff")).toBe(3);
        expect(text(html)).toContain("BurnoutIV → I");
        expect(text(html)).toContain("PounceRemoved · II");
        expect(text(html)).toContain("BraceAdded · III");
        expect(text(html)).not.toMatch(/99|Defense|modifier|status/);
    });

    it("renders a reciprocal linked Pounce once, with a single shared severity transition", () => {
        const html = renderToString(() => createComponent(GameLogPanel, gameLogFixture));
        const rows = html.match(/<div[^>]+data-outcome="buff"[\s\S]*?(?=<\/article>)/g) ?? [];
        expect(rows.filter(row => text(row).includes("Pounce"))).toHaveLength(1);
        expect(text(html)).toContain("Ko-chan ↔ Skunkette 1PounceIV → I");
        expect(text(html).match(/IV → I/g)).toHaveLength(1);
    });

    it("keeps distinct linked participant severities in one logical outcome", () => {
        const entries: GameLogPresentationEntry[] = [{ kind: "move", actor: "ko", move: "telekinesis", outcomes: [{
            kind: "buff", buff: "pounce", participants: [
                { target: "ko", initial: { present: true, details: { id: "pounce", severity: 4 } }, final: { present: true, details: { id: "pounce", severity: 1 } } },
                { target: "skunkette1", initial: { present: true, details: { id: "pounce", severity: 3 } }, final: { present: true, details: { id: "pounce", severity: 2 } } },
            ],
        }] }];
        const html = renderEntries(entries);
        expect(count(html, "buff")).toBe(1);
        expect(text(html)).toContain("Ko-chan: IV → I");
        expect(text(html)).toContain("Skunkette 1: III → II");
    });

    it("displays applied resource deltas from emitted events separately from snapshot endpoints", () => {
        const before = state();
        before.characters[1]!.data = { subspace: 50, subspaceMax: 100, secret: 123 };
        const after = structuredClone(before);
        after.characters[1]!.data = { subspace: 20, subspaceMax: 100, secret: 456 };
        const html = renderEntries(createGameLogEntries([{ state: after, event: move([], [
            { type: "dataChanged", target: "hinari", name: "subspace", amount: -25 },
        ]) }], before));
        expect(count(html, "resource")).toBe(1);
        expect(text(html)).toContain("HinariSubspace-2550 → 20");
        expect(text(html)).not.toMatch(/secret|123|456|-30/);
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
        expect(text(html)).toContain("Ko-chanSkunk Arms12 → 0 (None)");
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
        const html = renderEntries(createGameLogEntries([{ state: after, event: move([], [
            { type: "trapTriggered", actor: "ko", trap: "trapPuddle", amount: 3 },
            { type: "trapRemoved", actor: "hinari", trap: "trapPuddle", amount: 2 },
            { type: "intentionCancelled", target: "skunkette1" },
            { type: "intentionWeakened", target: "skunkette2" },
            { type: "targetChanged", target: "skunkette1", destination: "matsuko" },
            { type: "actionInterrupted", actor: "ko", reason: "bindingRestriction" },
            { type: "actionRefreshed", target: "hinari" },
            { type: "enemySpawned", target: "skunkette3" },
            { type: "enemyDefeated", target: "skunkette2" },
            { type: "stanceSet", actor: "ko", stance: "standing" },
        ]) }], before));
        expect(count(html, "trap")).toBe(1);
        for (const label of ["Latex Puddle10 → 5", "Triggered by Ko-chan ×3", "Intention cancelled", "Intention weakened", "Retargeted → Matsuko",
            "Interrupted · Bindings prevent this action.", "Refreshed", "Skunkette 3Spawned", "Skunkette 2Defeated", "Moving → Standing"]) expect(text(html)).toContain(label);
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
        for (const label of ["BraceAdded", "PounceUpdated", "BurnoutRemoved", "Skunk Arms+7", "Subspace+10", "Enemy Phase"]) expect(text(html)).toContain(label);
        expect(text(html)).not.toMatch(/undefined|NaN|Round undefined|\[buff.severity/);
    });

    it("preserves known partial endpoints and describes same-severity buff updates", () => {
        const before = state();
        before.characters[0]!.buffs = [{ id: "pounce", severity: 4 }];
        const html = renderEntries(createGameLogEntries([{ state: before, event: move([], [
            { type: "buffUpdated", target: "ko", buff: "pounce" },
        ]) }], before));
        expect(text(html)).toContain("PounceUpdated · IV");
        expect(text(html)).not.toContain("IV → IV");

        const after = state();
        after.characters[1]!.data.subspace = 25;
        after.characters[0]!.buffs = [{ id: "pounce", severity: 1 }];
        const partial = renderEntries(createGameLogEntries([{ state: after, event: move([], [
            { type: "dataChanged", target: "hinari", name: "subspace", amount: 5 },
            { type: "buffUpdated", target: "ko", buff: "pounce" },
        ]) }]));
        expect(text(partial)).toContain("Subspace+5To 25");
        expect(text(partial)).toContain("PounceTo I");
        expect(text(partial)).not.toContain("20 → 25");
    });

    it("localizes names, severity, outcomes, transitions, accessibility, and empty state", () => {
        const p = new Presentation({ ...stockStrings,
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
        const html = renderEntries(createGameLogEntries([{ state: after, event: move([
            { target: "skunkette1", result: "hit", effects: [damaged("skunkette1", 18)] },
        ], [
            { type: "buffUpdated", target: "ko", buff: "pounce" },
            { type: "bondageChanged", target: "ko", binding: "latexArms", amount: 2 },
            { type: "dataChanged", target: "ko", name: "subspace", amount: 3 },
        ]) }], before), p);
        for (const label of ["Actor test", "Target 1", "Move test", "Result test 18", "Binding test", "Buff testLevel four becomes Level one", "Resource test+3"]) expect(text(html)).toContain(label);
        expect(html).toContain('aria-label="History test"');
        expect(text(renderEntries([], p))).toContain("Empty test");
    });

    it("uses the production panel for the screenshot review entry", () => {
        const html = renderToString(() => createComponent(DevApp, { initialPanel: "log" as const }));
        expect(html).toMatch(/class="[^"]*\bkcq-game-log\b[^"]*"/);
        expect(html).toContain("kcq-combat-header--subscreen");
        expect(html).not.toContain("kcq-combat-header__settings");
        expect(text(html)).toContain("PounceIV → I");
        expect(html).not.toContain("Gallery placeholder");
    });
});
