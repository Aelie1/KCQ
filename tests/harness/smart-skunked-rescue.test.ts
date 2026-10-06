import { describe, expect, it } from "vitest";
import type {
    ActionInfo,
    ActionView,
    Binding,
    Buff,
    Character,
    Enemy,
    GameState,
} from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import {
    evaluateSkunkedRescue,
    evaluateSmartDecision,
    generateSmartCandidates,
    SKUNKED_RESCUE_ACTOR_VALUE,
    SKUNKED_RESCUE_DELAY_PENALTY,
    skunkedRescueScorer,
    type SkunkedRescueBreakdown,
} from "../../src/harness/policy/smart";
import { createEmptyContentLibrary } from "../helpers/library";
import { makePublicActionView, makePublicBinding, makePublicCharacter, makePublicEnemy, makePublicGameState } from "../helpers/publicTestData";
import { STANDARD_DIFFICULTY } from "../helpers/state";

function binding(value = 80): Binding {
    return makePublicBinding("test-binding", {
        value,
        level: value >= 80 ? "overwhelming" : "heavy",
    });
}

function enemy(id: string, currHp = 200, defId = id): Enemy {
    return makePublicEnemy(id, { defId, maxHp: 200, currHp });
}

function linkedBuff(id: string, enemyId: string, incapacitated = true): Buff {
    return {
        id,
        linkedEntity: enemyId,
        ...(incapacitated
            ? { statuses: [{ id: "incapacitated" as const, value: 1 }] }
            : {}),
    };
}

function attack(damageByTarget: Readonly<Record<string, number>>): ActionInfo {
    return {
        move: { id: "test-attack", targetSide: "enemy", targets: 1, type: "arms" },
        available: true,
        effects: [],
        targets: Object.entries(damageByTarget).map(([target, damage]) => ({
            valid: true,
            target,
            effects: [],
            damage: { hit: { chance: 100, min: damage, max: damage } },
        })),
    };
}

function context(
    victim: Character,
    enemies: Enemy[],
    damageByTarget: Readonly<Record<string, number>>,
): PolicyContext {
    const library = createEmptyContentLibrary();
    library.characters[victim.id] = {
        id: victim.id, moves: [], passives: [], empoweredMoves: [],
    };
    library.bindings["test-binding"] = { id: "test-binding" };
    library.statuses.incapacitated = {
        id: "incapacitated",
        modifiers: [{}, { flags: ["incapacitated"] }],
    };
    const rescuer: Character = {
        ...makePublicCharacter("test-victim", { standing: true, buffs: [], bindings: [] }),
        id: "test-rescuer",
        standing: false,
    };
    const victimIncapacitated = victim.buffs.some((buff) =>
        buff.statuses?.some(({ id }) => id === "incapacitated")
    );
    const actions: ActionView[] = [makePublicActionView(rescuer.id, {
        moves: [attack(damageByTarget)],
        stance: { available: false, reason: "moveUnavailable" },
    }), makePublicActionView(victim.id, {
        available: !victimIncapacitated,
        ...(victimIncapacitated ? { reason: "actorIncapacitated" as const } : {}),
        stance: victimIncapacitated
            ? { available: false, reason: "actorIncapacitated" }
            : { available: false, reason: "moveUnavailable" },
    })];
    const state: GameState = makePublicGameState({
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        difficulty: STANDARD_DIFFICULTY,
        characters: [rescuer, victim],
        enemies,
        traps: [],
        encounter: null,
    });
    return {
        state,
        actions,
        thresholds: { thresholds: { overwhelming: 80 }, max: 100 },
        library,
        random: {
            next: () => { throw new Error("rescue scoring must not use random"); },
            integer: () => { throw new Error("rescue scoring must not use random"); },
        },
    };
}

function moveCandidates(fixture: PolicyContext) {
    return generateSmartCandidates(fixture).filter(
        (candidate) => candidate.action.type === "move",
    );
}

function breakdown(fixture: PolicyContext, index = 0): SkunkedRescueBreakdown {
    return evaluateSkunkedRescue(fixture, moveCandidates(fixture)[index]);
}

describe("Smart linked Skunked rescue priority", () => {
    it("gives damage against the linked rescue enemy a strong bonus", () => {
        const fixture = context(
            makePublicCharacter("test-victim", { standing: true, buffs: [linkedBuff("skunked", "test-rescue-enemy")], bindings: [binding()] }),
            [enemy("test-other-enemy"), enemy("test-rescue-enemy", 200, "skunkette")],
            { "test-other-enemy": 40, "test-rescue-enemy": 40 },
        );
        const decision = evaluateSmartDecision(fixture);
        const [other, rescue] = decision.candidates.filter(
            (candidate) => candidate.action.type === "move",
        );

        expect(other.components.skunkedRescue.raw).toBe(-SKUNKED_RESCUE_DELAY_PENALTY);
        expect(other.components.skunkedRescue.diagnostics).toMatchObject({
            delayPenalty: SKUNKED_RESCUE_DELAY_PENALTY,
            raw: -SKUNKED_RESCUE_DELAY_PENALTY,
        });
        expect(rescue.components.skunkedRescue.raw).toBeGreaterThan(40);
        expect(decision.selected.action).toMatchObject({ targets: ["test-rescue-enemy"] });
    });

    it("awards full rescue-progress value to expected-lethal damage", () => {
        const fixture = context(
            makePublicCharacter("test-victim", { standing: true, buffs: [linkedBuff("skunked", "test-rescue-enemy")], bindings: [binding()] }),
            [enemy("test-rescue-enemy", 200, "skunkette")],
            { "test-rescue-enemy": 200 },
        );
        const detail = breakdown(fixture).enemies[0];

        expect(detail.progressFraction).toBe(1);
        expect(detail.restoredActorValue).toBe(SKUNKED_RESCUE_ACTOR_VALUE);
        expect(detail.halvedBindingRecoveryValue).toBeGreaterThan(0);
        expect(detail.rescueProgressContribution).toBe(detail.fullRescueValue);
    });

    it("awards meaningful proportional value to partial damage", () => {
        const fixture = context(
            makePublicCharacter("test-victim", { standing: true, buffs: [linkedBuff("skunked", "test-rescue-enemy")], bindings: [binding()] }),
            [enemy("test-rescue-enemy", 200, "skunkette")],
            { "test-rescue-enemy": 50 },
        );
        const detail = breakdown(fixture).enemies[0];

        expect(detail.progressFraction).toBeCloseTo(0.25);
        expect(detail.rescueProgressContribution).toBeCloseTo(detail.fullRescueValue * 0.25);
        expect(detail.rescueProgressContribution).toBeGreaterThan(50);
    });

    it("penalizes attacking an ordinary enemy while a linked rescue is delayed", () => {
        const fixture = context(
            makePublicCharacter("test-victim", { standing: true, buffs: [linkedBuff("skunked", "test-rescue-enemy")], bindings: [binding()] }),
            [enemy("test-ordinary-enemy"), enemy("test-rescue-enemy", 200, "skunkette")],
            { "test-ordinary-enemy": 200, "test-rescue-enemy": 0 },
        );

        expect(breakdown(fixture)).toMatchObject({
            delayPenalty: SKUNKED_RESCUE_DELAY_PENALTY,
            raw: -SKUNKED_RESCUE_DELAY_PENALTY,
        });
    });

    it("does not treat a Pounce link as a Skunked rescue relationship", () => {
        const fixture = context(
            makePublicCharacter("test-victim", { standing: true, buffs: [linkedBuff("pounce", "test-pounce-enemy")], bindings: [binding()] }),
            [enemy("test-pounce-enemy", 200, "skunkette")],
            { "test-pounce-enemy": 200 },
        );

        expect(breakdown(fixture)).toEqual({ enemies: [], delayPenalty: 0, raw: 0 });
    });

    it("removes the bonus when the Skunked or incapacitated relationship is gone", () => {
        const noSkunkedBuff = context(
            makePublicCharacter("test-victim", { standing: true, buffs: [], bindings: [binding()] }),
            [enemy("test-rescue-enemy", 200, "skunkette")],
            { "test-rescue-enemy": 200 },
        );
        const noIncapacitation = context(
            makePublicCharacter("test-victim", { standing: true, buffs: [linkedBuff("skunked", "test-rescue-enemy", false)], bindings: [binding()] }),
            [enemy("test-rescue-enemy", 200, "skunkette")],
            { "test-rescue-enemy": 200 },
        );

        expect(breakdown(noSkunkedBuff).raw).toBe(0);
        expect(breakdown(noIncapacitation).raw).toBe(0);
    });

    it("penalizes other targets consistently and remains deterministic", () => {
        const fixture = context(
            makePublicCharacter("test-victim", { standing: true, buffs: [linkedBuff("skunked", "test-rescue-enemy")], bindings: [binding()] }),
            [
                enemy("test-other-a"),
                enemy("test-other-b"),
                enemy("test-rescue-enemy", 200, "skunkette"),
            ],
            { "test-other-a": 30, "test-other-b": 30, "test-rescue-enemy": 0 },
        );
        const first = evaluateSmartDecision(fixture, [skunkedRescueScorer]);
        const second = evaluateSmartDecision(fixture, [skunkedRescueScorer]);

        expect(second).toEqual(first);
        expect(first.candidates.slice(0, 2).map(
            (candidate) => candidate.components.skunkedRescue.raw,
        )).toEqual([
            -SKUNKED_RESCUE_DELAY_PENALTY,
            -SKUNKED_RESCUE_DELAY_PENALTY,
        ]);
        expect(structuredClone(first.candidates[0].components.skunkedRescue.diagnostics))
            .toEqual(first.candidates[0].components.skunkedRescue.diagnostics);
    });
});
