import { describe, expect, it } from "vitest";
import type { EventFrame, GameState } from "../../src/engine/public/types";
import { makeFixtureCharacter } from "../../src/ui/web/app/fixtures/publicFixture";
import { createGameLogHistory } from "../../src/ui/web/app/viewModels/gameLogHistory";

const state = (): GameState => ({
    characters: [makeFixtureCharacter("hinari", { data: { subspace: 50 } }), makeFixtureCharacter("ko")],
    enemies: [], traps: [], encounter: null,
    turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
    difficulty: { id: "standard", playerModifiers: {}, enemyModifiers: {} },
});
const resourceFrame = (after: GameState, amount: number): EventFrame => ({
    state: after, event: { type: "useMove", actor: "hinari", move: "rockfall", targets: [], effects: [
        { type: "dataChanged", target: "hinari", name: "subspace", amount },
    ] },
});
const stanceFrame = (after: GameState, actor = "ko"): EventFrame => ({
    state: after, event: { type: "changeStance", actor, effects: [
        { type: "stanceSet", actor, stance: after.characters.find(character => character.id === actor)!.standing ? "standing" : "moving" },
    ] },
});

describe("graphical battle log history", () => {
    it("uses the original pre-action state and previous frame for each action", () => {
        const initial = state();
        const history = createGameLogHistory(initial);
        initial.characters[0]!.data.subspace = 999;
        const first = state();
        first.characters[0]!.data.subspace = 25;
        history.record([resourceFrame(first, -25)]);
        const second = structuredClone(first);
        second.characters[0]!.data.subspace = 10;
        const entries = history.record([resourceFrame(second, -15)]);
        expect(entries).toHaveLength(2);
        expect(entries[0]!.outcomes).toEqual([{ kind: "resource", target: "hinari", resource: "subspace", change: -25, initial: 50, final: 25, max: undefined }]);
        expect(entries[1]!.outcomes).toEqual([{ kind: "resource", target: "hinari", resource: "subspace", change: -15, initial: 25, final: 10, max: undefined }]);
        expect(history.record([])).toEqual(entries);
    });

    it("lets Pass 1 merge consecutive stance actions and omit recorded reversals", () => {
        const initial = state();
        const history = createGameLogHistory(initial);
        const first = structuredClone(initial);
        first.characters[1]!.standing = true;
        expect(history.record([stanceFrame(first)])).toHaveLength(1);
        const second = structuredClone(first);
        second.characters[0]!.standing = true;
        const merged = history.record([stanceFrame(second, "hinari")]);
        expect(merged).toHaveLength(1);
        expect(merged[0]!.kind === "stance" && merged[0]!.changes).toHaveLength(2);
        const third = structuredClone(second);
        third.characters[1]!.standing = false;
        expect(history.record([stanceFrame(third)])).toEqual([
            { kind: "stance", changes: [{ kind: "stance", actor: "hinari", initial: "moving", final: "standing" }], outcomes: [] },
        ]);
    });

    it("keeps identical top-level events separate and preserves phase/enemy events in end turn frames", () => {
        const initial = state();
        const history = createGameLogHistory(initial);
        const repeated = resourceFrame(initial, 0);
        history.record([repeated]);
        expect(history.record([structuredClone(repeated)])).toHaveLength(2);
        const enemy = structuredClone(initial);
        enemy.turn.phase = "enemy";
        const player = structuredClone(initial);
        player.turn.round = 2;
        const entries = history.record([
            { state: enemy, event: { type: "changePhase", phase: "enemy", effects: [] } },
            { state: enemy, event: { type: "useMove", actor: "skunkette1", move: "latexSpray", targets: [], effects: [] } },
            { state: player, event: { type: "changePhase", phase: "player", effects: [] } },
        ]);
        expect(entries.map(entry => entry.kind)).toEqual(["move", "move", "phase", "move", "phase"]);
        expect(entries[4]).toMatchObject({ kind: "phase", round: 2 });
    });

    it("starts an independent history with a new battle's initial state", () => {
        const first = createGameLogHistory(state());
        first.record([resourceFrame(state(), -10)]);
        const initial = state();
        initial.characters[0]!.data.subspace = 75;
        const after = structuredClone(initial);
        after.characters[0]!.data.subspace = 50;
        const fresh = createGameLogHistory(initial);
        expect(fresh.record([])).toEqual([]);
        const entries = fresh.record([resourceFrame(after, -25)]);
        expect(entries).toHaveLength(1);
        expect(entries[0]!.outcomes[0]).toMatchObject({ kind: "resource", initial: 75, final: 50 });
    });
});
