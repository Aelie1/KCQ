import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import type { ContentLibrary } from "../../src/engine/public/library";
import type { ActionSuccess, GameEvent, GameState, LeafEvent } from "../../src/engine/public/types";
import { createBattle } from "../../src/ui/web/app";
import { createBattleResultTracker } from "../../src/ui/web/app/viewModels/battleResult";
import { makePublicBinding, makePublicCharacter, makePublicEnemy, makePublicGameState } from "../helpers/publicTestData";

function initial(): GameState {
    return makePublicGameState({
        characters: [makePublicCharacter("hero"), makePublicCharacter("ally")],
        enemies: [makePublicEnemy("boss", { defId: "boss" })],
        encounter: { id: "test", enemies: ["boss"], bindings: [], traps: [] },
    });
}
function library(): ContentLibrary {
    const result = createEngine().getLibrary();
    result.enemies.reserve = { id: "reserve", hp: 100, defense: 0, rank: "enemy", moves: [], passives: [] };
    result.encounters.test = { id: "test", stars: 1, enemies: [{ defId: "boss" }], bindings: [], traps: [], setup: [],
        reinforcements: [{ defId: "reserve" }, { defId: "reserve" }] };
    return result;
}
const result = (state: GameState, ...events: GameEvent[]): ActionSuccess => ({
    success: true, actions: [], frames: events.map(event => ({ event, state })),
});
const move = (actor: string, id: string, targets: LeafEvent[][] = [], effects: LeafEvent[] = []): GameEvent => ({
    type: "useMove", actor, move: id, effects,
    targets: targets.map((effects, index) => ({ target: "target" + index, result: "hit", effects })),
});
const damage = (amount: number): LeafEvent => ({ type: "enemyDamaged", target: "boss", amount });
const binding = (amount: number, target = "hero", id = "arms"): LeafEvent => ({
    type: "bondageChanged", target, binding: id, amount,
});

describe("battle result statistics from public frames", () => {
    it("tracks a real engine defeat from a fresh encounter without retaining replay data", () => {
        const engine = createEngine(12345);
        createBattle(engine, "plains_1", "mythic");
        const tracker = createBattleResultTracker(engine.getGameState(), engine.getLibrary());
        let actions = 0;
        let terminalRound = 0;
        while (engine.getGameState().turn.outcome === "ongoing" && actions < 100) {
            const action = { type: "endTurn" } as const;
            const result = engine.executeAction(action);
            expect(result.success).toBe(true);
            if (result.success) terminalRound = result.frames.find(frame => frame.state.turn.outcome === "defeat")?.state.turn.round ?? terminalRound;
            tracker.record(action, result, engine.getGameState());
            actions += 1;
        }
        expect(engine.getGameState().turn.outcome).toBe("defeat");
        expect(tracker.getStats().actions).toBe(actions);
        expect(tracker.getStats().rounds).toBe(terminalRound);
        expect(tracker.getStats().bindings.count).toBeGreaterThan(0);
        expect(tracker.getStats().incapacitations).toBe(3);
        expect(tracker.getStats().progress).toBe(0);
    });

    it("counts damaging actions, summing multi-hit, AoE and untargeted damage before comparing maxima", () => {
        const state = initial();
        const tracker = createBattleResultTracker(state, library());
        for (const event of [
            move("hero", "multi", [[damage(10), damage(12), damage(11), damage(9)]]),
            move("hero", "aoe", [[damage(20)], [damage(20)], [damage(20)]], [damage(8)]),
            move("hero", "miss", [], [{ type: "damageBlocked", target: "boss", amount: 500 }]),
            move("boss", "enemyDamage", [[damage(100)]]),
        ]) tracker.record({ type: "move", actor: "hero", move: "attack", targets: [] }, result(state, event), state);
        expect(tracker.getStats().hits).toEqual({ count: 2, total: 110, max: 68, maxMove: "aoe" });
        expect(tracker.getStats().actions).toBe(4);
    });

    it("counts one player action even when it contains multiple damaging move frames", () => {
        const state = initial();
        const tracker = createBattleResultTracker(state, library());
        tracker.record({ type: "move", actor: "hero", move: "multi", targets: [] },
            result(state, move("hero", "multi", [[damage(20)]]), move("hero", "multi", [[damage(30)]])), state);
        expect(tracker.getStats().hits).toEqual({ count: 1, total: 50, max: 50, maxMove: "multi" });
    });

    it("counts each enemy binding action once, summing all zones and targets and excluding blocked binding and ticks", () => {
        const state = initial();
        const tracker = createBattleResultTracker(state, library());
        const events = [
            move("boss", "spray", [[binding(10), binding(12, "hero", "legs")], [binding(16, "ally")]],
                [{ type: "bondageBlocked", target: "hero", binding: "arms", amount: 500 }]),
            move("boss", "bind", [[binding(12)]]),
            move("boss", "miss"),
            move("hero", "selfBind", [[binding(70)]]),
            { type: "changePhase", phase: "enemy", effects: [binding(99)] } as GameEvent,
        ];
        tracker.record({ type: "endTurn" }, result(state, ...events), state);
        expect(tracker.getStats().bindings).toEqual({ count: 2, total: 50, max: 38, maxMove: "spray" });
        expect(tracker.getStats().actions).toBe(1);
    });

    it("counts successful escapes by total removed, ignoring misses, blocked changes and rejected actions", () => {
        const state = initial();
        const tracker = createBattleResultTracker(state, library());
        const escape = { type: "escape", actor: "hero", target: "ally", binding: "arms" } as const;
        tracker.record(escape, result(state, { type: "useEscape", actor: "hero", target: "ally",
            effects: [binding(-5, "ally"), binding(-7, "ally", "legs"),
                { type: "bondageBlocked", target: "hero", binding: "arms", amount: -99 }] }), state);
        tracker.record(escape, result(state, { type: "useEscape", actor: "hero", target: "ally", effects: [] }), state);
        tracker.record(escape, { success: false, reason: "invalidActor" }, state);
        expect(tracker.getStats().escapes).toEqual({ count: 1, total: 12, max: 12, maxMove: undefined });
        expect(tracker.getStats().actions).toBe(2);
    });

    it("tracks the combined party peak even when binding rises and falls within a single frame", () => {
        const state = initial();
        state.characters[0].bindings = [makePublicBinding("arms", { value: 10 })];
        state.characters[1].bindings = [makePublicBinding("arms", { value: 20 })];
        const tracker = createBattleResultTracker(state, library());
        tracker.record({ type: "endTurn" }, result(state, move("boss", "bind", [[binding(8), binding(-8)]])), state);
        expect(tracker.getStats().peakBinding).toBe(38);
    });

    it("counts incapacitation transitions and releases from defeated linked captors without counting repeated snapshots", () => {
        const state = initial();
        const tracker = createBattleResultTracker(state, library());
        const captured = structuredClone(state);
        captured.characters[0].buffs = [{ id: "skunked", linkedEntity: "boss", statuses: [{ id: "incapacitated", value: 1 }] }];
        tracker.record({ type: "endTurn" }, result(captured, move("boss", "capture")), captured);
        tracker.record({ type: "endTurn" }, result(captured, move("boss", "wait")), captured);
        const rescued = structuredClone(captured);
        rescued.characters[0].buffs = [];
        rescued.enemies = [];
        tracker.record({ type: "move", actor: "ally", move: "attack", targets: ["boss"] },
            result(rescued, move("ally", "attack", [], [{ type: "enemyDefeated", target: "boss" }])), rescued);
        expect(tracker.getStats().incapacitations).toBe(1);
        expect(tracker.getStats().rescues).toBe(1);
    });

    it("includes future summons in the denominator and remaining HP without regressing at spawn or healing", () => {
        const state = initial();
        const tracker = createBattleResultTracker(state, library());
        const damaged = structuredClone(state);
        damaged.enemies[0].currHp = 40;
        tracker.record({ type: "move", actor: "hero", move: "attack", targets: ["boss"] },
            result(damaged, move("hero", "attack", [[damage(60)]])), damaged);
        expect(tracker.getStats().progress).toBeCloseTo(60 / 300);
        const summoned = structuredClone(damaged);
        summoned.enemies.push(makePublicEnemy("reserve1", { defId: "reserve" }));
        tracker.record({ type: "endTurn" }, result(summoned, move("boss", "summon")), summoned);
        expect(tracker.getStats().progress).toBeCloseTo(60 / 300);
        const healed = structuredClone(summoned);
        healed.enemies[0].currHp = 80;
        tracker.record({ type: "endTurn" }, result(healed, move("boss", "heal")), healed);
        expect(tracker.getStats().progress).toBeCloseTo(60 / 300);
        const lost = structuredClone(healed);
        lost.enemies = [makePublicEnemy("reserve1", { defId: "reserve", currHp: 50 })];
        lost.turn.outcome = "defeat";
        tracker.record({ type: "endTurn" }, result(lost, move("boss", "final")), lost);
        expect(tracker.getStats().progress).toBeCloseTo(150 / 300);
    });

    it("reserves reduced starting HP for half-health summons and keeps the first terminal round", () => {
        const state = initial();
        const content = library();
        content.encounters.test.reinforcements = [{ defId: "reserve", hpRatio: 0.5 }];
        const tracker = createBattleResultTracker(state, content);
        const terminal = structuredClone(state);
        terminal.enemies[0].currHp = 25;
        terminal.turn = { round: 12, step: 4, phase: "enemy", outcome: "defeat" };
        const final = structuredClone(terminal);
        final.turn.round = 13;
        tracker.record({ type: "endTurn" }, { success: true, actions: [], frames: [
            { state: terminal, event: move("boss", "bind") },
            { state: final, event: { type: "changePhase", phase: "player", effects: [] } },
        ] }, final);
        expect(tracker.getStats().progress).toBe(0.5);
        expect(tracker.getStats().rounds).toBe(12);
        tracker.record({ type: "endTurn" }, result(final, move("boss", "ignored")), final);
        expect(tracker.getStats().actions).toBe(1);
    });

    it.each([["plains_3", 7], ["forest_3", 10], ["tower_1", 13], ["tower_2", 13], ["tower_3", 13], ["outside", 14]])(
        "publishes all intended reinforcement spawns for %s", (id, count) => {
            const content = createEngine().getLibrary();
            expect(content.encounters[id].reinforcements).toHaveLength(count as number);
            for (const reinforcement of content.encounters[id].reinforcements!) {
                expect(content.enemies[reinforcement.defId].hp).toBeGreaterThan(0);
            }
            if (id === "plains_3") {
                expect(content.encounters[id].reinforcements!.filter(setup => setup.hpRatio === 0.5)).toHaveLength(2);
            }
        });
});
