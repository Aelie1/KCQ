import { describe, expect, it } from "vitest";
import { bindingThresholds, effectivenessRange } from "../src/engine/constants";
import { calculateAccuracy, evaluateResult } from "../src/engine/combat";
import { GameEngine } from "../src/engine/engine";
import type {
    iCharacter,
    iEnemy,
    MoveDef,
    StatusDef,
    TargetInfo,
} from "../src/engine/itypes";
import { XorShift32 } from "../src/engine/random";
import type { AccuracyEvent, AccuracyProfile } from "../src/engine/types";
import {
    makeBinding,
    makeBindingDef,
    makeCharacter,
    makeCharacterDef,
    makeEnemy,
    makeEnemyDef,
    makeMove,
    makeWaitMove,
} from "./helpers";

describe("accuracy", () => {
    const standardProfile: AccuracyProfile = {
        miss: 10,
        graze: 15,
        hit: 65,
        crit: 10,
    };

    function makeAccuracyMove(
        accuracy: AccuracyProfile = standardProfile,
        overrides: Partial<MoveDef> = {},
    ): MoveDef {
        return makeMove("accuracy-move", "arms", {
            accuracy: { ...accuracy },
            ...overrides,
        });
    }

    function makeAccuracyActor(hitModifier = 0): iCharacter {
        if (hitModifier === 0) return makeCharacter("actor");

        const modifierStatus: StatusDef = {
            id: "blinded",
            levels: [{}, { modifiers: { hitarms: hitModifier } }],
        };
        const source = makeBindingDef("accuracy-modifier", {
            easy: [{ definition: modifierStatus, value: 1 }],
        });
        return makeCharacter("actor", [
            makeBinding(source, bindingThresholds.easy),
        ]);
    }

    function makeAccuracyTarget(defense = 0, id = "target"): iEnemy {
        const definition = makeEnemyDef(id, [makeWaitMove()]);
        definition.defense = defense;
        return makeEnemy(definition, id);
    }

    function profileTotal(profile: AccuracyProfile): number {
        return Object.values(profile).reduce((sum, width) => sum + width, 0);
    }

    function accuracyEvents(result: ReturnType<GameEngine["executeAction"]>): AccuracyEvent[] {
        if (!result.success) throw new Error(`Expected action success, got ${result.reason}`);
        return result.events.filter(
            (event): event is AccuracyEvent => event.type === "accuracyResult",
        );
    }

    it("returns the authored profile at zero net accuracy delta", () => {
        const move = makeAccuracyMove();

        expect(calculateAccuracy(
            makeAccuracyActor(),
            makeAccuracyTarget(),
            move,
        )).toEqual(standardProfile);
    });

    it("applies the asymmetric negative accuracy formula", () => {
        expect(calculateAccuracy(
            makeAccuracyActor(-2),
            makeAccuracyTarget(),
            makeAccuracyMove(),
        )).toEqual({ miss: 11, graze: 16, hit: 67, crit: 6 });
    });

    it("applies positive accuracy while growing Crit at one quarter rate", () => {
        const result = calculateAccuracy(
            makeAccuracyActor(4),
            makeAccuracyTarget(),
            makeAccuracyMove(),
        );

        expect(result).toEqual({ miss: 8, graze: 13, hit: 68, crit: 11 });
        expect(result.crit).toBe(standardProfile.crit! + 1);
    });

    it("treats target Defense as an equivalent accuracy penalty", () => {
        const move = makeAccuracyMove();
        const hitPenalty = calculateAccuracy(
            makeAccuracyActor(-2),
            makeAccuracyTarget(),
            move,
        );
        const targetDefense = calculateAccuracy(
            makeAccuracyActor(),
            makeAccuracyTarget(2),
            move,
        );

        expect(targetDefense).toEqual(hitPenalty);
    });

    it("removes Crit quickly under penalties without allowing negative width", () => {
        const move = makeAccuracyMove();
        const noCrit = calculateAccuracy(
            makeAccuracyActor(-5),
            makeAccuracyTarget(),
            move,
        );
        const extremePenalty = calculateAccuracy(
            makeAccuracyActor(-1_000),
            makeAccuracyTarget(),
            move,
        );

        expect(noCrit.crit).toBe(0);
        expect(extremePenalty.crit).toBe(0);
        expect(Object.values(extremePenalty).every((width) => width >= 0)).toBe(true);
    });

    it("does not create a Crit band when the move did not author one", () => {
        const move = makeAccuracyMove({ miss: 10, graze: 20, hit: 70 });

        const result = calculateAccuracy(
            makeAccuracyActor(40),
            makeAccuracyTarget(),
            move,
        );

        expect(result).not.toHaveProperty("crit");
        expect(profileTotal(result)).toBe(100);
    });

    it("preserves the structural meaning of other absent bands", () => {
        const cases: Array<{
            profile: AccuracyProfile;
            absent: Array<keyof AccuracyProfile>;
        }> = [
            { profile: { hit: 100 }, absent: ["miss", "graze", "crit"] },
            { profile: { miss: 20, hit: 80 }, absent: ["graze", "crit"] },
            { profile: { graze: 20, hit: 80 }, absent: ["miss", "crit"] },
        ];

        for (const { profile, absent } of cases) {
            const result = calculateAccuracy(
                makeAccuracyActor(-20),
                makeAccuracyTarget(),
                makeAccuracyMove(profile),
            );
            for (const band of absent) expect(result).not.toHaveProperty(band);
            expect(profileTotal(result)).toBe(100);
        }
    });

    it("keeps every band nonnegative and totals 100 at extreme deltas", () => {
        for (const delta of [-1_000, 1_000]) {
            const result = calculateAccuracy(
                makeAccuracyActor(delta),
                makeAccuracyTarget(),
                makeAccuracyMove(),
            );

            expect(Object.values(result).every((width) => width >= 0)).toBe(true);
            expect(profileTotal(result)).toBe(100);
        }
    });

    it.each([
        [0, "miss"],
        [9.999, "miss"],
        [10, "graze"],
        [24.999, "graze"],
        [25, "hit"],
        [89.999, "hit"],
        [90, "crit"],
        [100, "crit"],
    ] as const)("maps roll %s to the %s band", (roll, expectedBand) => {
        expect(evaluateResult(
            makeAccuracyTarget(),
            standardProfile,
            roll,
        ).result).toBe(expectedBand);
    });

    it("interpolates effectiveness continuously within each accuracy band", () => {
        const target = makeAccuracyTarget();

        expect(effectivenessRange).toEqual({
            miss: [0, 0],
            graze: [0.20, 0.50],
            hit: [0.80, 1.00],
            crit: [1.50, 2.00],
        });
        expect(evaluateResult(target, standardProfile, 5).effectiveness).toBe(0);
        expect(evaluateResult(target, standardProfile, 10).effectiveness).toBeCloseTo(0.20);
        expect(evaluateResult(target, standardProfile, 17.5).effectiveness).toBeCloseTo(0.35);
        expect(evaluateResult(target, standardProfile, 25).effectiveness).toBeCloseTo(0.80);
        expect(evaluateResult(target, standardProfile, 57.5).effectiveness).toBeCloseTo(0.90);
        expect(evaluateResult(target, standardProfile, 90).effectiveness).toBeCloseTo(1.50);
        expect(evaluateResult(target, standardProfile, 95).effectiveness).toBeCloseTo(1.75);
        expect(evaluateResult(target, standardProfile, 100).effectiveness).toBeCloseTo(2.00);
    });

    it("produces the same accuracy result from the same seed and action", () => {
        const run = () => {
            const move = makeAccuracyMove();
            const hero = makeCharacterDef("hero", [move]);
            const foe = makeEnemyDef("foe", [makeWaitMove()]);
            const engine = new GameEngine(123456);
            engine.loadCharacter(hero);
            engine.loadEnemy(foe);
            return accuracyEvents(engine.executeAction({
                type: "attack",
                actor: hero.id,
                move: move.id,
                targets: [`${foe.id}1`],
            }))[0];
        };

        expect(run()).toEqual(run());
    });

    it("does not consume an accuracy roll for an invalid action", () => {
        const build = () => {
            const move = makeAccuracyMove();
            const hero = makeCharacterDef("hero", [move]);
            const foe = makeEnemyDef("foe", [makeWaitMove()]);
            const engine = new GameEngine(123456);
            engine.loadCharacter(hero);
            engine.loadEnemy(foe);
            return { engine, hero, move, foeId: `${foe.id}1` };
        };
        const challenged = build();
        const control = build();

        expect(challenged.engine.executeAction({
            type: "attack",
            actor: challenged.hero.id,
            move: challenged.move.id,
            targets: ["missing"],
        })).toEqual({ success: false, reason: "invalidTarget" });

        const afterInvalid = accuracyEvents(challenged.engine.executeAction({
            type: "attack",
            actor: challenged.hero.id,
            move: challenged.move.id,
            targets: [challenged.foeId],
        }))[0];
        const firstControlRoll = accuracyEvents(control.engine.executeAction({
            type: "attack",
            actor: control.hero.id,
            move: control.move.id,
            targets: [control.foeId],
        }))[0];

        expect(afterInvalid).toEqual(firstControlRoll);
    });

    it("resolves all targets with one shared roll and target-specific Defense", () => {
        const seed = 123456;
        let activatedTargets: TargetInfo[] = [];
        const move = makeAccuracyMove(standardProfile, {
            targets: "all",
            activate: (_state, _actor, targets) => {
                activatedTargets = [...targets];
                return [];
            },
        });
        const hero = makeCharacterDef("hero", [move]);
        const lowDefense = makeEnemyDef("low-defense", [makeWaitMove()]);
        const highDefense = makeEnemyDef("high-defense", [makeWaitMove()]);
        highDefense.defense = 50;
        const engine = new GameEngine(seed);
        engine.loadCharacter(hero);
        engine.loadEnemy(lowDefense);
        engine.loadEnemy(highDefense);

        const result = engine.executeAction({
            type: "attack",
            actor: hero.id,
            move: move.id,
            targets: [],
        });
        const events = accuracyEvents(result);
        const roll = new XorShift32(seed).accuracy();
        const referenceActor = makeCharacter(hero.id);
        const referenceTargets = [
            makeEnemy(lowDefense, `${lowDefense.id}1`),
            makeEnemy(highDefense, `${highDefense.id}2`),
        ];
        const expected = referenceTargets.map((target) =>
            evaluateResult(target, calculateAccuracy(referenceActor, target, move), roll)
        );

        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected all-target move to succeed");
        expect(result.events[0]).toMatchObject({
            type: "moveUsed",
            targets: referenceTargets.map((target) => target.id),
        });
        expect(events.map(({ result: band, effectiveness }) => ({ band, effectiveness })))
            .toEqual(expected.map(({ result: band, effectiveness }) => ({
                band,
                effectiveness,
            })));
        expect(new Set(events.map((event) => event.result)).size).toBeGreaterThan(1);
        expect(activatedTargets.map((target) => target.target.id)).toEqual(
            referenceTargets.map((target) => target.id),
        );
    });

    it("does not activate effects for misses but does for successful targets", () => {
        const activated: string[] = [];
        const move = makeAccuracyMove(standardProfile, {
            activate: (_state, _actor, targets) => {
                activated.push(...targets.map((target) => target.target.id));
                return [];
            },
        });
        const run = (seed: number, id: string) => {
            const hero = makeCharacterDef("hero", [move]);
            const foe = makeEnemyDef(id, [makeWaitMove()]);
            const engine = new GameEngine(seed);
            engine.loadCharacter(hero);
            engine.loadEnemy(foe);
            return accuracyEvents(engine.executeAction({
                type: "attack",
                actor: hero.id,
                move: move.id,
                targets: [`${foe.id}1`],
            }))[0];
        };

        expect(run(1, "missed").result).toBe("miss");
        expect(activated).toEqual([]);
        expect(run(123456, "hit").result).not.toBe("miss");
        expect(activated).toEqual(["hit1"]);
    });

    it("activates zero-target moves without consuming an accuracy roll", () => {
        let activations = 0;
        const zeroTarget = makeAccuracyMove({ hit: 100 }, {
            id: "zero-target",
            targets: 0,
            activate: (_state, _actor, targets) => {
                activations++;
                expect(targets).toEqual([]);
                return [];
            },
        });
        const targeted = makeAccuracyMove(standardProfile, { id: "targeted" });
        const build = () => {
            const engine = new GameEngine(123456);
            engine.loadCharacter(makeCharacterDef("zero-actor", [zeroTarget]));
            engine.loadCharacter(makeCharacterDef("shooter", [targeted]));
            const foe = makeEnemyDef("foe", [makeWaitMove()]);
            engine.loadEnemy(foe);
            return { engine, foeId: `${foe.id}1` };
        };
        const challenged = build();
        const control = build();

        const zeroResult = challenged.engine.executeAction({
            type: "attack",
            actor: "zero-actor",
            move: zeroTarget.id,
            targets: [],
        });
        expect(zeroResult).toMatchObject({
            success: true,
            events: [{ type: "moveUsed", targets: [] }],
        });
        expect(accuracyEvents(zeroResult)).toEqual([]);
        expect(activations).toBe(1);

        const afterZeroTarget = accuracyEvents(challenged.engine.executeAction({
            type: "attack",
            actor: "shooter",
            move: targeted.id,
            targets: [challenged.foeId],
        }))[0];
        const firstControlRoll = accuracyEvents(control.engine.executeAction({
            type: "attack",
            actor: "shooter",
            move: targeted.id,
            targets: [control.foeId],
        }))[0];

        expect(afterZeroTarget).toEqual(firstControlRoll);
    });
});

describe("XorShift32", () => {
    it("replays the same sequence from the same seed and restored state", () => {
        const seed = 123456;
        const first = new XorShift32(seed);
        const second = new XorShift32(seed);

        expect(Array.from({ length: 5 }, () => first.nextU32())).toEqual(
            Array.from({ length: 5 }, () => second.nextU32()),
        );

        const checkpoint = first.getState();
        const nextValue = first.nextU32();
        first.setState(checkpoint);
        expect(first.nextU32()).toBe(nextValue);
    });

    it("produces normalized random values and integers inside inclusive bounds", () => {
        const rng = new XorShift32(987654);

        for (let sample = 0; sample < 100; sample++) {
            const value = rng.random();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);

            const integer = rng.int(-3, 4);
            expect(Number.isInteger(integer)).toBe(true);
            expect(integer).toBeGreaterThanOrEqual(-3);
            expect(integer).toBeLessThanOrEqual(4);
        }
        expect(rng.int(7, 7)).toBe(7);
    });

    it("normalizes zero seeds and restored states away from the locked zero state", () => {
        const rng = new XorShift32(0);

        expect(rng.getState()).not.toBe(0);
        rng.setState(0);
        expect(rng.getState()).not.toBe(0);
        expect(rng.nextU32()).not.toBe(0);
    });
});
