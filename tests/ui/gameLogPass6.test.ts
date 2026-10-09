import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import type { Binding, GameEvent, GameState, LeafEvent, MoveEvent } from "../../src/engine/public/types";
import { createGameLogEntries, type BindingTickOutcome } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { GameLogPanel } from "../../src/ui/web/app/panels/GameLogPanel";
import { makeFixtureCharacter } from "../../src/ui/web/app/fixtures/publicFixture";
import { createGameLogViewModel } from "../../src/ui/web/app/viewModels/gameLog";
import { isCharacter } from "../../src/engine/protected/helpers";
import { latexCollar } from "../../src/content/skunk/latex";
import { latexRain, rainmaker } from "../../src/content/skunk/rainmaker";
import { execute, makeBehavioralCharacter, makeBehavioralEngine, makeBehavioralMove } from "../helpers/behavioralHelpers";
import { stockStrings } from "../helpers/stockStrings";

const p = new Presentation(stockStrings);
const zones = ["latexHead", "latexArms", "latexTorso", "latexLegs"];
const binding = (id: string, value: number, level: Binding["level"]): Binding => ({
    id, value, level, data: {}, status: [], tickEffects: [],
});
const state = (): GameState => ({
    characters: [makeFixtureCharacter("ko"), makeFixtureCharacter("hinari")].map(character => ({ ...character, bindings: [] })),
    enemies: [], traps: [], encounter: null,
    turn: { phase: "player", round: 4, step: 1, outcome: "ongoing" },
    difficulty: { id: "standard", playerModifiers: {}, enemyModifiers: {} },
});
const phase = (effects: LeafEvent[]): GameEvent => ({ type: "changePhase", phase: "player", effects });
const tick = (target: string, effects: LeafEvent[] = [], binding = "latexCollar"): LeafEvent[] => [
    { type: "bindingTickStart", target, binding }, ...effects, { type: "bindingTickEnd", target, binding },
];
const change = (target: string, binding: string, amount: number): LeafEvent => ({ type: "bondageChanged", target, binding, amount });
const move = (targets: MoveEvent["targets"], effects: LeafEvent[] = []): MoveEvent => ({
    type: "useMove", actor: "skunkette1", move: "latexRain", targets, effects,
});
const entries = (event: GameEvent, before?: GameState, after?: GameState) =>
    createGameLogEntries([after ? { event, state: after } : event], before);
const models = (event: GameEvent, before?: GameState, after?: GameState, presentation = p) =>
    createGameLogViewModel(entries(event, before, after), presentation, ["ko", "hinari"])[0]!;
const render = (event: GameEvent, before?: GameState, after?: GameState, presentation = p) =>
    renderToString(() => createComponent(GameLogPanel, { entries: entries(event, before, after), state: after ?? state(), presentation }));
const text = (html: string) => html.replace(/<[^>]*>/g, "");
const count = (html: string, kind: string) => (html.match(new RegExp('data-outcome="' + kind + '"', "g")) ?? []).length;
function collarFrame() {
    const before = state();
    before.characters[0]!.bindings = zones.map((id, index) => binding(id, index === 1 ? 86 : 40, index === 1 ? "overwhelming" : "heavy"));
    const after = structuredClone(before);
    after.characters[0]!.bindings = zones.map((id, index) => binding(id, index === 1 ? 87 : 50, index === 1 ? "overwhelming" : "severe"));
    const event = phase(tick("ko", zones.map((id, index) => change("ko", id, index === 1 ? 1 : 10))));
    return { before, after, event };
}

describe("Pass 6 semantic binding activations", () => {
    it("owns all four collar zones with exact endpoints without duplicating consequences", () => {
        const { before, after, event } = collarFrame();
        const result = entries(event, before, after)[0]!.outcomes;
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ kind: "bindingTick", target: "ko", binding: "latexCollar" });
        const activation = result[0] as BindingTickOutcome;
        expect(activation.outcomes).toHaveLength(4);
        expect(activation.outcomes).toEqual(zones.map((id, index) => ({
            kind: "binding", target: "ko", binding: id, change: index === 1 ? 1 : 10, blocked: 0,
            initial: { value: index === 1 ? 86 : 40, level: index === 1 ? "overwhelming" : "heavy" },
            final: { value: index === 1 ? 87 : 50, level: index === 1 ? "overwhelming" : "severe" },
        })));
    });

    it("keeps characters and repeated identical activations in emitted order", () => {
        const event = phase([...tick("ko", [change("ko", "latexHead", 10)]), ...tick("hinari"), ...tick("ko", [change("ko", "latexHead", 10)])]);
        const before = state(); before.characters[0]!.bindings = [binding("latexHead", 40, "heavy")];
        const after = structuredClone(before); after.characters[0]!.bindings = [binding("latexHead", 60, "severe")];
        const result = entries(event, before, after)[0]!.outcomes as BindingTickOutcome[];
        expect(result.map(outcome => outcome.target)).toEqual(["ko", "hinari", "ko"]);
        expect(result.map(outcome => outcome.outcomes.length)).toEqual([1, 0, 1]);
        expect(result[0]!.outcomes[0]).toMatchObject({ initial: { value: 40, level: "heavy" }, final: { value: 50, level: "severe" } });
        expect(result[2]!.outcomes[0]).toMatchObject({ initial: { value: 50, level: "severe" }, final: { value: 60, level: "severe" } });
        // A final frame alone can still anchor applied deltas.
        expect(entries(event, undefined, after)[0]!.outcomes).toEqual(result);
    });

    it("preserves effects on both sides without borrowing them into an activation", () => {
        const before = state(); before.characters[0]!.bindings = [binding("latexHead", 20, "moderate")];
        const after = structuredClone(before); after.characters[0]!.bindings = [binding("latexHead", 36, "heavy")];
        const event = phase([change("ko", "latexHead", 2), ...tick("ko", [change("ko", "latexHead", 10)]), change("ko", "latexHead", 4), { type: "actionRefreshed", target: "hinari" }]);
        const result = entries(event, before, after)[0]!.outcomes;
        expect(result.map(outcome => outcome.kind)).toEqual(["binding", "bindingTick", "binding", "refresh"]);
        expect(result[0]).toMatchObject({ initial: { value: 20 }, final: { value: 22 } });
        expect((result[1] as BindingTickOutcome).outcomes[0]).toMatchObject({ initial: { value: 22 }, final: { value: 32 } });
        expect(result[2]).toMatchObject({ initial: { value: 32 }, final: { value: 36 } });
        expect(models(event, before, after).rows.map(row => row.kind)).toEqual(["binding", "bindingTick", "binding", "refresh"]);
    });

    it("retains indirect damage, healing, buffs, blocked bindings, traps and resources", () => {
        const event = phase(tick("ko", [
            { type: "enemyDamaged", target: "skunkette1", amount: 9 },
            { type: "enemyHealed", target: "skunkette1", amount: 2 },
            { type: "buffAdded", target: "hinari", buff: "latexMist" },
            { type: "bondageBlocked", target: "ko", binding: "latexArms", amount: 7 },
            { type: "trapTriggered", actor: "hinari", trap: "snare", amount: 1 },
            { type: "dataChanged", target: "ko", name: "subspace", amount: 3 },
            { type: "intentionCancelled", target: "skunkette1", move: "pounce" },
        ]));
        const result = entries(event)[0]!.outcomes;
        expect(result).toHaveLength(1);
        const effects = (result[0] as BindingTickOutcome).outcomes;
        expect(effects.map(outcome => outcome.kind)).toEqual(["damage", "buff", "binding", "trap", "resource", "intention"]);
        expect(effects[0]).toMatchObject({ target: "skunkette1", damage: 9, healing: 2 });
        expect(effects[2]).toMatchObject({ blocked: 7, change: 0 });
    });

    it("does not duplicate damage attribution when delimiters occur in a move result", () => {
        const event = move([{ target: "ko", result: "hit", effects: [
            { type: "enemyDamaged", target: "ko", amount: 2 },
            ...tick("ko", [{ type: "enemyDamaged", target: "ko", amount: 3 }]),
            { type: "enemyDamaged", target: "ko", amount: 5 },
        ] }]);
        const result = entries(event)[0]!.outcomes;
        expect(result).toMatchObject([
            { kind: "damage", damage: 2, hits: [{ result: "hit", damage: 2 }] },
            { kind: "bindingTick", outcomes: [{ kind: "damage", damage: 3, hits: [{ result: "none", damage: 3 }] }] },
            { kind: "damage", damage: 5, hits: [{ result: "none", damage: 5 }] },
        ]);
        expect(models(event).rows.map(row => row.kind)).toEqual(["damage", "bindingTick", "damage"]);
        expect(count(render(event), "damage")).toBe(3);
    });

    it("splits resources, traps, buff presence and stances across repeated ticks", () => {
        const before = state(); before.characters[0]!.standing = true; before.characters[0]!.data = { subspace: 5 }; before.traps = [{ id: "snare", amount: 3 }];
        const after = structuredClone(before); after.characters[0]!.data.subspace = 10; after.traps = [{ id: "snare", amount: 4 }];
        const event = phase([
            ...tick("ko", [
                { type: "dataChanged", target: "ko", name: "subspace", amount: 2 },
                { type: "trapTriggered", actor: "ko", trap: "snare", amount: 1 },
                { type: "buffAdded", target: "ko", buff: "brace" },
                { type: "stanceSet", actor: "ko", stance: "moving" },
            ]),
            ...tick("ko", [
                { type: "dataChanged", target: "ko", name: "subspace", amount: 3 },
                { type: "trapAdded", actor: "ko", trap: "snare", amount: 2 },
                { type: "buffRemoved", target: "ko", buff: "brace" },
                { type: "stanceSet", actor: "ko", stance: "standing" },
            ]),
        ]);
        const groups = entries(event, before, after)[0]!.outcomes as BindingTickOutcome[];
        expect(groups[0]!.outcomes).toMatchObject([
            { kind: "resource", initial: 5, final: 7 }, { kind: "trap", initial: 3, final: 2, change: -1 },
            { kind: "buff", participants: [{ initial: { present: false }, final: { present: true } }] },
            { kind: "stance", initial: "standing", final: "moving" },
        ]);
        expect(groups[1]!.outcomes).toMatchObject([
            { kind: "resource", initial: 7, final: 10 }, { kind: "trap", initial: 2, final: 4, change: 2 },
            { kind: "buff", participants: [{ initial: { present: true }, final: { present: false } }] },
            { kind: "stance", initial: "moving", final: "standing" },
        ]);
    });

    it("supports nested matched activations and ignores malformed delimiters", () => {
        const event = phase(tick("ko", [change("ko", "latexHead", 1), ...tick("hinari", [change("hinari", "latexArms", 2)]), change("ko", "latexHead", 3)]));
        const group = entries(event)[0]!.outcomes[0] as BindingTickOutcome;
        expect(group.outcomes.map(outcome => outcome.kind)).toEqual(["binding", "bindingTick", "binding"]);
        const malformed = phase([{ type: "bindingTickStart", target: "ko", binding: "latexCollar" }, change("ko", "latexHead", 1), { type: "bindingTickEnd", target: "hinari", binding: "latexCollar" }]);
        expect(entries(malformed)[0]!.outcomes.map(outcome => outcome.kind)).toEqual(["binding"]);
    });

    it("does not merge top-level events", () => {
        const event = phase(tick("ko", [change("ko", "latexHead", 2)]));
        expect(createGameLogEntries([event, event]).map(entry => entry.outcomes.length)).toEqual([1, 1]);
    });
});

describe("Pass 6 rendered activation and multi-zone rows", () => {
    it("renders one localized activation and a four-zone row with individually colored endpoints", () => {
        const { event, before, after } = collarFrame();
        const model = models(event, before, after);
        expect(model.rows).toHaveLength(1);
        expect(model.rows[0]).toMatchObject({ kind: "bindingTick", target: "Ko-chan", label: "Skunk Collar Activated", values: [] });
        expect(model.rows[0]!.rows).toHaveLength(1);
        expect(model.rows[0]!.rows![0]!.target).toBeUndefined();
        expect(model.rows[0]!.rows![0]!.values.map(value => value.text)).toEqual([
            "Skunk Head 40 (Heavy) → 50 (Severe)", "Skunk Arms 86 (Overwhelming) → 87 (Overwhelming)",
            "Skunk Torso 40 (Heavy) → 50 (Severe)", "Skunk Legs 40 (Heavy) → 50 (Severe)",
        ]);
        const html = render(event, before, after);
        expect(count(html, "bindingTick")).toBe(1); expect(count(html, "binding")).toBe(1);
        expect(text(html).match(/Ko-chan/g)).toHaveLength(1);
        for (const level of ["heavy", "severe", "overwhelming"]) expect(html).toContain("kcq-game-log__value--binding-" + level);
        const translated = new Presentation({ ...stockStrings, "ui.gameLog.activated": "Awoke", "binding.latexCollar.name": "Test Collar", "ui.gameLog.bindingActivation": "{activated}: {binding}" });
        expect(models(event, before, after, translated).rows[0]!.label).toBe("Awoke: Test Collar");
    });

    it("renders distinct repeated and multi-character activations, including empty groups", () => {
        const event = phase([...tick("ko"), ...tick("hinari", [change("hinari", "latexHead", 2)]), ...tick("ko", [{ type: "cooldownChanged", target: "ko", move: "telekinesis", value: 0 }])]);
        const rows = models(event).rows;
        expect(rows.map(row => [row.target, row.label, row.rows?.length])).toEqual([
            ["Ko-chan", "Skunk Collar Activated", 0], ["Hinari", "Skunk Collar Activated", 1], ["Ko-chan", "Skunk Collar Activated", 0],
        ]);
        const html = render(event); expect(count(html, "bindingTick")).toBe(3); expect(count(html, "binding")).toBe(1);
        expect(text(html).match(/Activated/g)).toHaveLength(3);
    });

    it("renders an activation alone for zero applied changes and zero HP effects", () => {
        const event = phase(tick("ko", [change("ko", "latexHead", 0),
            { type: "enemyDamaged", target: "skunkette1", amount: 0 },
            { type: "dataChanged", target: "ko", name: "subspace", amount: 0 },
        ]));
        expect((entries(event)[0]!.outcomes[0] as BindingTickOutcome).outcomes).toHaveLength(3);
        expect(models(event).rows[0]!.rows).toEqual([]);
        const html = render(event);
        expect(count(html, "bindingTick")).toBe(1); expect(count(html, "binding")).toBe(0); expect(count(html, "damage")).toBe(0);
        expect(html).not.toContain('class="kcq-game-log__tick-outcomes"');
    });

    it("keeps non-binding effects nested, with names for indirect recipients and blocked amounts", () => {
        const event = phase(tick("ko", [
            change("ko", "latexHead", 10), { type: "bondageBlocked", target: "ko", binding: "latexHead", amount: 4 },
            change("ko", "latexArms", 2), { type: "bondageBlocked", target: "ko", binding: "latexArms", amount: 3 },
            { type: "enemyDamaged", target: "skunkette1", amount: 9 }, { type: "buffAdded", target: "hinari", buff: "latexMist" },
            { type: "dataChanged", target: "ko", name: "subspace", amount: 3 },
        ]));
        const rows = models(event).rows[0]!.rows!;
        expect(rows.map(row => row.kind)).toEqual(["binding", "damage", "buff", "resource"]);
        expect(rows[0]!.values.map(value => value.text)).toEqual(["Skunk Head +10", "Blocked 4", "Skunk Arms +2", "Blocked 3"]);
        expect(rows[1]!.target).toBe("Skunkette 1"); expect(rows[2]!.target).toBe("Hinari");
        const html = render(event); expect(count(html, "damage")).toBe(1); expect(count(html, "buff")).toBe(1); expect(count(html, "resource")).toBe(1);
    });

    it("consolidates Latex Rain zones for each AoE target with distinct accuracy bands and misses", () => {
        const before = state();
        for (const character of before.characters) character.bindings = [binding("latexHead", 20, "moderate"), binding("latexArms", 40, "heavy"), binding("latexLegs", 10, "light")];
        const after = structuredClone(before);
        for (const character of after.characters) character.bindings = [binding("latexHead", 35, "heavy"), binding("latexArms", 55, "severe"), binding("latexLegs", 25, "moderate")];
        const event = move([
            { target: "ko", result: "graze", effects: ["latexHead", "latexArms", "latexLegs"].map(id => change("ko", id, 15)) },
            { target: "hinari", result: "crit", effects: [...["latexHead", "latexArms", "latexLegs"].map(id => change("hinari", id, 15)), { type: "bondageBlocked", target: "hinari", binding: "latexArms", amount: 5 }] },
            { target: "matsuko", result: "miss", effects: [] },
        ]);
        const rows = models(event, before, after).rows;
        expect(rows.map(row => row.target)).toEqual(["Ko-chan", "Hinari", "Matsuko"]);
        expect(rows.map(row => row.values[0]!.text)).toEqual(["Graze", "Crit", "Miss"]);
        expect(rows[0]!.values.slice(1).map(value => value.text)).toEqual(["Skunk Head 20 (Moderate) → 35 (Heavy)", "Skunk Arms 40 (Heavy) → 55 (Severe)", "Skunk Legs 10 (Light) → 25 (Moderate)"]);
        expect(rows[1]!.values.map(value => value.text)).toContain("Blocked 5");
        const html = render(event, before, after);
        expect(count(html, "damage")).toBe(3); expect(count(html, "binding")).toBe(0);
        expect(text(html).match(/Hinari/g)).toHaveLength(1); expect(text(html).match(/Ko-chan/g)).toHaveLength(1);
    });

    it("keeps ordinary zones together without accuracy and preserves multi-hit bands once", () => {
        const effects = [change("ko", "latexHead", 3), change("ko", "latexArms", 4)];
        expect(models(phase(effects)).rows.map(row => [row.target, row.values.length])).toEqual([["Ko-chan", 2]]);
        const event = move([
            { target: "ko", result: "hit", effects: [effects[0]!] }, { target: "ko", result: "graze", effects: [effects[1]!] }, { target: "ko", result: "miss", effects: [] },
        ]);
        expect(models(event).rows).toHaveLength(1);
        expect(models(event).rows[0]!.values.map(value => value.text)).toEqual(["Hit", "Graze", "Miss", "Skunk Head +3", "Skunk Arms +4"]);
        expect(createGameLogViewModel(createGameLogEntries([event, event]), p).map(entry => entry.rows.length)).toEqual([1, 1]);
    });

    it("preserves incapacitation and rescue cleanup suppression inside tick groups", () => {
        const before = state(); before.characters[0]!.standing = true; before.characters[0]!.buffs = [{ id: "captured" }];
        const after = structuredClone(before); after.characters[0]!.standing = false; after.characters[0]!.buffs = [];
        const event = phase(tick("ko", [
            { type: "buffRemoved", target: "ko", buff: "captured" }, { type: "characterRescued", target: "ko" },
            { type: "stanceSet", actor: "ko", stance: "moving" }, change("ko", "latexHead", -10),
            { type: "buffAdded", target: "hinari", buff: "latexMist" },
        ]));
        expect(models(event, before, after).rows[0]!.rows!.map(row => row.kind)).toEqual(["character", "binding", "buff"]);
        const html = render(event, before, after); expect(html).toContain("kcq-game-log__row--rescued"); expect(text(html)).not.toContain("captured"); expect(count(html, "stance")).toBe(0);
        const incapacitated = phase(tick("ko", [{ type: "buffAdded", target: "ko", buff: "captured" }, { type: "characterIncapacitated", target: "ko" }]));
        expect(models(incapacitated).rows[0]!.rows!.map(row => row.kind)).toEqual(["character"]);
        expect(render(incapacitated)).toContain("kcq-game-log__row--incapacitated");
    });
});


describe("Pass 6 real-engine boundaries", () => {
    it("renders the engine's collar activation exactly once and leaves frames untouched", () => {
        const prepare = makeBehavioralMove("prepare", "none", {
            targetSide: "none", targets: 0,
            resolve: (_state, actor) => isCharacter(actor)
                ? [{ type: "binding", source: actor, target: actor, binding: latexCollar, amount: 50 }] : [],
        });
        const engine = makeBehavioralEngine([makeBehavioralCharacter("ko", [prepare])], [{ ...rainmaker, ai: () => [] }], 3);
        execute(engine, { type: "move", actor: "ko", move: "prepare", targets: [] });
        const initial = engine.getGameState();
        const result = execute(engine, { type: "endTurn" });
        const saved = JSON.stringify(result.frames);
        const semantic = createGameLogEntries(result.frames, initial);
        const ticks = semantic.flatMap(entry => entry.outcomes).filter(outcome => outcome.kind === "bindingTick");
        expect(ticks).toHaveLength(1);
        expect(ticks[0]!.binding).toBe("latexCollar");
        expect(ticks[0]!.outcomes.filter(outcome => outcome.kind === "binding")).toHaveLength(4);
        const rendered = createGameLogViewModel(semantic, p).flatMap(entry => entry.rows).filter(row => row.kind === "bindingTick");
        expect(rendered).toHaveLength(1);
        expect(rendered[0]!.rows).toHaveLength(1);
        expect(rendered[0]!.rows![0]!.values).toHaveLength(4);
        expect(JSON.stringify(result.frames)).toBe(saved);
    });

    it("consolidates real Latex Rain targets and preserves their executed accuracy", () => {
        const caster = { ...rainmaker, ai: (_state: Parameters<typeof rainmaker.ai>[0], actor: Parameters<typeof rainmaker.ai>[1]) => [{
            type: "move" as const, actor, move: { definition: { ...latexRain, accuracy: { hit: 100 } } }, targets: _state.characters,
        }] };
        const engine = makeBehavioralEngine([makeBehavioralCharacter("ko"), makeBehavioralCharacter("hinari")], [caster], 3);
        const initial = engine.getGameState();
        const result = execute(engine, { type: "endTurn" });
        const semantic = createGameLogEntries(result.frames, initial).filter(entry => entry.kind === "move" && entry.move === "latexRain");
        expect(semantic).toHaveLength(1);
        const rows = createGameLogViewModel(semantic, p)[0]!.rows;
        expect(rows.map(row => row.target)).toEqual(["Ko-chan", "Hinari"]);
        for (const row of rows) {
            expect(row.values[0]!.text).toBe("Hit");
            expect(row.values).toHaveLength(4);
            expect(row.values.slice(1).every(value => value.text.startsWith("Skunk "))).toBe(true);
        }
    });
});
