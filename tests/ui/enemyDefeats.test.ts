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
            { kind: "defeat", entity: "skunkette1", treatment: "defeated" },
            { kind: "defeat", entity: "skunk1", treatment: "defeated" },
        ]);
        expect(frame).toEqual(saved);
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
