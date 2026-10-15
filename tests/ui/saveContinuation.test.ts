import { describe, expect, it } from "vitest";
import type { ActionSuccess, EventFrame, GameEvent, GameState } from "../../src/engine/public/types";
import { createGameLogEntries } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createGameLogViewModel } from "../../src/ui/web/app/viewModels/gameLog";
import { createGameLogHistory } from "../../src/ui/web/app/viewModels/gameLogHistory";
import { createBattleResultTracker } from "../../src/ui/web/app/viewModels/battleResult";
import { makePublicBinding, makePublicCharacter, makePublicEnemy, makePublicGameState } from "../helpers/publicTestData";

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const initial = () => makePublicGameState({
    characters: [makePublicCharacter("hinari", { data: { subspace: 50 } }), makePublicCharacter("ko")],
    enemies: [makePublicEnemy("boss", { rank: "boss" })],
});
const stance = (state: GameState, actor = "ko"): EventFrame => ({ state, event: {
    type: "changeStance", actor, effects: [{ type: "stanceSet", actor,
        stance: state.characters.find(character => character.id === actor)!.standing ? "standing" : "moving" }],
} });
const phase = (state: GameState): EventFrame => ({ state, event: { type: "changePhase", phase: "player", effects: [] } });

function expectLogContinuation(start: GameState, frames: EventFrame[]) {
    const uninterrupted = createGameLogHistory(start);
    const expected = uninterrupted.record(frames);
    expect(expected).toEqual(createGameLogEntries(frames, start));
    for (let split = 0; split <= frames.length; split++) {
        const history = createGameLogHistory(start);
        history.record(frames.slice(0, split));
        const restored = createGameLogHistory(frames[split - 1]?.state ?? start, json(history.getSaveState()));
        expect(restored.record(frames.slice(split)), `split ${split}`).toEqual(expected);
        expect(json(restored.getSaveState())).toEqual(json(uninterrupted.getSaveState()));
    }
}

describe("saved game log continuation", () => {
    it("continues cancelled stance runs, actor ordering, resources and invisible event barriers", () => {
        const start = initial();
        const first = structuredClone(start);
        first.characters[1]!.standing = true;
        const reverse = structuredClone(first);
        reverse.characters[1]!.standing = false;
        const other = structuredClone(reverse);
        other.characters[0]!.standing = true;
        const again = structuredClone(other);
        again.characters[1]!.standing = true;
        const resource = structuredClone(again);
        resource.characters[0]!.data.subspace = 25;
        const barrier: EventFrame = { state: first, event: { type: "loadCharacter", id: "ko", success: true, effects: [] } };
        expectLogContinuation(start, [stance(first), stance(reverse), stance(other, "hinari"), stance(again),
            { state: resource, event: { type: "useMove", actor: "hinari", move: "rockfall", targets: [], effects: [
                { type: "dataChanged", target: "hinari", name: "subspace", amount: -25 },
            ] } }, stance(reverse)]);
        expectLogContinuation(start, [stance(first), barrier, stance(reverse)]);
    });

    it("recovers delayed reciprocal buff payloads and transition summaries across restoration", () => {
        const start = initial();
        const hidden = structuredClone(start);
        const active = structuredClone(hidden);
        active.characters[0]!.buffs = [{ id: "linked", severity: 3, linkedEntity: "ko" }];
        active.characters[1]!.buffs = [{ id: "linked", severity: 3, linkedEntity: "hinari" }];
        const later = structuredClone(active);
        later.characters.forEach(character => { character.buffs[0]!.severity = 1; });
        const added: EventFrame = { state: hidden, event: { type: "useMove", actor: "ko", move: "capture", targets: [], effects: [
            { type: "buffAdded", target: "hinari", buff: "linked" },
            { type: "characterIncapacitated", target: "hinari" },
            { type: "buffAdded", target: "ko", buff: "linked" },
        ] } };
        expectLogContinuation(start, [added, phase(hidden), phase(active), phase(later)]);
        const half = structuredClone(active);
        half.characters[1]!.buffs = [];
        expectLogContinuation(start, [added, phase(half), phase(active)]);
    });

    it("never borrows delayed payloads across mutations or a despawn", () => {
        const start = initial();
        const active = initial();
        active.characters[1]!.buffs = [{ id: "pounce", severity: 3 }];
        const add: EventFrame = { state: start, event: { type: "useMove", actor: "ko", move: "wait", targets: [], effects: [
            { type: "buffAdded", target: "ko", buff: "pounce" },
        ] } };
        const update: GameEvent = { type: "useMove", actor: "ko", move: "wait", targets: [], effects: [
            { type: "buffUpdated", target: "ko", buff: "pounce" },
        ] };
        expectLogContinuation(start, [add, { state: active, event: update }, phase(active)]);
        expectLogContinuation(start, [add, phase({ ...start, characters: [] }), phase(active)]);
        expectLogContinuation(start, [add, { state: start, event: update }, phase(active)]);
    });

    it("keeps restored history independent and localizes saved semantic IDs at display time", () => {
        const start = initial();
        const history = createGameLogHistory(start);
        history.record([{ state: start, event: { type: "useMove", actor: "hinari", move: "rockfall", targets: [], effects: [] } }]);
        const saved = json(history.getSaveState());
        const restored = createGameLogHistory(start, saved);
        saved.entries.length = 0;
        history.getSaveState().previous.characters.length = 0;
        const entries = restored.record([]);
        const first = createGameLogViewModel(entries, new Presentation({ "entity.hinari.name": "First name", "move.rockfall.name": "First move" }));
        const second = createGameLogViewModel(entries, new Presentation({ "entity.hinari.name": "Second name", "move.rockfall.name": "Second move" }));
        expect(first[0]).toMatchObject({ actor: "First name", title: "First move" });
        expect(second[0]).toMatchObject({ actor: "Second name", title: "Second move" });
        expect(history.record([])).toHaveLength(1);
    });
});

describe("saved statistics continuation", () => {
    it("retains peaks, departed enemies, transition context, summaries and terminal rounds at every boundary", () => {
        const start = initial();
        start.characters[0]!.bindings = [makePublicBinding("arms", { value: 10 })];
        const captured = structuredClone(start);
        captured.characters[0]!.buffs = [{ id: "skunked", linkedEntity: "boss", statuses: [{ id: "incapacitated", value: 1 }] }];
        const rescued = structuredClone(captured);
        rescued.characters[0]!.buffs = [];
        rescued.enemies = [];
        const summoned = structuredClone(rescued);
        summoned.enemies = [makePublicEnemy("minion", { currHp: 30 })];
        const terminal = structuredClone(summoned);
        terminal.turn = { round: 12, step: 4, phase: "enemy", outcome: "defeat" };
        const final = structuredClone(terminal);
        final.turn.round = 13;
        const move = (actor: string, effects: GameEvent["effects"]): GameEvent => ({ type: "useMove", actor, move: "attack", targets: [], effects });
        const action = { type: "endTurn" } as const;
        const results: { state: GameState; result: ActionSuccess }[] = [
            { state: captured, result: { success: true, actions: [], frames: [{ state: captured, event: move("boss", [
                { type: "bondageChanged", target: "hinari", binding: "arms", amount: 8 },
                { type: "bondageChanged", target: "hinari", binding: "arms", amount: -8 },
            ]) }] } },
            { state: captured, result: { success: true, actions: [], frames: [phase(captured)] } },
            { state: rescued, result: { success: true, actions: [], frames: [{ state: rescued, event: move("ko", [
                { type: "enemyDamaged", target: "boss", amount: 100 }, { type: "enemyDefeated", target: "boss" },
            ]) }] } },
            { state: summoned, result: { success: true, actions: [], frames: [{ state: summoned, event: move("boss", [
                { type: "bondageChanged", target: "hinari", binding: "arms", amount: 20 },
                { type: "bondageChanged", target: "hinari", binding: "arms", amount: -20 },
            ]) }] } },
            { state: final, result: { success: true, actions: [], frames: [phase(terminal), phase(final)] } },
            { state: final, result: { success: true, actions: [], frames: [phase(final)] } },
        ];
        const uninterrupted = createBattleResultTracker(start);
        for (const item of results) uninterrupted.record(action, item.result, item.state);
        expect(uninterrupted.getStats()).toMatchObject({ peakBinding: 30, incapacitations: 1, rescues: 1,
            rounds: 12, actions: 5, progress: { boss: 0 }, hits: { count: 1, total: 100 } });
        for (let split = 0; split <= results.length; split++) {
            const tracker = createBattleResultTracker(start);
            for (const item of results.slice(0, split)) tracker.record(action, item.result, item.state);
            const saved = json(tracker.getSaveState());
            const restored = createBattleResultTracker(results[split - 1]?.state ?? start, saved);
            expect(restored.getStats()).toEqual(tracker.getStats());
            saved.stats.actions = 999;
            saved.enemyHp.length = 0;
            for (const item of results.slice(split)) restored.record(action, item.result, item.state);
            expect(restored.getStats(), `split ${split}`).toEqual(uninterrupted.getStats());
            expect(json(restored.getSaveState())).toEqual(json(uninterrupted.getSaveState()));
        }
    });
});
