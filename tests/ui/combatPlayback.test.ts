import { describe, expect, it } from "vitest";
import type { EventFrame, GameEvent } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { createBattle } from "../../src/ui/web/app";
import { buildCombatPlaybackSteps } from "../../src/ui/web/app/combatPlayback";

function frame(event: GameEvent): EventFrame {
    return { event, state: createStockEngine().getGameState() };
}
const move = (actor: string): EventFrame => frame({ type: "useMove", actor, move: "pounce", targets: [], effects: [] });
const phase = (): EventFrame => frame({ type: "changePhase", phase: "enemy", effects: [] });

describe("combat playback boundaries", () => {
    it("keeps nested outcomes together and folds phase bookkeeping into adjacent actions", () => {
        const first = move("skunkette1");
        first.event.effects.push({ type: "buffAdded", target: "ko", buff: "pounce" },
            { type: "bondageChanged", target: "ko", binding: "latexArms", amount: 10 });
        const second = move("skunk1");
        const third = move("queen1");
        const frames = [phase(), first, phase(), second, third, phase()];
        const steps = buildCombatPlaybackSteps(frames);
        expect(steps).toEqual([frames.slice(0, 3), [second], frames.slice(4)]);
        expect(steps.flat()).toEqual(frames);
        expect(steps[0]![1]).toBe(first);
        expect(first.event.effects).toHaveLength(2);
    });
    it("uses escape and stance action boundaries and has no delays for phase-only results", () => {
        const escape = frame({ type: "useEscape", actor: "ko", target: "ko", effects: [] });
        const stance = frame({ type: "changeStance", actor: "ko", effects: [] });
        expect(buildCombatPlaybackSteps([escape, stance])).toEqual([[escape], [stance]]);
        const frames = [phase(), phase()];
        expect(buildCombatPlaybackSteps(frames)).toEqual([frames]);
        expect(buildCombatPlaybackSteps([])).toEqual([]);
    });
    it("preserves real engine enemy ordering, every event and deterministic final state", () => {
        const engine = createStockEngine(12345);
        const reference = createStockEngine(12345);
        createBattle(engine, "plains_2", "mythic");
        createBattle(reference, "plains_2", "mythic");
        const result = engine.executeAction({ type: "endTurn" });
        const expected = reference.executeAction({ type: "endTurn" });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("End Turn failed");
        const original = structuredClone(result);
        const steps = buildCombatPlaybackSteps(result.frames);
        const moves = result.frames.filter(frame => frame.event.type === "useMove");
        expect(moves.length).toBeGreaterThan(1);
        expect(steps).toHaveLength(moves.length);
        expect(steps.map(step => step.find(frame => frame.event.type === "useMove")!.event)).toEqual(moves.map(frame => frame.event));
        expect(steps.flat()).toEqual(result.frames);
        expect(result).toEqual(original);
        expect(result).toEqual(expected);
        expect(engine.getGameState()).toEqual(reference.getGameState());
    });
});
