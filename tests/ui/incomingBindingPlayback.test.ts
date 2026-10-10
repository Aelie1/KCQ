import { describe, expect, it } from "vitest";
import type { GameState } from "../../src/engine/public/types";
import { getThresholds } from "../../src/engine/public/mechanics";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { createBattleOverviewViewModel } from "../../src/ui/web/app/viewModels/battleOverview";
import { buildCombatPlaybackSteps } from "../../src/ui/web/app/combatPlayback";
import { incomingBindingBattle } from "../helpers/incomingBindingBattle";

function projections(state: GameState, actions: ReturnType<typeof incomingBindingBattle>["actions"]) {
    return createBattleOverviewViewModel(state, actions, getThresholds(), battleOverviewFixture.presentation)
        .party[0]!.bindings.map(({ current, change }) => [current, change]);
}
function resolve(options: Parameters<typeof incomingBindingBattle>[0] = {}) {
    const battle = incomingBindingBattle(options);
    const result = battle.engine.executeAction({ type: "endTurn" });
    if (!result.success) throw new Error("End Turn failed");
    const moves = result.frames.filter(frame => frame.event.type === "useMove");
    return { ...battle, result, moves };
}

describe("incoming bindings during combat playback", () => {
    it("projects all pending attacks, then combines displayed bindings with only the remaining attacks", () => {
        const b = resolve();
        expect(projections(b.initial, b.actions)).toEqual([[72, 11], [35, 20]]);
        expect(projections(b.result.frames[0]!.state, b.actions)).toEqual([[72, 11], [35, 20]]);
        expect(b.moves.map(frame => frame.state.enemies.map(enemy => enemy.intentions.length)))
            .toEqual([[0, 1, 1], [0, 0, 1], [0, 0, 0]]);
        expect(b.moves.map(frame => projections(frame.state, b.actions)))
            .toEqual([[[81, 3], [41, 14]], [[83, 1], [51, 4]], [[84, undefined], [55, undefined]]]);
        const steps = buildCombatPlaybackSteps(b.result.frames);
        expect(steps.map(step => projections(step.at(-1)!.state, b.actions)))
            .toEqual([[[81, 3], [41, 14]], [[83, 1], [51, 4]], [[84, undefined], [55, undefined]]]);
        expect(b.result.frames.at(-1)!.state).toEqual(b.engine.getGameState());
        expect(projections(b.engine.getGameState(), b.result.actions)).toEqual([[84, undefined], [55, undefined]]);
        expect(projections(b.initial, b.actions)).toEqual([[72, 11], [35, 20]]);
    });
    it("consumes one intention at a time even for repeated moves by the same enemy", () => {
        const b = resolve({ repeatFirst: true });
        expect(b.initial.enemies[0]!.intentions).toHaveLength(2);
        expect(b.moves.map(frame => frame.state.enemies[0]!.intentions.length)).toEqual([1, 0, 0, 0]);
        expect(projections(b.moves[0]!.state, b.actions)).toEqual([[81, 4], [41, 20]]);
        expect(b.moves.map(frame => frame.event.type === "useMove" && frame.event.move))
            .toEqual(["pounce", "pounce", "latexSpray", "latexShower"]);
    });
    it("recalculates a changed intention and consumes a miss without phantom damage", () => {
        const b = resolve({ interruption: "miss" });
        expect(b.initial.enemies[1]!.intentions[0]!.targets[0]!.band).toBe("hit");
        expect(b.moves[0]!.state.enemies[1]!.intentions[0]!.targets[0]!.band).toBe("miss");
        expect(b.moves[1]!.event).toMatchObject({ type: "useMove", actor: "skunk1", targets: [{ result: "miss", effects: [] }] });
        expect(b.moves[1]!.state.enemies[1]!.intentions).toEqual([]);
        expect(projections(b.moves[0]!.state, b.actions)).toEqual([[81, 1], [41, 4]]);
        expect(projections(b.moves[1]!.state, b.actions)).toEqual([[81, 1], [41, 4]]);
        expect(projections(b.moves[2]!.state, b.actions)).toEqual([[82, undefined], [45, undefined]]);
    });
    it("consumes a graze after applying its actual effects to both zones", () => {
        const b = resolve();
        expect(b.moves[2]!.event).toMatchObject({ type: "useMove", targets: [{ result: "graze", effects: [
            { type: "bondageChanged", binding: "latexHead", amount: 1 },
            { type: "bondageChanged", binding: "latexArms", amount: 4 },
        ] }] });
        expect(projections(b.moves[2]!.state, b.actions)).toEqual([[84, undefined], [55, undefined]]);
    });
    it.each(["cancel", "defeat", "blocksAttack", "skipsTurn"] as const)("drops %s actions at the snapshot where they stop being pending", interruption => {
        const b = resolve({ interruption });
        expect(b.moves.map(frame => frame.event.type === "useMove" && frame.event.actor)).toEqual(["skunkette1", "queen1"]);
        expect(b.moves[0]!.state.enemies.find(enemy => enemy.id === "skunk1")?.intentions ?? []).toEqual([]);
        expect(projections(b.moves[0]!.state, b.actions)).toEqual([[81, 1], [41, 4]]);
        expect(projections(b.moves[1]!.state, b.actions)).toEqual([[82, undefined], [45, undefined]]);
        expect(b.result.frames.at(-1)!.state).toEqual(b.engine.getGameState());
    });
    it("retains new next-round intentions at the authoritative final boundary", () => {
        const b = resolve({ nextRound: true });
        expect(b.moves.at(-1)!.state.enemies.every(enemy => enemy.intentions.length === 0)).toBe(true);
        const final = b.engine.getGameState();
        expect(final.enemies.map(enemy => enemy.intentions.length)).toEqual([1, 1, 1]);
        expect(b.result.frames.at(-1)!.state).toEqual(final);
        expect(projections(buildCombatPlaybackSteps(b.result.frames).at(-1)!.at(-1)!.state, b.result.actions))
            .toEqual(projections(final, b.result.actions));
    });
});
