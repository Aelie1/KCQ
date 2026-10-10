import { describe, expect, it } from "vitest";
import type { EventFrame } from "../../src/engine/public/types";
import { collectCombatReactions } from "../../src/ui/web/app/combatReactions";
import { battleOverviewFixture as fixture } from "../../src/ui/web/app/fixtures/battleOverview";

describe("semantic enemy defeat cues", () => {
    it("collects target and action-level defeat leaves independently", () => {
        const frame: EventFrame = { state: structuredClone(fixture.state), event: {
            type: "useMove", actor: "ko", move: "telekinesis",
            targets: [{ target: "skunkette1", result: "crit", effects: [
                { type: "enemyDamaged", target: "skunkette1", amount: 14 },
                { type: "enemyDefeated", target: "skunkette1" },
            ] }],
            effects: [{ type: "enemyDefeated", target: "skunk1" }],
        } };
        const saved = structuredClone(frame);
        expect(collectCombatReactions([frame], fixture.state).filter(cue => cue.kind === "defeat")).toEqual([
            { kind: "defeat", entity: "skunkette1", treatment: "defeated", delay: 0 },
            { kind: "defeat", entity: "skunk1", treatment: "defeated", delay: 0 },
        ]);
        expect(frame).toEqual(saved);
    });

    it("reuses each killing damage cue's stagger and ignores later damage or healing", () => {
        const frame: EventFrame = { state: fixture.state, event: {
            type: "useMove", actor: "ko", move: "telekinesis",
            targets: [
                { target: "skunkette1", result: "crit", effects: [
                    { type: "enemyDamaged", target: "skunkette1", amount: 14 },
                    { type: "enemyDamaged", target: "skunk1", amount: 5 },
                    { type: "enemyDamaged", target: "skunkette1", amount: 14 },
                    { type: "enemyHealed", target: "skunkette1", amount: 1 },
                    { type: "enemyDefeated", target: "skunkette1" },
                    { type: "enemyDamaged", target: "skunkette1", amount: 2 },
                ] },
                { target: "skunk1", result: "hit", effects: [
                    { type: "enemyDamaged", target: "skunk1", amount: 6 },
                    { type: "enemyDamaged", target: "skunk1", amount: 7 },
                ] },
            ],
            effects: [{ type: "enemyDefeated", target: "skunk1" }],
        } };
        const cues = collectCombatReactions([frame], fixture.state);
        for (const [id, amount] of [["skunkette1", 14], ["skunk1", 7]] as const) {
            const killingHit = cues.filter(cue => cue.kind === "hp" && cue.entity === id && cue.amount === amount).at(-1)!;
            expect(cues.find(cue => cue.kind === "defeat" && cue.entity === id)!.delay).toBe(killingHit.floatDelay);
        }
    });

    it("does not reuse a damage cue from a different frame", () => {
        const frames: EventFrame[] = [
            { state: fixture.state, event: { type: "changePhase", phase: "enemy", effects: [
                { type: "enemyDamaged", target: "skunkette1", amount: 5 },
                { type: "enemyDamaged", target: "skunkette1", amount: 5 },
            ] } },
            { state: fixture.state, event: { type: "changePhase", phase: "player", effects: [
                { type: "enemyDefeated", target: "skunkette1" },
            ] } },
        ];
        expect(collectCombatReactions(frames, fixture.state).find(cue => cue.kind === "defeat")!.delay).toBe(0);
    });

    it("does not infer a defeat from zero HP or an empty enemy snapshot", () => {
        const state = structuredClone(fixture.state);
        state.enemies[0]!.currHp = 0;
        const frame: EventFrame = { state, event: { type: "changePhase", phase: "player", effects: [] } };
        expect(collectCombatReactions([frame], fixture.state)).toEqual([]);
        frame.state.enemies = [];
        expect(collectCombatReactions([frame], fixture.state)).toEqual([]);
    });
});
