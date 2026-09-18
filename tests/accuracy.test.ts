import { describe, expect, it } from "vitest";
import { evaluateResult, isValidTarget } from "../src/engine/private/combat";
import { effectivenessRange } from "../src/engine/private/constants";
import type { EncounterDef, MoveDef, StatusDef } from "../src/engine/protected/definitions";
import { thresholds } from "../src/engine/protected/helpers";
import { mixSeed, Random } from "../src/engine/protected/random";
import type {
    iCharacter,
    iEnemy,
    iTargetInfo,
} from "../src/engine/protected/types";
import { GameEngine } from "../src/engine/public/engine";
import type { AccuracyProfile, MoveEvent } from "../src/engine/public/types";
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

    function enemyAccuracy(hitModifier: number): AccuracyProfile {
        const actor = makeAccuracyTarget(0, "enemy-actor");
        actor.buffs.push({
            id: "enemy-hit",
            active: true,
            modifiers: { hit: hitModifier },
        });
        const target = makeCharacter("character-target");
        const move = makeAccuracyMove(standardProfile, { targetSide: "player", type: "none" });
        const info = isValidTarget({
            turn: { round: 1, step: 1, phase: "enemy" },
            nextId: {},
            characters: [target],
            enemies: [actor],
            traps: [],
        }, actor, target, move);
        if (!info.valid || !info.accuracy) throw new Error("Expected enemy accuracy profile");
        return info.accuracy;
    }

    function previewAccuracy(
        actor: iCharacter,
        target: iEnemy,
        move: MoveDef,
    ): AccuracyProfile {
        const encounter: EncounterDef = {
            id: "accuracy-preview",
            enemies: [target.definition],
            bindings: [],
            traps: [],
            setup: (state) => {
                state.characters[0].bindings = actor.bindings;
                state.characters[0].buffs = actor.buffs;
                state.characters[0].standing = actor.standing;
                state.enemies[0].currDef = target.currDef;
                state.enemies[0].buffs = target.buffs;
            },
        };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter({ ...actor.definition, getMoves: () => [move] });
        engine.loadEncounter(encounter.id);
        const info = engine.getMoves(actor.id)
            .find(({ move: candidate }) => candidate.id === move.id)
            ?.targets.find(({ target }) => target !== null);
        if (!info || !info.valid || !info.accuracy) {
            throw new Error("Expected a valid target with an accuracy profile");
        }
        return info.accuracy;
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

        expect(previewAccuracy(
            makeAccuracyActor(),
            makeAccuracyTarget(),
            move,
        )).toEqual(standardProfile);
    });

    it("reduces player Crit slowly while applying the full negative accuracy penalty", () => {
        expect(previewAccuracy(
            makeAccuracyActor(-2),
            makeAccuracyTarget(),
            makeAccuracyMove(),
        )).toEqual({ miss: 20, graze: 25, hit: 47, crit: 8 });
    });

    it("applies positive accuracy while growing player Crit at one tenth rate", () => {
        const result = previewAccuracy(
            makeAccuracyActor(4),
            makeAccuracyTarget(),
            makeAccuracyMove(),
        );

        expect(result).toEqual({ miss: 0, graze: 0, hit: 86, crit: 14 });
        expect(result.crit).toBe(standardProfile.crit! + 4);
    });

    it("never raises enemy Crit above its authored chance", () => {
        expect(enemyAccuracy(5)).toEqual({ miss: 0, graze: 0, hit: 90, crit: 10 });
        expect(enemyAccuracy(-5)).toEqual({ miss: 35, graze: 40, hit: 20, crit: 5 });
    });

    it("treats target Defense as an equivalent accuracy penalty", () => {
        const move = makeAccuracyMove();
        const hitPenalty = previewAccuracy(
            makeAccuracyActor(-2),
            makeAccuracyTarget(),
            move,
        );
        const targetDefense = previewAccuracy(
            makeAccuracyActor(),
            makeAccuracyTarget(20),
            move,
        );

        expect(targetDefense).toEqual(hitPenalty);
    });

    it("applies generic hit and buff-derived defense modifiers", () => {
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

        const characterAttack = previewAccuracy(
            character,
            enemy,
            makeAccuracyMove(),
        );

        expect(characterAttack).toEqual({
            miss: 0,
            graze: 5,
            hit: 83,
            crit: 12,
        });
    });

    it("uses opposing willpower modifiers and ignores Defense for willpower checks", () => {
        const actor = makeAccuracyActor();
        const target = makeAccuracyTarget(1_000);
        actor.buffs.push({
            id: "actor-willpower",
            active: true,
            modifiers: { willpower: 2 },
        });
        target.buffs.push({
            id: "target-willpower",
            active: true,
            modifiers: { willpower: 1 },
        });

        expect(previewAccuracy(actor, target, makeAccuracyMove(
            { miss: 20, hit: 80 },
            { check: "willpower" },
        ))).toEqual({ miss: 10, hit: 90 });
    });

    it("reduces Crit slowly under penalties without allowing negative width", () => {
        const move = makeAccuracyMove();
        const noCrit = previewAccuracy(
            makeAccuracyActor(-5),
            makeAccuracyTarget(),
            move,
        );
        const extremePenalty = previewAccuracy(
            makeAccuracyActor(-1_000),
            makeAccuracyTarget(),
            move,
        );

        expect(noCrit.crit).toBe(5);
        expect(extremePenalty.crit).toBe(0);
        expect(Object.values(extremePenalty).every((width) => width >= 0)).toBe(true);
    });

    it("does not create a Crit band when the move did not author one", () => {
        const move = makeAccuracyMove({ miss: 10, graze: 20, hit: 70 });

        const result = previewAccuracy(
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
            const result = previewAccuracy(
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
            const result = previewAccuracy(
                makeAccuracyActor(delta),
                makeAccuracyTarget(),
                makeAccuracyMove(),
            );

            expect(Object.values(result).every((width) => width >= 0)).toBe(true);
            expect(profileTotal(result)).toBe(100);
        }
    });

    it("keeps Crit inside Full Hit when a penalty would otherwise make Hit negative", () => {
        const result = previewAccuracy(
            makeAccuracyActor(-8),
            makeAccuracyTarget(),
            makeAccuracyMove({ miss: 90, hit: 1, crit: 9 }),
        );

        expect(result).toEqual({ miss: 99, hit: 0, crit: 1 });
        expect(Object.values(result).every((width) => width >= 0)).toBe(true);
        expect(profileTotal(result)).toBe(100);
    });

    it("uses Potency and Vulnerability for effectiveness without changing band widths", () => {
        const actor = makeAccuracyActor();
        const target = makeAccuracyTarget();
        const move = makeAccuracyMove();
        actor.buffs.push({ id: "potent", active: true, modifiers: { potency: 2 } });
        target.buffs.push({ id: "vulnerable", active: true, modifiers: { vulnerability: 3 } });

        expect(previewAccuracy(actor, target, move)).toEqual(standardProfile);
        expect(evaluateResult(actor, target, move, standardProfile, 25)).toEqual({
            target,
            band: "hit",
            effectiveness: 0.8 * 1.25 * 1.375,
        });
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
            makeAccuracyActor(),
            makeAccuracyTarget(),
            makeAccuracyMove(),
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
        const actor = makeAccuracyActor();
        const move = makeAccuracyMove();
        expect(evaluateResult(actor, target, move, standardProfile, 5).effectiveness).toBe(0);
        expect(evaluateResult(actor, target, move, standardProfile, 10).effectiveness).toBeCloseTo(0.20);
        expect(evaluateResult(actor, target, move, standardProfile, 17.5).effectiveness).toBeCloseTo(0.35);
        expect(evaluateResult(actor, target, move, standardProfile, 25).effectiveness).toBeCloseTo(0.80);
        expect(evaluateResult(actor, target, move, standardProfile, 57.5).effectiveness).toBeCloseTo(0.90);
        expect(evaluateResult(actor, target, move, standardProfile, 90).effectiveness).toBeCloseTo(1.50);
        expect(evaluateResult(actor, target, move, standardProfile, 95).effectiveness).toBeCloseTo(1.75);
        expect(evaluateResult(actor, target, move, standardProfile, 100).effectiveness).toBeCloseTo(2.00);
    });

    it("produces the same accuracy result from the same seed and action", () => {
        const run = () => {
            const move = makeAccuracyMove();
            const hero = makeCharacterDef("hero", [move]);
            const foe = makeEnemyDef("foe", [makeWaitMove()]);
            const encounter = { id: "accuracy", enemies: [foe], bindings: [], traps: [] };
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
            const encounter = { id: "accuracy", enemies: [foe], bindings: [], traps: [] };
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
        const seed = 2;
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
            bindings: [],
            traps: [],
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
        const referenceRng = new Random(mixSeed(seed, 2));
        for (const _enemy of encounter.enemies) {
            referenceRng.accuracy();
            referenceRng.accuracy();
        }
        const referenceTargets = [
            makeEnemy(lowDefense, `${lowDefense.id}1`),
            makeEnemy(highDefense, `${highDefense.id}1`),
        ];
        const previews = engine.getMoves(hero.id)
            .find(({ move: candidate }) => candidate.id === move.id)
            ?.targets ?? [];
        const expected = referenceTargets.map((target) => {
            const preview = previews.find(({ target: id }) => id === target.id);
            if (!preview || !preview.valid || !preview.accuracy) {
                throw new Error(`Expected an accuracy preview for ${target.id}`);
            }
            return evaluateResult(
                makeAccuracyActor(),
                target,
                move,
                preview.accuracy,
                referenceRng.accuracy(),
            );
        });

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
            const encounter = { id: `accuracy-${id}`, enemies: [foe], bindings: [], traps: [] };
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

        expect(run(8, "missed").result).toBe("miss");
        expect(resolved).toEqual([]);
        expect(run(2, "hit").result).not.toBe("miss");
        expect(resolved).toEqual(["hit1"]);
    });

    it("resolves zero-target moves with a move-level accuracy roll", () => {
        let resolutions = 0;
        const zeroTarget = makeAccuracyMove({ hit: 100 }, {
            id: "zero-target",
            targetSide: "none",
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
            const encounter = { id: "zero-target", enemies: [foe], bindings: [], traps: [] };
            const engine = new GameEngine([encounter], 1);
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

        expect(firstControlRoll.result).toBe("crit");
        expect(afterZeroTarget.result).toBe("hit");
    });
});

describe("XorShift32", () => {
    it("replays the same public sequence from the same seed", () => {
        const seed = 123456;
        const first = new Random(seed);
        const second = new Random(seed);

        expect(Array.from({ length: 5 }, () => first.random())).toEqual(
            Array.from({ length: 5 }, () => second.random()),
        );
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

    it("normalizes zero seeds away from the locked zero state", () => {
        const first = new Random(0);
        const second = new Random(0);

        const sequence = Array.from({ length: 3 }, () => first.random());
        expect(sequence).toEqual(Array.from({ length: 3 }, () => second.random()));
        expect(sequence.some((value) => value !== 0)).toBe(true);
    });
});
