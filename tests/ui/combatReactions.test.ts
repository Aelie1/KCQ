import { describe, expect, it } from "vitest";
import type { EventFrame, GameEvent, HitBand, LeafEvent } from "../../src/engine/public/types";
import { collectCombatReactions } from "../../src/ui/web/app/combatReactions";
import { battleOverviewFixture as fixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { incomingBindingBattle } from "../helpers/incomingBindingBattle";

const initial = () => structuredClone(fixture.state);
function move(band: HitBand, effects: LeafEvent[] = []): GameEvent {
    return {
        type: "useMove", actor: "skunkette1", move: "pounce", effects: [],
        targets: [{ target: "ko", result: band, effects }]
    };
}
function frame(event: GameEvent): EventFrame { return { event, state: initial() }; }

describe("semantic combat reactions", () => {
    it.each(["miss", "none", "graze", "hit", "crit"] as const)("keeps %s accuracy local to resolved effects", band => {
        const cues = collectCombatReactions([frame(move(band))], initial());
        expect(cues).toEqual([{ kind: "actor", entity: "skunkette1", treatment: "actor" }]);
    });
    it("anchors multiple resolved changes to each frame's actual binding endpoint", () => {
        const first = frame(move("hit", [
            { type: "bondageBlocked", target: "ko", binding: "latexHead", amount: 200 },
            { type: "bondageChanged", target: "ko", binding: "latexHead", amount: 8 },
            { type: "bondageChanged", target: "ko", binding: "latexHead", amount: -3 },
        ]));
        first.state.characters[0]!.bindings[0]!.value = 25;
        const second = frame(move("graze", [{ type: "bondageChanged", target: "ko", binding: "latexHead", amount: 6 }]));
        second.state.characters[0]!.bindings[0]!.value = 31;
        const cues = collectCombatReactions([first, second], initial()).filter(cue => cue.kind === "binding");
        expect(cues.map(({ from, to, treatment }) => ({ from, to, treatment }))).toEqual([
            { from: 20, to: 28, treatment: "increase" },
            { from: 28, to: 25, treatment: "recovery" },
            { from: 25, to: 31, treatment: "increase" },
        ]);
    });
    it("handles a removed binding and ignores blocked or zero changes", () => {
        const f = frame(move("hit", [
            { type: "bondageRemoved", target: "ko", binding: "latexHead", amount: -20 },
            { type: "bondageChanged", target: "ko", binding: "latexArms", amount: 0 },
        ]));
        f.state.characters[0]!.bindings = [];
        expect(collectCombatReactions([f], initial()).filter(cue => cue.kind === "binding"))
            .toEqual([{ kind: "binding", entity: "ko", detail: "latexHead", treatment: "recovery", from: 20, to: 0 }]);
    });
    it.each(["graze", "hit", "crit"] as const)("uses %s for HP damage and distinguishes healing", band => {
        const f = frame({
            type: "useMove", actor: "ko", move: "telekinesis", effects: [
                { type: "enemyHealed", target: "queen", amount: 5 },
                { type: "damageBlocked", target: "queen", amount: 50 },
            ], targets: [{ target: "queen", result: band, effects: [{ type: "enemyDamaged", target: "queen", amount: 10 }] }]
        });
        expect(collectCombatReactions([f], initial()).filter(cue => cue.kind === "hp")).toEqual([
            { kind: "hp", entity: "queen", "floatDelay": 0, amount: 10, treatment: "damage", strength: band },
            { kind: "hp", entity: "queen", "floatDelay": 180, amount: 5, treatment: "healing", strength: "hit" },
        ]);
    });
    it("retains each HP event amount and ignores zero damage and healing", () => {
        const event: GameEvent = {
            type: "changePhase", phase: "player", effects: [
                { type: "enemyDamaged", target: "queen", amount: 14 },
                { type: "enemyDamaged", target: "queen", amount: 14 },
                { type: "enemyHealed", target: "skunk1", amount: 7 },
                { type: "enemyDamaged", target: "queen", amount: 0 },
                { type: "enemyHealed", target: "queen", amount: 0 },
            ]
        };
        // Identical snapshots still produce every resolved nonzero event.
        expect(collectCombatReactions([frame(event)], initial())).toEqual([
            { kind: "hp", entity: "queen", "floatDelay": 0, amount: 14, treatment: "damage", strength: "hit" },
            { kind: "hp", entity: "queen", "floatDelay": 180, amount: 14, treatment: "damage", strength: "hit" },
            { kind: "hp", entity: "skunk1", "floatDelay": 0, amount: 7, treatment: "healing", strength: "hit" },
        ]);
    });
    it("cues buff additions, updates and removals by stable owner and buff IDs", () => {
        const f = frame({
            type: "changePhase", phase: "player", effects: [
                { type: "buffAdded", target: "ko", buff: "guarded" },
                { type: "buffUpdated", target: "ko", buff: "guarded" },
                { type: "buffRemoved", target: "queen", buff: "weakened" },
            ]
        });
        expect(collectCombatReactions([f], initial()).filter(cue => cue.kind === "buff").map(cue => [cue.entity, cue.detail, cue.treatment]))
            .toEqual([["ko", "guarded", "added"], ["ko", "guarded", "updated"], ["queen", "weakened", "removed"]]);
    });
    it("does not react to silent duration reduction or infer attacks from changing state", () => {
        const before = initial();
        const buff = before.characters[0]!.buffs[0]!;
        buff.duration = 3;
        const after = structuredClone(before);
        after.characters[0]!.buffs[0]!.duration = 2;
        after.enemies[0]!.currHp -= 10;
        const cues = collectCombatReactions([{ state: after, event: { type: "changePhase", phase: "player", effects: [] } }], before);
        expect(cues).toEqual([]);
    });
    it("does not flash an interrupted actor and includes escape actions", () => {
        const interrupted = frame({
            type: "useMove", actor: "ko", move: "telekinesis", targets: [], effects: [
                { type: "actionInterrupted", actor: "ko", reason: "actorIncapacitated" },
            ]
        });
        expect(collectCombatReactions([interrupted], initial())).toEqual([]);
        expect(collectCombatReactions([frame({ type: "useEscape", actor: "ko", target: "ko", effects: [] })], initial()))
            .toEqual([{ kind: "actor", entity: "ko", treatment: "actor" }]);
    });
    it("preserves real combat frames, ordering and authoritative results", () => {
        const battle = incomingBindingBattle({ repeatFirst: true });
        const reference = incomingBindingBattle({ repeatFirst: true });
        const result = battle.engine.executeAction({ type: "endTurn" });
        const expected = reference.engine.executeAction({ type: "endTurn" });
        if (!result.success) throw new Error("End Turn failed");
        const saved = structuredClone(result);
        const cues = collectCombatReactions(result.frames, battle.initial);
        const moves = result.frames.filter(frame => frame.event.type === "useMove");
        expect(cues.filter(cue => cue.kind === "actor").map(cue => cue.entity))
            .toEqual(moves.map(frame => frame.event.type === "useMove" ? frame.event.actor : ""));
        expect(cues.filter(cue => cue.kind === "binding").every(cue => cue.to! > cue.from!)).toBe(true);
        expect(result).toEqual(saved);
        expect(result).toEqual(expected);
        expect(battle.engine.getGameState()).toEqual(reference.engine.getGameState());
    });
});
