import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
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
        const tracker = createBattleResultTracker(engine.getGameState());
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
        expect(tracker.getStats().progress).toEqual({ enemies: 1 });
    });

    it("counts damaging actions, summing multi-hit, AoE and untargeted damage before comparing maxima", () => {
        const state = initial();
        const tracker = createBattleResultTracker(state);
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
        const tracker = createBattleResultTracker(state);
        tracker.record({ type: "move", actor: "hero", move: "multi", targets: [] },
            result(state, move("hero", "multi", [[damage(20)]]), move("hero", "multi", [[damage(30)]])), state);
        expect(tracker.getStats().hits).toEqual({ count: 1, total: 50, max: 50, maxMove: "multi" });
    });

    it("counts each enemy binding action once, summing all zones and targets and excluding blocked binding and ticks", () => {
        const state = initial();
        const tracker = createBattleResultTracker(state);
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
        const tracker = createBattleResultTracker(state);
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
        const tracker = createBattleResultTracker(state);
        tracker.record({ type: "endTurn" }, result(state, move("boss", "bind", [[binding(8), binding(-8)]])), state);
        expect(tracker.getStats().peakBinding).toBe(38);
    });

    it("counts incapacitation transitions and releases from defeated linked captors without counting repeated snapshots", () => {
        const state = initial();
        const tracker = createBattleResultTracker(state);
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


    it("uses weighted boss HP and ignores other enemies when bosses are present", () => {
        const state = initial();
        state.enemies = [
            makePublicEnemy("boss1", { rank: "boss", maxHp: 300, currHp: 60 }),
            makePublicEnemy("boss2", { rank: "boss", maxHp: 100, currHp: 40 }),
            makePublicEnemy("add", { maxHp: 500, currHp: 500 }),
        ];
        const tracker = createBattleResultTracker(state);
        expect(tracker.getStats().progress).toEqual({ boss: 0.25 });
        const defeated = structuredClone(state);
        defeated.enemies = defeated.enemies.filter(enemy => enemy.rank !== "boss");
        tracker.record({ type: "endTurn" }, result(defeated, move("add", "wait")), defeated);
        expect(tracker.getStats().progress).toEqual({ boss: 0 });
    });

    it("combines all non-boss HP, retaining defeated enemies in the denominator", () => {
        const state = initial();
        state.enemies = [
            makePublicEnemy("large", { maxHp: 300, currHp: 60 }),
            makePublicEnemy("small", { maxHp: 100, currHp: 40 }),
        ];
        const tracker = createBattleResultTracker(state);
        expect(tracker.getStats().progress).toEqual({ enemies: 0.25 });
        const defeated = structuredClone(state);
        defeated.enemies = [defeated.enemies[1]];
        tracker.record({ type: "endTurn" }, result(defeated, move("small", "wait")), defeated);
        expect(tracker.getStats().progress).toEqual({ enemies: 0.1 });
    });

    it("counts summons only after they appear and reflects their starting HP and later healing", () => {
        const state = initial();
        state.enemies[0].currHp = 40;
        const tracker = createBattleResultTracker(state);
        expect(tracker.getStats().progress).toEqual({ enemies: 0.4 });
        const summoned = structuredClone(state);
        summoned.enemies.push(makePublicEnemy("reserve", { currHp: 50 }));
        tracker.record({ type: "endTurn" }, result(summoned, move("boss", "summon")), summoned);
        expect(tracker.getStats().progress).toEqual({ enemies: 0.45 });
        const healed = structuredClone(summoned);
        healed.enemies[0].currHp = 80;
        tracker.record({ type: "endTurn" }, result(healed, move("boss", "heal")), healed);
        expect(tracker.getStats().progress).toEqual({ enemies: 0.65 });
        const lost = structuredClone(healed);
        lost.enemies = [lost.enemies[1]];
        lost.turn.outcome = "defeat";
        tracker.record({ type: "endTurn" }, result(lost, move("reserve", "final")), lost);
        expect(tracker.getStats().progress).toEqual({ enemies: 0.25 });
    });

    it("switches to boss HP when a boss first appears", () => {
        const state = initial();
        const tracker = createBattleResultTracker(state);
        const summoned = structuredClone(state);
        summoned.enemies.push(makePublicEnemy("newBoss", { rank: "boss", currHp: 30 }));
        tracker.record({ type: "endTurn" }, result(summoned, move("boss", "summon")), summoned);
        expect(tracker.getStats().progress).toEqual({ boss: 0.3 });
    });

    it.each([{ enemies: [] }, { enemies: [makePublicEnemy("zero", { maxHp: 0, currHp: 0 })] }])(
        "handles encounters with no enemy HP without division by zero", ({ enemies }) => {
            const tracker = createBattleResultTracker(makePublicGameState({ enemies }));
            expect(tracker.getStats().progress).toEqual({ enemies: 0 });
        });

    it("returns independent HP snapshots", () => {
        const tracker = createBattleResultTracker(initial());
        tracker.getStats().progress.enemies = 0;
        expect(tracker.getStats().progress).toEqual({ enemies: 1 });
    });

    it("keeps the first terminal round and ignores actions after battle ends", () => {
        const state = initial();
        const tracker = createBattleResultTracker(state);
        const terminal = structuredClone(state);
        terminal.enemies[0].currHp = 25;
        terminal.turn = { round: 12, step: 4, phase: "enemy", outcome: "defeat" };
        const final = structuredClone(terminal);
        final.turn.round = 13;
        tracker.record({ type: "endTurn" }, { success: true, actions: [], frames: [
            { state: terminal, event: move("boss", "bind") },
            { state: final, event: { type: "changePhase", phase: "player", effects: [] } },
        ] }, final);
        expect(tracker.getStats().progress).toEqual({ enemies: 0.25 });
        expect(tracker.getStats().rounds).toBe(12);
        tracker.record({ type: "endTurn" }, result(final, move("boss", "ignored")), final);
        expect(tracker.getStats().actions).toBe(1);
    });
});
