import { describe, expect, it } from "vitest";
import type { GameState, LeafEvent, MoveEvent } from "../../src/engine/public/types";
import { aggregateGameLogOutcomes, createGameLogEntries, gameLogEntry, type GameLogContext, type GameLogPresentationEntry, type LogOutcome, type TrapActivationOutcome } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { makeFixtureCharacter } from "../../src/ui/web/app/fixtures/publicFixture";
import { createGameLogHistory } from "../../src/ui/web/app/viewModels/gameLogHistory";
import { createGameLogViewModel } from "../../src/ui/web/app/viewModels/gameLog";
import { createStoryLogViewModel } from "../../src/ui/web/app/viewModels/storyLog";

const strings = {
    "entity.ko.name": "Ko",
    "entity.enemy.name": "Enemy",
    "move.attack.name": "Attack",
    "move.attack.narrative.hit": "Ko attacks Enemy{hitLocation}.",
    "move.attack.narrative.action": "Ko attacks Enemy.",
    "trap.puddle.narrative.triggered.3": "Ko trips into a puddle!",
    "binding.legs.short": "legs",
    "binding.arms.short": "arms",
    "binding.legs.narrative.increased": "Latex binds Ko's legs.",
    "binding.arms.narrative.increased": "Latex binds Ko's arms.",
    "buff.slow.narrative.added": "Ko is slowed.",
    "buff.slow.narrative.removed": "Ko regains her speed.",
    "buff.slow.narrative.changed": "Ko slows further.",
    "binding.legs.narrative.decreased": "Ko frees her legs.",
    "buff.mark.narrative.added": "Enemy is marked.",
    "enemy.narrative.spawned": "A creature emerges.",
    "character.narrative.incapacitated": "Ko can no longer act.",
    "ui.gameLog.interrupted": "Interrupted: {reason}",
    "failure.bindingRestriction.text": "Bindings prevent this action.",
    "ui.storyLog.hitLocation.single": " on her {binding}",
};
const p = new Presentation(strings);
const trigger: LogOutcome = {
    kind: "trap", trap: "puddle", triggers: [{ actor: "ko", amount: 20, severity: 3 }],
};
const binding = (id: string): LogOutcome => ({
    kind: "binding", target: "ko", binding: id, change: 20, blocked: 0,
    initial: { value: 0, level: "none" }, final: { value: 20, level: "moderate" },
});
const buff = (target: string, id: string): Extract<LogOutcome, { kind: "buff" }> => ({
    kind: "buff", buff: id, participants: [{ target, initial: { present: false }, final: { present: true } }],
});
const activation = (...outcomes: LogOutcome[]): TrapActivationOutcome => ({ kind: "trapActivation", outcomes: [trigger, ...outcomes] });
const flatten = (outcomes: LogOutcome[]): LogOutcome[] => outcomes.flatMap(outcome =>
    outcome.kind === "trapActivation" || outcome.kind === "bindingTick" ? flatten(outcome.outcomes) : [outcome]);
const move = (outcomes: LogOutcome[]): GameLogPresentationEntry => ({
    kind: "move", actor: "ko", move: "attack", targetIds: ["enemy"], outcomes,
});
const render = (entry: GameLogPresentationEntry, presentation = p) =>
    createStoryLogViewModel([entry], presentation, ["ko"])[0]?.paragraphs;
const trapEffects: LeafEvent[] = [
    { type: "trapTriggered", actor: "ko", trap: "puddle", amount: 20, severity: 3 },
    { type: "buffAdded", target: "ko", buff: "slow" },
    { type: "trapTriggeredEnd", actor: "ko", trap: "puddle", amount: 0 },
];
const event = (effects: LeafEvent[] = trapEffects): MoveEvent => ({
    type: "useMove", actor: "ko", move: "attack", effects,
    targets: [{ target: "enemy", result: "hit", effects: [
        { type: "enemyDamaged", target: "enemy", amount: 10 },
        { type: "buffAdded", target: "enemy", buff: "mark" },
    ] }],
});

describe("Story Log trap ordering", () => {
    it("narrates a triggered trap before a successful move and its consequences", () => {
        const entry = createGameLogEntries([event()])[0]!;
        expect(render(entry)).toEqual([
            { text: "Ko trips into a puddle! Ko is slowed." },
            { text: "Ko attacks Enemy. Enemy is marked." },
        ]);
    });

    it("narrates the interruption without describing the move as executed", () => {
        const interrupted = { ...event([...trapEffects, {
            type: "actionInterrupted", actor: "ko", reason: "bindingRestriction",
        }]), targets: [] } satisfies MoveEvent;
        expect(render(createGameLogEntries([interrupted])[0]!)).toEqual([{
            text: "Ko trips into a puddle! Ko is slowed.",
        }, { text: "Interrupted: Bindings prevent this action.", tone: "warning" }]);
    });

    it("keeps multiple bindings and statuses caused by a trap in one preceding paragraph", () => {
        const entry = move([buff("enemy", "mark"), activation(binding("legs"), binding("arms"), buff("ko", "slow"))]);
        const saved = JSON.stringify(entry);
        expect(render(entry)).toEqual([
            { text: "Ko trips into a puddle! Latex binds Ko's legs. Latex binds Ko's arms. Ko is slowed." },
            { text: "Ko attacks Enemy. Enemy is marked." },
        ]);
        expect(JSON.stringify(entry)).toBe(saved);
        expect(render(JSON.parse(saved))).toEqual(render(entry));
    });

    it("does not use trap bindings to describe where the move hit", () => {
        const entry = createGameLogEntries([event()])[0]!;
        const trap = entry.outcomes[0]!;
        if (trap.kind !== "trapActivation") throw new Error("Expected trap activation");
        trap.outcomes.splice(1, 0, binding("legs"));
        expect(render(entry)?.[1]?.text).toBe("Ko attacks Enemy. Enemy is marked.");
    });

    it("keeps spawned creatures and incapacitation after the trap trigger in its paragraph", () => {
        expect(render(move([
            activation(
                binding("legs"),
                { kind: "enemy", target: "enemy", operation: "spawned" },
                { kind: "character", target: "ko", operation: "incapacitated" },
                { kind: "interrupt", actor: "ko", reason: "bindingRestriction" },
            ),
        ]))).toEqual([{
            text: "Ko trips into a puddle! Latex binds Ko's legs. A creature emerges. Ko can no longer act. Interrupted: Bindings prevent this action.",
            tone: "danger",
        }]);
    });

    it("keeps move suppression from removing independent trap consequences", () => {
        const presentation = new Presentation({ ...strings, "move.attack.narrative.hit.suppress": "buff.*" });
        expect(render(createGameLogEntries([event()])[0]!, presentation)).toEqual([
            { text: "Ko trips into a puddle! Ko is slowed." },
            { text: "Ko attacks Enemy." },
        ]);
    });

    it("keeps the trap paragraph boundary when its trigger text is not authored", () => {
        const presentation = new Presentation({ ...strings, "trap.puddle.narrative.triggered.3": "..." });
        expect(render(createGameLogEntries([event()])[0]!, presentation)).toEqual([
            { text: "Ko is slowed." },
            { text: "Ko attacks Enemy. Enemy is marked." },
        ]);
    });

    it("leaves move paragraphs combined when no trap triggers", () => {
        expect(render(createGameLogEntries([event([])])[0]!)).toEqual([
            { text: "Ko attacks Enemy. Enemy is marked." },
        ]);
    });

    it.each([false, true])("keeps move-wide status cleanup after the move (targetless: %s)", targetless => {
        const action = event([...trapEffects, { type: "buffRemoved", target: "ko", buff: "slow" }]);
        if (targetless) action.targets = [];
        const entry = createGameLogEntries([action])[0]!;
        expect(render(entry)).toEqual([
            { text: "Ko trips into a puddle! Ko is slowed." },
            { text: targetless ? "Ko attacks Enemy. Ko regains her speed." : "Ko attacks Enemy. Enemy is marked. Ko regains her speed." },
        ]);
        const statuses = flatten(entry.outcomes).filter(outcome => outcome.kind === "buff" && outcome.buff === "slow");
        expect(statuses).toHaveLength(2);
        expect(entry.outcomes[0]).toMatchObject({ kind: "trapActivation", outcomes: [
            { kind: "trap" }, { kind: "buff", participants: [{ initial: { present: false }, final: { present: true } }] },
        ] });
        expect(statuses[1]).toMatchObject({ participants: [{ initial: { present: true }, final: { present: false } }] });
        expect(entry.outcomes).toContain(statuses[1]);
    });

    it("preserves separate binding transitions when the move reverses a trap's bindings", () => {
        const before: GameLogContext = {
            characters: [{ id: "ko", standing: false, data: {}, buffs: [], bindings: [] }],
            enemies: [], traps: [{ id: "puddle", amount: 20 }], turn: { round: 1 },
        };
        const after = structuredClone(before);
        after.traps = [];
        const action = event([
            trapEffects[0]!,
            { type: "bondageAdded", target: "ko", binding: "legs", amount: 20 },
            { type: "bondageAdded", target: "ko", binding: "arms", amount: 20 },
            trapEffects[1]!, trapEffects[2]!,
            { type: "bondageRemoved", target: "ko", binding: "legs", amount: -20 },
            { type: "bondageRemoved", target: "ko", binding: "arms", amount: -20 },
        ]);
        const outcomes = aggregateGameLogOutcomes(action, before, after);
        const entry = gameLogEntry(action, outcomes)!;
        expect(render(entry)).toEqual([
            { text: "Ko trips into a puddle! Latex binds Ko's legs. Latex binds Ko's arms. Ko is slowed." },
            { text: "Ko attacks Enemy. Enemy is marked. Ko frees her legs." },
        ]);
        expect(flatten(outcomes).filter(outcome => outcome.kind === "binding" && outcome.binding === "legs"))
            .toMatchObject([
                { initial: { value: 0, level: "none" }, final: { value: 20 } },
                { initial: { value: 20 }, final: { value: 0, level: "none" } },
            ]);
        // The combat view must not merge the trap's binding gain into the move's removal.
        const rows = createGameLogViewModel([entry], p, ["ko"])[0]!.rows;
        expect(rows[0]).toMatchObject({ kind: "trapActivation", rows: [{ kind: "binding" }, { kind: "buff" }] });
        expect(rows.filter(row => row.kind === "binding")).toHaveLength(1);
        expect(render(JSON.parse(JSON.stringify(entry)))).toEqual(render(entry));
    });

    it("keeps separate trap activations in separate paragraphs", () => {
        const entry = createGameLogEntries([event([...trapEffects, ...trapEffects])])[0]!;
        expect(render(entry)).toEqual([
            { text: "Ko trips into a puddle! Ko is slowed." },
            { text: "Ko trips into a puddle! Ko slows further." },
            { text: "Ko attacks Enemy. Enemy is marked." },
        ]);
    });

    it.each(["missing", "mismatched"])("does not claim move effects with a %s end marker", kind => {
        const effects = trapEffects.slice(0, -1);
        if (kind === "mismatched") effects.push({ type: "trapTriggeredEnd", actor: "ko", trap: "other", amount: 0 });
        const entry = createGameLogEntries([event(effects)])[0]!;
        expect(entry.outcomes.some(outcome => outcome.kind === "trapActivation")).toBe(false);
        expect(render(entry)).toEqual([
            { text: "Ko trips into a puddle!" },
            { text: "Ko attacks Enemy. Enemy is marked. Ko is slowed." },
        ]);
    });

    it("preserves trap grouping after saving and resolving a delayed status payload", () => {
        const initial: GameState = {
            characters: [makeFixtureCharacter("ko")], enemies: [], traps: [], encounter: null,
            turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
            difficulty: { id: "standard", playerModifiers: {}, enemyModifiers: {} },
        };
        const history = createGameLogHistory(initial);
        const action = { ...event(), targets: [] };
        history.record([{ event: action, state: initial }]);
        const restored = createGameLogHistory(initial, JSON.parse(JSON.stringify(history.getSaveState())));
        const after = structuredClone(initial);
        after.characters[0]!.buffs = [{ id: "slow", severity: 3 }];
        const entries = restored.record([{ event: { type: "changePhase", phase: "enemy", effects: [] }, state: after }]);
        expect(render(entries[0]!)).toEqual([
            { text: "Ko trips into a puddle! Ko is slowed." },
            { text: "Ko attacks Enemy." },
        ]);
        expect(entries[0]!.outcomes[0]).toMatchObject({ kind: "trapActivation", outcomes: [
            { kind: "trap" }, { kind: "buff", participants: [{ final: { details: { severity: 3 } } }] },
        ] });
    });

    it("reconstructs endpoints across trap activations, nested ticks and move consequences", () => {
        const before: GameLogContext = {
            characters: [{ id: "ko", standing: false, data: { focus: 10 }, buffs: [], bindings: [] }],
            enemies: [], traps: [{ id: "puddle", amount: 50 }], turn: { round: 1 },
        };
        const after = structuredClone(before);
        after.characters[0]!.data.focus = 8;
        after.characters[0]!.bindings = [{ id: "legs", value: 20, level: "moderate" }];
        after.traps[0]!.amount = 30;
        const action = event([
            trapEffects[0]!,
            { type: "dataChanged", target: "ko", name: "focus", amount: -2 },
            { type: "bondageAdded", target: "ko", binding: "legs", amount: 10 },
            { type: "bindingTickStart", target: "ko", binding: "arms" },
            { type: "bondageChanged", target: "ko", binding: "legs", amount: 2 },
            { type: "bindingTickEnd", target: "ko", binding: "arms" },
            trapEffects[2]!,
            { type: "trapTriggered", actor: "ko", trap: "puddle", amount: 10, severity: 3 },
            { type: "dataChanged", target: "ko", name: "focus", amount: -1 },
            { type: "bondageChanged", target: "ko", binding: "legs", amount: 8 },
            trapEffects[2]!,
            { type: "dataChanged", target: "ko", name: "focus", amount: 1 },
            { type: "trapAdded", actor: "ko", trap: "puddle", amount: 10 },
        ]);
        const outcomes = aggregateGameLogOutcomes(action, before, after);
        expect(outcomes.slice(0, 2).map(outcome => outcome.kind)).toEqual(["trapActivation", "trapActivation"]);
        const all = flatten(outcomes);
        expect(all.filter(outcome => outcome.kind === "binding").map(outcome => [outcome.initial?.value, outcome.final?.value]))
            .toEqual([[0, 10], [10, 12], [12, 20]]);
        expect(all.filter(outcome => outcome.kind === "resource").map(outcome => [outcome.initial, outcome.final]))
            .toEqual([[10, 8], [8, 7], [7, 8]]);
        expect(all.filter(outcome => outcome.kind === "trap").map(outcome => [outcome.initial, outcome.final, outcome.change]))
            .toEqual([[50, 30, -20], [30, 20, -10], [20, 30, 10]]);
        const rows = createGameLogViewModel([gameLogEntry(action, outcomes)!], p, ["ko"])[0]!.rows;
        expect(rows.slice(0, 2).map(row => row.kind)).toEqual(["trapActivation", "trapActivation"]);
        expect(rows[0]!.rows?.some(row => row.kind === "bindingTick")).toBe(true);
        expect(rows[2]?.kind).toBe("damage");
    });
});

describe("Combat Log trap activation headings", () => {
    const combat = new Presentation({
        ...strings,
        "trap.puddle.name": "Latex Puddle",
        "ui.gameLog.trapTriggered": "Triggered by {actor} x{amount}",
        "ui.gameLog.bindingOutcome": "{binding} {value}",
        "ui.gameLog.transition": "{initial} -> {final}",
    });
    const hidden: LogOutcome = { ...buff("ko", "slow"), summarized: true };
    const stockChange: LogOutcome = { kind: "trap", trap: "other", change: 5, triggers: [] };

    it.each<{ description: string; earlier: LogOutcome[] }>([
        { description: "a visible binding", earlier: [binding("legs")] },
        { description: "an invisible outcome and a binding", earlier: [hidden, binding("legs")] },
        { description: "a trap stock adjustment", earlier: [stockChange, binding("legs")] },
        { description: "only an invisible outcome", earlier: [hidden] },
    ])("keeps the triggering trap as the heading after $description", ({ earlier }) => {
        const reference = createGameLogViewModel([move([activation(...earlier, binding("arms"))])], combat, ["ko"])[0]!.rows[0]!;
        const reordered: TrapActivationOutcome = { kind: "trapActivation", outcomes: [...earlier, trigger, binding("arms")] };
        const input = move([reordered]);
        const saved = JSON.stringify(input);
        const parent = createGameLogViewModel([input], combat, ["ko"])[0]!.rows[0]!;
        expect(parent).toEqual(reference);
        expect(parent).toMatchObject({
            kind: "trapActivation", label: "Latex Puddle",
            values: [{ text: "Triggered by Ko x20", tone: "warning" }],
        });
        expect(parent.rows?.some(row => row.kind === "buff")).toBe(false);
        const bindings = parent.rows?.filter(row => row.kind === "binding");
        expect(bindings).toHaveLength(1);
        expect(bindings![0]!.values).toHaveLength(earlier.some(outcome => outcome.kind === "binding") ? 2 : 1);
        expect(bindings![0]!.values.every(value => value.binding)).toBe(true);
        expect(JSON.stringify(input)).toBe(saved);
    });
});
