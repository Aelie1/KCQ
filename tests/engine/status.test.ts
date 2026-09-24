import { describe, expect, it } from "vitest";
import { latexArms } from "../../src/content/skunk/latex";
import type { BindingDef } from "../../src/engine/protected/definitions";
import { createCustomEngine } from "../../src/engine/protected/engine";
import { thresholds } from "../../src/engine/protected/helpers";
import { bound, helpless, immobilized, incapacitated, stunned } from "../../src/engine/protected/statuses";
import { actionView } from "../helpers/gameView";
import { expectMoveRejection, makeBindingDef, makeCharacterDef, makeMove, setupBoundEngine } from "../helpers/helpers";

function setupActorAndTarget(actorBinding: BindingDef, actorBindingAmount: number) {
    const targetBinding = makeBindingDef("target-binding");
    const prepare = makeMove("prepare", "mouth", {
        targetSide: "none",
        targets: 0,
        resolve: (state, actor) => state.characters.length < 2 ? [] : [
            {
                type: "binding" as const,
                source: actor,
                target: state.characters[0],
                binding: actorBinding,
                amount: actorBindingAmount,
            },
            {
                type: "binding" as const,
                source: actor,
                target: state.characters[1],
                binding: targetBinding,
                amount: thresholds.easy,
            },
        ],
    });
    const helper = makeCharacterDef("helper", [prepare]);
    const target = makeCharacterDef("target");
    const engine = createCustomEngine([], [helper, target], 1);
    engine.loadCharacter(helper.id);
    engine.loadCharacter(target.id);
    expect(engine.executeAction({
        type: "move",
        actor: helper.id,
        move: prepare.id,
        targets: [],
    }).success).toBe(true);
    expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);
    return { engine, helper, target, targetBinding };
}

describe("actor-level action restrictions", () => {
    it("rejects every actor action when a skipped status is active", () => {
        const source = makeBindingDef("helpless-source", {
            easy: [{ definition: helpless, value: 1 }],
        });
        const { engine, hero, foeId, mouthMove } = setupBoundEngine(
            source,
            thresholds.easy,
        );

        expectMoveRejection(engine, hero.id, mouthMove.id, foeId, "actorSkipped");
        expect(actionView(engine, hero.id).escapes).toEqual([
            expect.objectContaining({ available: false, reason: "actorSkipped" }),
        ]);
        expect(actionView(engine, hero.id).stance)
            .toEqual({ available: false, reason: "actorSkipped" });
        expect(engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: source.id,
        })).toEqual({ success: false, reason: "actorSkipped" });
        expect(engine.executeAction({ type: "stance", actor: hero.id }))
            .toEqual({ success: false, reason: "actorSkipped" });
    });

    it("reports incapacitation distinctly from an ordinary skipped turn", () => {
        const source = makeBindingDef("incapacitated-source", {
            easy: [{ definition: incapacitated, value: 1 }],
        });
        const { engine, hero, foeId, mouthMove } = setupBoundEngine(
            source,
            thresholds.easy,
        );

        expectMoveRejection(engine, hero.id, mouthMove.id, foeId, "actorIncapacitated");
        expect(actionView(engine, hero.id).escapes).toEqual([
            expect.objectContaining({ available: false, reason: "actorIncapacitated" }),
        ]);
        expect(actionView(engine, hero.id).stance)
            .toEqual({ available: false, reason: "actorIncapacitated" });
        expect(engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: source.id,
        })).toEqual({ success: false, reason: "actorIncapacitated" });
        expect(engine.executeAction({ type: "stance", actor: hero.id }))
            .toEqual({ success: false, reason: "actorIncapacitated" });
    });

    it("allows attacks while immobilized but prevents toggling back to moving", () => {
        const source = makeBindingDef("immobilized-source", {
            easy: [{ definition: immobilized, value: 1 }],
        });
        const { engine, hero, mouthMove } = setupBoundEngine(
            source,
            thresholds.easy,
        );

        expect(actionView(engine, hero.id).moves.find((action) => action.move.id === mouthMove.id))
            .toMatchObject({ available: true });
        expect(actionView(engine, hero.id).escapes).toContainEqual(
            expect.objectContaining({ target: hero.id, binding: source.id }),
        );
        expect(actionView(engine, hero.id).stance)
            .toEqual({ available: false, reason: "actorImmobilized" });
        expect(engine.executeAction({ type: "stance", actor: hero.id }))
            .toEqual({ success: false, reason: "actorImmobilized" });
    });
});

describe("move and escape restrictions", () => {
    it.each([
        [thresholds.hard, false, 2],
        [thresholds.extreme, true, 3],
        [thresholds.impossible, true, 4],
    ] as const)(
        "applies Bound move restrictions at binding value %s",
        (value, armsBlocked, boundValue) => {
            const { engine, hero, foeId, armsMove, mouthMove } =
                setupBoundEngine(latexArms, value);
            const actions = actionView(engine, hero.id).moves;

            expect(engine.getGameView().characters[0].bindings
                .find((binding) => binding.id === latexArms.id)?.status).toContainEqual({
                    id: bound.id,
                    value: boundValue,
                });
            expect(actions.find((action) => action.move.id === armsMove.id)).toMatchObject(
                armsBlocked
                    ? { available: false, reason: "bindingRestriction" }
                    : { available: true },
            );
            expect(actions.find((action) => action.move.id === mouthMove.id))
                .toMatchObject({ available: true });

            if (armsBlocked) {
                expectMoveRejection(
                    engine,
                    hero.id,
                    armsMove.id,
                    foeId,
                    "bindingRestriction",
                );
                expect(engine.executeAction({
                    type: "move",
                    actor: hero.id,
                    move: mouthMove.id,
                    targets: [foeId],
                }).success).toBe(true);
            } else {
                expect(engine.executeAction({
                    type: "move",
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
            thresholds.easy,
        );

        expectMoveRejection(
            engine,
            hero.id,
            mouthMove.id,
            foeId,
            "attackUnavailable",
        );
    });

    it("applies blocksEscape to both self-escape and assistance", () => {
        const escapeBlockingBinding = makeBindingDef("escape-blocking", {
            easy: [{ definition: stunned, value: 1 }],
        });
        const { engine, helper, target, targetBinding } = setupActorAndTarget(
            escapeBlockingBinding,
            thresholds.easy,
        );

        expect(actionView(engine, helper.id).escapes).toEqual([
            expect.objectContaining({
                available: false,
                reason: "escapeUnavailable",
                target: helper.id,
            }),
            expect.objectContaining({
                available: false,
                reason: "escapeUnavailable",
                target: target.id,
            }),
        ]);
        expect(engine.executeAction({
            type: "escape",
            actor: helper.id,
            target: helper.id,
            binding: escapeBlockingBinding.id,
        })).toEqual({ success: false, reason: "escapeUnavailable" });
        expect(engine.executeAction({
            type: "escape",
            actor: helper.id,
            target: target.id,
            binding: targetBinding.id,
        })).toEqual({ success: false, reason: "escapeUnavailable" });
    });

    it("allows self-escape but rejects assistance when only blocksAssist is active", () => {
        const { engine, helper, target, targetBinding } = setupActorAndTarget(
            latexArms,
            thresholds.extreme,
        );
        const escapes = actionView(engine, helper.id).escapes;

        expect(escapes).toEqual([
            expect.objectContaining({
                available: true,
                target: helper.id,
                binding: latexArms.id,
            }),
            expect.objectContaining({
                available: false,
                reason: "assistUnavailable",
                target: target.id,
                binding: targetBinding.id,
            }),
        ]);
        expect(engine.executeAction({
            type: "escape",
            actor: helper.id,
            target: target.id,
            binding: targetBinding.id,
        })).toEqual({ success: false, reason: "assistUnavailable" });
        expect(engine.executeAction({
            type: "escape",
            actor: helper.id,
            target: helper.id,
            binding: latexArms.id,
        }).success).toBe(true);
    });
});
