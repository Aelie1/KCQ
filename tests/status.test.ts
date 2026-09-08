import { describe, expect, it } from "vitest";
import { latexarms } from "../src/content/skunk/latex";
import { addBinding } from "../src/engine/bindings";
import { bindingThresholds } from "../src/engine/constants";
import { GameEngine } from "../src/engine/engine";
import { getEntitySide } from "../src/engine/helpers";
import type { iGameState, StatusDef } from "../src/engine/itypes";
import {
    bound,
    canAttack,
    canBonusEscape,
    canMove,
    canUseEscape,
    canUseMove,
    helpless,
    immobilized,
    incapacitated,
    isIncapacitated,
    isSkipped,
    stunned,
    vibrating,
} from "../src/engine/status";
import type { GameEvent } from "../src/engine/types";
import {
    expectMoveRejection,
    makeBinding,
    makeBindingDef,
    makeCharacter,
    makeCharacterDef,
    makeEnemy,
    makeEnemyDef,
    makeMove,
    makeWaitMove,
    setupBoundEngine,
} from "./helpers";

function makeStatusCharacter(status: StatusDef, value = 1) {
    const source = makeBindingDef(`${status.id}-source`, {
        easy: [{ definition: status, value }],
    });
    return makeCharacter(status.id, [makeBinding(source, bindingThresholds.easy)]);
}

describe("entity and status helpers", () => {
    it.each([
        ["hero", "player"],
        ["foe1", "enemy"],
        ["missing", undefined],
    ] as const)("identifies the side for entity id %s", (id, expectedSide) => {
        const enemyDefinition = makeEnemyDef("foe", [makeWaitMove()]);
        const state: iGameState = {
            turn: { round: 1, step: 1, phase: "player" },
            nextEntityId: 1,
            characters: [makeCharacter("hero")],
            enemies: [makeEnemy(enemyDefinition)],
        };

        expect(getEntitySide(state, id)).toBe(expectedSide);
    });

    it("treats a skipped actor as unable to attack or escape", () => {
        const actor = makeStatusCharacter(helpless);
        const restraint = makeBindingDef("rope");
        const target = makeCharacter("target", [makeBinding(restraint, bindingThresholds.easy)]);

        expect(isSkipped(actor)).toBe(true);
        expect(canAttack(actor)).toBe(false);
        expect(canUseEscape(actor, target, target.bindings[0])).toBe(false);
    });

    it("keeps movement restrictions separate from attacking", () => {
        const actor = makeStatusCharacter(immobilized);
        const unrestricted = makeCharacter("unrestricted");

        expect(canMove(actor)).toBe(false);
        expect(canAttack(actor)).toBe(true);
        expect(canMove(unrestricted)).toBe(true);
        expect(isSkipped(unrestricted)).toBe(false);
    });

    it("distinguishes bonus-escape restrictions from ordinary escape", () => {
        const vibratingActor = makeStatusCharacter(vibrating);
        const stunnedActor = makeStatusCharacter(stunned);

        expect(canBonusEscape(vibratingActor)).toBe(false);
        expect(canUseEscape(
            vibratingActor,
            vibratingActor,
            vibratingActor.bindings[0],
        )).toBe(true);
        expect(canBonusEscape(stunnedActor)).toBe(false);
        expect(canBonusEscape(makeCharacter("unrestricted"))).toBe(true);
    });

    it("recognizes incapacitation as a specific skipped state", () => {
        const actor = makeStatusCharacter(incapacitated);

        expect(isIncapacitated(actor)).toBe(true);
        expect(isSkipped(actor)).toBe(true);
        expect(isIncapacitated(makeStatusCharacter(helpless))).toBe(false);
    });
});

describe("move and status restrictions", () => {
    it.each([
        [bindingThresholds.hard, false, 2],
        [bindingThresholds.extreme, true, 3],
        [bindingThresholds.impossible, true, 4],
    ] as const)(
        "applies Bound move restrictions at binding value %s",
        (value, armsBlocked, boundValue) => {
            const { engine, hero, foeId, armsMove, mouthMove } =
                setupBoundEngine(latexarms, value);
            const actions = engine.getActions(hero.id);

            expect(engine.getGameState().characters[0].status).toContainEqual({
                id: bound.id,
                value: boundValue,
            });
            expect(actions.find((action) => action.move.id === armsMove.id)).toMatchObject(
                armsBlocked
                    ? { available: false, reason: "bindingRestriction" }
                    : { available: true },
            );
            expect(actions.find((action) => action.move.id === mouthMove.id)).toMatchObject({
                available: true,
            });
            expect(canUseMove(
                makeCharacter("hero", [makeBinding(latexarms, value)]),
                "mouth",
            )).toBe(true);

            if (armsBlocked) {
                expectMoveRejection(
                    engine,
                    hero.id,
                    armsMove.id,
                    foeId,
                    "bindingRestriction",
                );
                expect(engine.executeAction({
                    type: "attack",
                    actor: hero.id,
                    move: mouthMove.id,
                    targets: [foeId],
                }).success).toBe(true);
            } else {
                expect(engine.executeAction({
                    type: "attack",
                    actor: hero.id,
                    move: armsMove.id,
                    targets: [foeId],
                }).success).toBe(true);
            }
        },
    );

    it("keeps getActions and executeAction aligned when a status blocks attacks", () => {
        const restraint = makeBindingDef("stunning-restraint", {
            easy: [{ definition: stunned, value: 1 }],
        });
        const { engine, hero, foeId, mouthMove } = setupBoundEngine(
            restraint,
            bindingThresholds.easy,
        );

        expectMoveRejection(
            engine,
            hero.id,
            mouthMove.id,
            foeId,
            "statusRestriction",
        );
    });

    it("rejects self-escape when the actor has a blocksEscape status", () => {
        const restraint = makeBindingDef("stunning-restraint", {
            easy: [{ definition: stunned, value: 1 }],
        });
        const { engine, hero } = setupBoundEngine(restraint, bindingThresholds.easy);

        expect(engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: restraint.id,
        })).toEqual({ success: false, reason: "escapeUnavailable" });
        expect(engine.getGameState().characters[0].acted).toBe(false);
    });

    it("rejects assistance when the assisting actor has a blocksAssist status", () => {
        const targetBinding = makeBindingDef("target-binding");
        const setupMove = makeMove("prepare", "mouth", {
            targets: 0,
            activate: (state): GameEvent[] => [
                ...addBinding(state.characters[0], latexarms, bindingThresholds.extreme),
                ...addBinding(state.characters[1], targetBinding, bindingThresholds.easy),
            ],
        });
        const helper = makeCharacterDef("helper", [setupMove]);
        const target = makeCharacterDef("target");
        const engine = new GameEngine([], 1);
        engine.loadCharacter(helper);
        engine.loadCharacter(target);
        expect(engine.executeAction({
            type: "attack",
            actor: helper.id,
            move: setupMove.id,
            targets: [],
        }).success).toBe(true);
        expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);

        expect(engine.executeAction({
            type: "escape",
            actor: helper.id,
            target: target.id,
            binding: targetBinding.id,
        })).toEqual({ success: false, reason: "assistUnavailable" });
        expect(engine.getGameState().characters[0].acted).toBe(false);
    });
});
