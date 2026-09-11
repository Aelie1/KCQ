import { describe, expect, it } from "vitest";
import { latexArms } from "../src/content/skunk/latex";
import { thresholds } from "../src/engine/constants";
import { GameEngine } from "../src/engine/engine";
import type { BindingDef } from "../src/engine/itypes";
import {
    bound,
    helpless,
    immobilized,
    incapacitated,
    stunned,
} from "../src/engine/status";
import {
    expectMoveRejection,
    makeBindingDef,
    makeCharacterDef,
    makeMove,
    setupBoundEngine,
} from "./helpers";

function setupActorAndTarget(actorBinding: BindingDef, actorBindingAmount: number) {
    const targetBinding = makeBindingDef("target-binding");
    const prepare = makeMove("prepare", "mouth", {
        targets: 0,
        resolve: (state) => [
            {
                type: "binding" as const,
                target: state.characters[0],
                binding: actorBinding,
                amount: actorBindingAmount,
            },
            {
                type: "binding" as const,
                target: state.characters[1],
                binding: targetBinding,
                amount: thresholds.easy,
            },
        ],
    });
    const helper = makeCharacterDef("helper", [prepare]);
    const target = makeCharacterDef("target");
    const engine = new GameEngine([], 1);
    engine.loadCharacter(helper);
    engine.loadCharacter(target);
    expect(engine.executeAction({
        type: "attack",
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
        expect(engine.getEscapes(hero.id)).toEqual({ options: [], assistAllowed: false });
        expect(engine.stanceAvailable(hero.id))
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
        expect(engine.getEscapes(hero.id)).toEqual({ options: [], assistAllowed: false });
        expect(engine.stanceAvailable(hero.id))
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

        expect(engine.getMoves(hero.id).find((action) => action.move.id === mouthMove.id))
            .toMatchObject({ available: true });
        expect(engine.getEscapes(hero.id)?.options).toContainEqual(
            expect.objectContaining({ target: hero.id, binding: source.id }),
        );
        expect(engine.stanceAvailable(hero.id))
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
            const actions = engine.getMoves(hero.id);

            expect(engine.getGameState().characters[0].status).toContainEqual({
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

        expect(engine.getEscapes(helper.id)).toEqual({ options: [], assistAllowed: false });
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
        const escapes = engine.getEscapes(helper.id);

        expect(escapes?.assistAllowed).toBe(false);
        expect(escapes?.options).toEqual([
            expect.objectContaining({ target: helper.id, binding: latexArms.id }),
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
