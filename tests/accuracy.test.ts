import { describe, expect, it } from "vitest";
import { thresholds, effectivenessRange } from "../src/engine/constants";
import { calculateAccuracy, evaluateResult } from "../src/engine/combat";
import { GameEngine } from "../src/engine/engine";
import type {
    iCharacter,
    iEnemy,
    MoveDef,
    StatusDef,
    iTargetInfo,
} from "../src/engine/itypes";
import { Random } from "../src/engine/random";
import type { AccuracyProfile, MoveEvent } from "../src/engine/types";
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
            makeBinding(source, thresholds.easy),
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

    function moveUsed(result: ReturnType<GameEngine["executeAction"]>): MoveEvent {
        if (!result.success) throw new Error(`Expected action success, got ${result.reason}`);
        const event = result.events.find(
            (candidate): candidate is MoveEvent => candidate.type === "moveUsed",
        );
        if (!event) throw new Error("Expected moveUsed event");
        return event;
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
        )).toEqual({ miss: 20, graze: 25, hit: 55, crit: 0 });
    });

    it("applies positive accuracy while growing Crit at one half rate", () => {
        const result = calculateAccuracy(
            makeAccuracyActor(4),
            makeAccuracyTarget(),
            makeAccuracyMove(),
        );

        expect(result).toEqual({ miss: 0, graze: 0, hit: 70, crit: 30 });
        expect(result.crit).toBe(standardProfile.crit! + 20);
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
            makeAccuracyTarget(20),
            move,
        );

        expect(targetDefense).toEqual(hitPenalty);
    });

    it("applies generic hit and buff-derived defense modifiers to every entity side", () => {
        const hitStatus: StatusDef = {
            id: "blinded",
            levels: [{}, { modifiers: { hit: 3 } }],
        };
        const defenseStatus: StatusDef = {
            id: "breathless",
            levels: [{}, { modifiers: { defense: 1 } }],
        };
        const character = makeCharacter("hero");
        const enemy = makeAccuracyTarget(0, "foe1");
        character.buffs.push({
            id: "character-hit",
            duration: 1,
            active: true,
            statuses: [{ definition: hitStatus, value: 1 }],
        });
        enemy.buffs.push({
            id: "enemy-defense",
            duration: 1,
            active: true,
            statuses: [{ definition: defenseStatus, value: 1 }],
        });

        const characterAttack = calculateAccuracy(
            character,
            enemy,
            makeAccuracyMove(),
        );

        const enemyActor = makeAccuracyTarget(0, "attacker1");
        const characterTarget = makeCharacter("target");
        enemyActor.buffs.push({
            id: "enemy-hit",
            duration: 1,
            active: true,
            statuses: [{ definition: hitStatus, value: 1 }],
        });
        characterTarget.buffs.push({
            id: "character-defense",
            duration: 1,
            active: true,
            statuses: [{ definition: defenseStatus, value: 1 }],
        });
        const enemyAttack = calculateAccuracy(
            enemyActor,
            characterTarget,
            makeAccuracyMove(standardProfile, { type: "none" }),
        );

        expect(characterAttack).toEqual({
            miss: 0,
            graze: 5,
            hit: 75,
            crit: 20,
        });
        expect(enemyAttack).toEqual(characterAttack);
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
        ).band).toBe(expectedBand);
    });

    it("interpolates effectiveness continuously within each accuracy band", () => {
        const target = makeAccuracyTarget();

        expect(effectivenessRange).toEqual({
            miss: [0, 0],
            graze: [0.20, 0.50],
            hit: [0.80, 1.00],
            crit: [1.50, 2.00],
            none: [0, 0],
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
            const encounter = { id: "accuracy", enemies: [foe] };
            const engine = new GameEngine([encounter], 123456);
            engine.loadCharacter(hero);
            engine.loadEncounter(encounter.id);
            return moveUsed(engine.executeAction({
                type: "attack",
                actor: hero.id,
                move: move.id,
                targets: [`${foe.id}1`],
            })).targets[0];
        };

        expect(run()).toEqual(run());
    });

    it("does not consume an accuracy roll for an invalid action", () => {
        const build = () => {
            const move = makeAccuracyMove();
            const hero = makeCharacterDef("hero", [move]);
            const foe = makeEnemyDef("foe", [makeWaitMove()]);
            const encounter = { id: "accuracy", enemies: [foe] };
            const engine = new GameEngine([encounter], 123456);
            engine.loadCharacter(hero);
            engine.loadEncounter(encounter.id);
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

        const afterInvalid = moveUsed(challenged.engine.executeAction({
            type: "attack",
            actor: challenged.hero.id,
            move: challenged.move.id,
            targets: [challenged.foeId],
        })).targets[0];
        const firstControlRoll = moveUsed(control.engine.executeAction({
            type: "attack",
            actor: control.hero.id,
            move: control.move.id,
            targets: [control.foeId],
        })).targets[0];

        expect(afterInvalid).toEqual(firstControlRoll);
    });

    it("resolves all targets with independent rolls", () => {
        const seed = 123456;
        let resolvedTargets: iTargetInfo[] = [];
        const move = makeAccuracyMove(standardProfile, {
            targets: "all",
            resolve: (_state, _actor, _move, targets) => {
                resolvedTargets = [...targets];
                return [];
            },
        });
        const hero = makeCharacterDef("hero", [move]);
        const lowDefense = makeEnemyDef("low-defense", [makeWaitMove()]);
        const highDefense = makeEnemyDef("high-defense", [makeWaitMove()]);
        const encounter = {
            id: "multi-target-accuracy",
            enemies: [lowDefense, highDefense],
        };
        const engine = new GameEngine([encounter], seed);
        engine.loadCharacter(hero);
        engine.loadEncounter(encounter.id);

        const result = engine.executeAction({
            type: "attack",
            actor: hero.id,
            move: move.id,
            targets: [],
        });
        const event = moveUsed(result);
        const referenceRng = new Random(seed);
        for (const _enemy of encounter.enemies) {
            referenceRng.accuracy();
            referenceRng.accuracy();
        }
        const referenceActor = makeCharacter(hero.id);
        const referenceTargets = [
            makeEnemy(lowDefense, `${lowDefense.id}1`),
            makeEnemy(highDefense, `${highDefense.id}2`),
        ];
        const expected = referenceTargets.map((target) => evaluateResult(
            target,
            calculateAccuracy(referenceActor, target, move),
            referenceRng.accuracy(),
        ));

        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected all-target move to succeed");
        expect(result.events[0]).toMatchObject({
            type: "moveUsed",
            targets: expected.map((target) => ({
                target: target.target.id,
                result: target.band,
            })),
        });
        expect(event.targets.map(({ result: band }) => band))
            .toEqual(expected.map(({ band: band }) => band));
        expect(resolvedTargets.map(({ band: band, effectiveness }) => ({ band, effectiveness })))
            .toEqual(expected.filter((target) => target.band !== "miss").map(({ band: band, effectiveness }) => ({
                band,
                effectiveness,
            })));
        expect(new Set(event.targets.map((target) => target.result)).size).toBeGreaterThan(1);
        expect(resolvedTargets.map((target) => target.target.id)).toEqual(
            expected
                .filter((target) => target.band !== "miss")
                .map((target) => target.target.id),
        );
    });

    it("does not resolve effects for misses but does for successful targets", () => {
        const resolved: string[] = [];
        const move = makeAccuracyMove(standardProfile, {
            resolve: (_state, _actor, _move, targets) => {
                resolved.push(...targets.map((target) => target.target.id));
                return [];
            },
        });
        const run = (seed: number, id: string) => {
            const hero = makeCharacterDef("hero", [move]);
            const foe = makeEnemyDef(id, [makeWaitMove()]);
            const encounter = { id: `accuracy-${id}`, enemies: [foe] };
            const engine = new GameEngine([encounter], seed);
            engine.loadCharacter(hero);
            engine.loadEncounter(encounter.id);
            return moveUsed(engine.executeAction({
                type: "attack",
                actor: hero.id,
                move: move.id,
                targets: [`${foe.id}1`],
            })).targets[0];
        };

        expect(run(11, "missed").result).toBe("miss");
        expect(resolved).toEqual([]);
        expect(run(1, "hit").result).not.toBe("miss");
        expect(resolved).toEqual(["hit1"]);
    });

    it("resolves zero-target moves with a move-level accuracy roll", () => {
        let resolutions = 0;
        const zeroTarget = makeAccuracyMove({ hit: 100 }, {
            id: "zero-target",
            targets: 0,
            resolve: (_state, _actor, move, targets) => {
                resolutions++;
                expect(targets).toEqual([]);
                expect(move.band).toBe("hit");
                return [];
            },
        });
        const targeted = makeAccuracyMove(standardProfile, { id: "targeted" });
        const build = () => {
            const foe = makeEnemyDef("foe", [makeWaitMove()]);
            const encounter = { id: "zero-target", enemies: [foe] };
            const engine = new GameEngine([encounter], 123456);
            engine.loadCharacter(makeCharacterDef("zero-actor", [zeroTarget]));
            engine.loadCharacter(makeCharacterDef("shooter", [targeted]));
            engine.loadEncounter(encounter.id);
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
        expect(moveUsed(zeroResult).targets).toEqual([]);
        expect(resolutions).toBe(1);

        const afterZeroTarget = moveUsed(challenged.engine.executeAction({
            type: "attack",
            actor: "shooter",
            move: targeted.id,
            targets: [challenged.foeId],
        })).targets[0];
        const firstControlRoll = moveUsed(control.engine.executeAction({
            type: "attack",
            actor: "shooter",
            move: targeted.id,
            targets: [control.foeId],
        })).targets[0];

        expect(firstControlRoll.result).toBe("graze");
        expect(afterZeroTarget.result).toBe("hit");
    });
});

describe("XorShift32", () => {
    it("replays the same sequence from the same seed and restored state", () => {
        const seed = 123456;
        const first = new Random(seed);
        const second = new Random(seed);

        expect(Array.from({ length: 5 }, () => first.nextU32())).toEqual(
            Array.from({ length: 5 }, () => second.nextU32()),
        );

        const checkpoint = first.getState();
        const nextValue = first.nextU32();
        first.setState(checkpoint);
        expect(first.nextU32()).toBe(nextValue);
    });

    it("produces normalized random values and integers inside inclusive bounds", () => {
        const rng = new Random(987654);

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
        const rng = new Random(0);

        expect(rng.getState()).not.toBe(0);
        rng.setState(0);
        expect(rng.getState()).not.toBe(0);
        expect(rng.nextU32()).not.toBe(0);
    });
});
