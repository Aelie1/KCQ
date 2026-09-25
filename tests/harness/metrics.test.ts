import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import type {
    Character,
    GameEvent,
    GameView,
    PlayerAction,
} from "../../src/engine/public/types";
import { runSingleFight } from "../../src/harness/harness";
import {
    createAccuracyCollector,
    createBondageCollector,
    createDamageCollector,
    createEscapeCollector,
    createIncapacitationCollector,
    createMoveUsageCollector,
    createOutcomeCollector,
    createResolutionCollector,
    createTrapCollector,
    MetricCollectorSet,
    metricLimitations,
    type MetricActionObservation,
    type MetricCollector,
} from "../../src/harness/metrics";
import { firstPolicy } from "../../src/harness/policy/first";

function character(
    id: string,
    bindings: Array<{ id: string; value: number; incapacitated?: boolean }> = [],
): Character {
    return {
        id,
        acted: false,
        standing: true,
        bonusEscapes: 0,
        bindings: bindings.map((binding) => ({
            id: binding.id,
            value: binding.value,
            level: "easy",
            data: {},
            status: binding.incapacitated
                ? [{ id: "incapacitated", value: 1 }]
                : [],
        })),
        buffs: [],
        modifiers: {},
        blockedMoveTypes: [],
        data: {},
    };
}

function view(values: {
    round?: number;
    outcome?: GameView["turn"]["outcome"];
    characters?: Character[];
    traps?: GameView["traps"];
} = {}): GameView {
    return {
        turn: {
            round: values.round ?? 1,
            step: 1,
            phase: "player",
            outcome: values.outcome ?? "ongoing",
        },
        characters: values.characters ?? [character("hero")],
        enemies: [],
        traps: values.traps ?? [],
        encounter: {
            id: "test",
            enemies: [],
            bindings: ["rope", "slime"],
            traps: ["trapPuddle"],
        },
        actions: [],
    };
}

function successfulAction(
    before: GameView,
    after: GameView,
    events: GameEvent[],
    action: PlayerAction = { type: "endTurn" },
    actionIndex = 1,
): MetricActionObservation {
    return {
        actionIndex,
        action,
        before,
        result: { success: true, actions: after, frames: events },
    };
}

describe("metric collector framework", () => {
    it("dispatches lifecycle observations to independent pluggable collectors", () => {
        const calls: string[] = [];
        const factory = (): MetricCollector<number> => ({
            id: "custom",
            onFightStart: () => calls.push("start"),
            onAction: () => calls.push("action"),
            onFightEnd: () => calls.push("end"),
            getResult: () => calls.length,
        });
        const initial = view();
        const collectors = new MetricCollectorSet([factory]);

        collectors.onFightStart({ view: initial });
        collectors.onAction(successfulAction(initial, initial, []));
        collectors.onFightEnd({ termination: "maxActions", view: initial, actionCount: 1 });

        expect(calls).toEqual(["start", "action", "end"]);
        expect(collectors.getResults()).toEqual({ custom: 3 });
        expect(() => new MetricCollectorSet([factory, factory]))
            .toThrow("Duplicate metric collector ID: custom");
    });

    it("appends custom results in the runner and preserves legacy metric fields", () => {
        const encounterId = createEngine(1).listEncounters()[0];
        if (encounterId === undefined) throw new Error("Expected a stock encounter");
        const customFactory = (): MetricCollector<number> => {
            let actions = 0;
            return {
                id: "customActions",
                onAction: () => { actions += 1; },
                getResult: () => actions,
            };
        };

        const result = runSingleFight({
            encounterId,
            engineSeed: 10,
            policySeed: 20,
            maxActions: 4,
            policy: firstPolicy,
            metricCollectors: [customFactory],
        });

        expect(result.collectorMetrics?.customActions).toBe(result.actionCount);
        expect(result.metrics).toEqual({
            decisions: result.collectorMetrics?.resolution.actionsObserved,
            damage: result.collectorMetrics?.damage.dealt,
            peakBondage: result.collectorMetrics?.bondage.party.peakTotal,
            escapes: result.collectorMetrics?.escapes.attempts,
        });
        expect(result.replay).toBeUndefined();
    });

    it("records win/loss and only reports resolution length for resolved fights", () => {
        const outcome = createOutcomeCollector();
        const resolution = createResolutionCollector();
        const final = view({ round: 4, outcome: "defeat" });
        const end = { termination: "defeat" as const, view: final, actionCount: 11 };

        outcome.onFightEnd?.(end);
        resolution.onFightEnd?.(end);

        expect(outcome.getResult()).toEqual({ termination: "defeat", win: false, loss: true });
        expect(resolution.getResult()).toEqual({
            resolved: true,
            actionsObserved: 11,
            roundsObserved: 4,
            actionsToResolution: 11,
            roundsToResolution: 4,
        });

        const timeout = createResolutionCollector();
        timeout.onFightEnd?.({ termination: "maxActions", view: final, actionCount: 7 });
        expect(timeout.getResult()).toMatchObject({
            resolved: false,
            actionsObserved: 7,
            roundsObserved: 4,
            actionsToResolution: null,
            roundsToResolution: null,
        });
    });

    it("tracks final and peak bondage independently by character and track", () => {
        const collector = createBondageCollector();
        const initial = view({
            characters: [character("hero", [{ id: "rope", value: 2 }]), character("ally")],
        });
        const after = view({
            characters: [
                character("hero", [
                    { id: "rope", value: 1 },
                    { id: "slime", value: 4 },
                ]),
                character("ally", [{ id: "rope", value: 3 }]),
            ],
        });

        collector.onFightStart?.({ view: initial });
        collector.onAction?.(successfulAction(initial, after, [
            {
                type: "useMove", actor: "enemy-1", move: "bind", targets: [], effects: [
                    { type: "bondageChanged", target: "hero", binding: "rope", amount: 8 },
                    { type: "bondageChanged", target: "hero", binding: "rope", amount: -9 },
                    { type: "bondageAdded", target: "hero", binding: "slime", amount: 4 },
                    { type: "bondageAdded", target: "ally", binding: "rope", amount: 3 },
                ]
            },
        ]));
        collector.onFightEnd?.({ termination: "maxActions", view: after, actionCount: 1 });

        expect(collector.getResult()).toEqual({
            party: { finalTotal: 8, peakTotal: 10 },
            characters: {
                hero: {
                    finalTotal: 5,
                    peakTotal: 10,
                    tracks: {
                        rope: { final: 1, peak: 10 },
                        slime: { final: 4, peak: 4 },
                    },
                },
                ally: {
                    finalTotal: 3,
                    peakTotal: 3,
                    tracks: {
                        rope: { final: 3, peak: 3 },
                        slime: { final: 0, peak: 0 },
                    },
                },
            },
        });
    });

    it("collects damage, player/enemy move usage, and accuracy bands from events", () => {
        const initial = view({ characters: [character("hero")] });
        const events: GameEvent[] = [
            {
                type: "useMove",
                actor: "hero",
                move: "strike",
                effects: [],
                targets: [
                    {
                        target: "enemy-1", result: "hit", effects: [
                            { type: "enemyDamaged", target: "enemy-1", amount: 7 },
                            { type: "enemyDamaged", target: "enemy-1", amount: 3 },
                        ]
                    },
                    { target: "enemy-2", result: "crit", effects: [] },
                ],
            },
            {
                type: "useMove",
                actor: "enemy-1",
                move: "spray",
                effects: [],
                targets: [
                    { target: "hero", result: "miss", effects: [] },
                    { target: "hero", result: "graze", effects: [] },
                ],
            },
        ];
        const observation = successfulAction(initial, initial, events);
        const damage = createDamageCollector();
        const moves = createMoveUsageCollector();
        const accuracy = createAccuracyCollector();
        moves.onFightStart?.({ view: initial });
        accuracy.onFightStart?.({ view: initial });

        damage.onAction?.(observation);
        moves.onAction?.(observation);
        accuracy.onAction?.(observation);

        expect(damage.getResult()).toEqual({
            dealt: 10,
            dealtByTarget: { "enemy-1": 10 },
            received: null,
        });
        expect(moves.getResult()).toEqual({
            player: { total: 1, byMove: { strike: 1 }, byActor: { hero: { strike: 1 } } },
            enemy: { total: 1, byMove: { spray: 1 }, byActor: { "enemy-1": { spray: 1 } } },
        });
        expect(accuracy.getResult()).toEqual({
            player: { miss: 0, graze: 0, hit: 1, crit: 1, none: 0 },
            enemy: { miss: 1, graze: 1, hit: 0, crit: 0, none: 0 },
        });
    });

    it("separates escape attempts, actual reductions, and assists", () => {
        const collector = createEscapeCollector();
        const state = view();
        collector.onAction?.(successfulAction(
            state,
            state,
            [{
                type: "useEscape", actor: "hero", target: "hero", effects: [
                    { type: "bondageChanged", target: "hero", binding: "rope", amount: -4 },
                ]
            }],
            { type: "escape", actor: "hero", target: "hero", binding: "rope" },
            1,
        ));
        collector.onAction?.(successfulAction(
            state,
            state,
            [{
                type: "useEscape", actor: "ally", target: "hero", effects: [
                    { type: "bondageRemoved", target: "hero", binding: "slime", amount: -2 },
                ]
            }],
            { type: "escape", actor: "ally", target: "hero", binding: "slime" },
            2,
        ));
        collector.onAction?.({
            actionIndex: 3,
            action: { type: "escape", actor: "hero", target: "hero", binding: "rope" },
            before: state,
            result: { success: false, reason: "escapeUnavailable" },
        });

        expect(collector.getResult()).toEqual({
            attempts: 3,
            successes: 2,
            assists: { attempts: 1, successes: 1 },
            byActor: {
                hero: { attempts: 2, successes: 1 },
                ally: { attempts: 1, successes: 1 },
            },
        });
    });

    it("tracks generic trap and puddle events plus final and peak amounts", () => {
        const collector = createTrapCollector();
        const initial = view({ traps: [{ id: "trapPuddle", amount: 5 }] });
        const after = view({ traps: [{ id: "trapPuddle", amount: 8 }] });
        collector.onFightStart?.({ view: initial });
        collector.onAction?.(successfulAction(initial, after, [
            {
                type: "changePhase", phase: "enemy", effects: [
                    { type: "trapAdded", actor: "enemy-1", trap: "trapPuddle", amount: 3 },
                    { type: "trapTriggered", actor: "hero", trap: "trapPuddle", amount: 2 },
                ]
            },
        ]));

        expect(collector.getResult()).toEqual({
            totals: {
                added: 1,
                removed: 0,
                triggered: 1,
                addedAmount: 3,
                removedAmount: 0,
                triggeredAmount: 2,
            },
            tracks: {
                trapPuddle: {
                    added: 1,
                    removed: 0,
                    triggered: 1,
                    addedAmount: 3,
                    removedAmount: 0,
                    triggeredAmount: 2,
                    finalAmount: 8,
                    peakAmount: 8,
                },
            },
        });
    });

    it("records first incapacitation transitions while leaving unsupported captures null", () => {
        const collector = createIncapacitationCollector();
        const healthy = view({ characters: [character("hero")] });
        const down = view({
            round: 2,
            characters: [character("hero", [{ id: "rope", value: 100, incapacitated: true }])],
        });
        collector.onFightStart?.({ view: healthy });
        collector.onAction?.(successfulAction(healthy, down, [], { type: "endTurn" }, 1));
        collector.onAction?.(successfulAction(down, healthy, [], { type: "endTurn" }, 2));
        collector.onAction?.(successfulAction(healthy, down, [], { type: "endTurn" }, 3));

        expect(collector.getResult()).toEqual({
            occurrences: 2,
            first: { action: 1, round: 2, character: "hero" },
            characters: {
                hero: { occurrences: 2, first: { action: 1, round: 2 } },
            },
            captures: null,
        });
        expect(metricLimitations).toMatchObject({
            damageReceived: expect.stringContaining("no character-damage event"),
            captures: expect.stringContaining("capture event"),
        });
    });
});
