import { describe, expect, it } from "vitest";
import type { ContentLibrary } from "../../src/engine/public/library";
import type {
    ActionInfo,
    ActionView,
    Binding,
    Character,
    Effect,
    Enemy,
    GameState,
    Intention,
} from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import {
    assessSmartBoard,
    evaluateFuturePuddlePressure,
    evaluateKitKnowledge,
    evaluateSkunkRegenerationLiability,
    evaluateSmartDecision,
    generateSmartCandidates,
} from "../../src/harness/policy/smart";
import { createEmptyContentLibrary } from "../helpers/library";
import { STANDARD_DIFFICULTY } from "../helpers/state";

function character(id = "hero", bindings: Binding[] = []): Character {
    return {
        id,
        acted: false,
        standing: false,
        bonusEscapes: 0,
        bindings,
        buffs: [],
        cooldowns: {},
        modifiers: {},
        blockedMoveTypes: [],
        data: {},
    };
}

function enemy(id: string, values: Partial<Enemy> = {}): Enemy {
    const defId = /^(fairy|queen|rainmaker|skunk|skunkette)\d+$/.exec(id)?.[1] ?? id;
    return {
        id,
        defId,
        index: 1,
        rank: "enemy",
        maxHp: 300,
        currHp: 300,
        currDef: 0,
        intentions: [],
        buffs: [],
        cooldowns: {},
        ...values,
    };
}

function attack(
    id: string,
    targets: string[],
    damage: number,
    hits = 1,
    hitChance = 100,
): ActionInfo {
    return {
        move: { id, targetSide: "enemy", targets: 1, hits, type: "arms" },
        available: true,
        effects: [],
        targets: targets.map((target) => ({
            valid: true,
            target,
            accuracy: hitChance === 100 ? { hit: 100 } : { miss: 100 - hitChance, hit: hitChance },
            damage: hitChance === 100
                ? { hit: { chance: 100, min: damage, max: damage } }
                : {
                    miss: { chance: 100 - hitChance, min: 0, max: 0 },
                    hit: { chance: hitChance, min: damage, max: damage },
                },
            effects: [],
        })),
    };
}

function action(actor: string, moves: ActionInfo[]): ActionView {
    return {
        id: actor,
        available: true,
        moves,
        escapes: [],
        stance: { available: false, reason: "moveUnavailable" },
    };
}

function fixture(
    enemies: Enemy[],
    moves: ActionInfo[],
    characters: Character[] = [character()],
    mutateLibrary?: (library: ContentLibrary) => void,
): PolicyContext {
    const actions = [action(characters[0].id, moves)];
    const library = createEmptyContentLibrary();
    for (const info of moves) {
        library.moves[info.move.id] = { ...info.move, bindings: [] };
    }
    library.moves.latexExplosion = {
        id: "latexExplosion",
        targetSide: "player",
        targets: 1,
        type: "none",
        baseDamage: 40,
        bindings: ["generic-head", "generic-arms", "generic-torso", "generic-legs"],
        accuracy: { miss: 50, graze: 30, hit: 17, crit: 3 },
    };
    library.moves.latexPuddle = {
        id: "latexPuddle",
        targetSide: "none",
        targets: 0,
        type: "none",
        baseDamage: 30,
        bindings: [],
        accuracy: { graze: 45, hit: 50, crit: 5 },
    };
    mutateLibrary?.(library);
    const state: GameState = {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        difficulty: STANDARD_DIFFICULTY,
        characters,
        enemies,
        traps: [],
        encounter: null,
    };
    return {
        state,
        actions,
        thresholds: {
            thresholds: { easy: 20, medium: 40, hard: 60, extreme: 70, impossible: 80 },
            max: 100,
        },
        library,
        random: {
            next: () => { throw new Error("knowledge must not use policy RNG"); },
            integer: () => { throw new Error("knowledge must not use policy RNG"); },
        },
    };
}

function candidate(context: PolicyContext, moveId: string, targetId: string) {
    const value = generateSmartCandidates(context).find(({ action }) =>
        action.type === "move" && action.move === moveId && action.targets.includes(targetId)
    );
    if (value === undefined) throw new Error(`Missing ${moveId} -> ${targetId}`);
    return value;
}

function knowledge(context: PolicyContext, moveId: string, targetId: string) {
    return evaluateKitKnowledge(
        context,
        assessSmartBoard(context),
        candidate(context, moveId, targetId),
    );
}

function latexBinding(value: number, peak: number, id = "latexArms"): Binding {
    return {
        id,
        value,
        level: "hard",
        data: { peak },
        status: [],
        tickEffects: [],
    };
}

function escapeCandidate(context: PolicyContext, amount: number) {
    context.actions[0].escapes.push({
        available: true,
        target: context.state.characters[0].id,
        binding: "latexArms",
        effects: [{
            type: "binding",
            target: context.state.characters[0].id,
            binding: "latexArms",
            amount,
        }],
    });
    const value = generateSmartCandidates(context).find(({ action }) =>
        action.type === "escape" && action.binding === "latexArms"
    );
    if (value === undefined) throw new Error("Missing Latex escape candidate");
    return value;
}

function healingIntention(target: Enemy, amount: number, extras: Effect[] = []): Intention {
    return {
        move: "healingMagic",
        targets: [{
            target: target.id,
            band: "hit",
            effects: [{ type: "damage", target: target.id, amount: -amount }],
        }],
        effects: extras,
    };
}

describe("Smart Skunk Regeneration liability", () => {
    it("does not adjust without a living Skunk", () => {
        const context = fixture(
            [enemy("wolf1")],
            [],
            [character("hero", [latexBinding(10, 70)])],
        );
        const result = evaluateSkunkRegenerationLiability(
            context,
            escapeCandidate(context, -10),
        );
        expect(result).toMatchObject({
            beforeExposure: 60,
            afterExposure: 0,
            livingSkunkCount: 0,
            rawAdjustment: 0,
        });
    });

    it("recognizes a present 10/70 Latex binding as 60 liability", () => {
        const context = fixture(
            [enemy("skunk1")],
            [],
            [character("hero", [latexBinding(10, 70)])],
        );
        const result = evaluateSkunkRegenerationLiability(
            context,
            generateSmartCandidates(context).at(-1)!,
        );
        expect(result.characterLiabilitiesBefore[0]).toMatchObject({
            characterId: "hero",
            liability: 60,
            bindings: [{
                bindingId: "latexArms",
                current: 10,
                peak: 70,
                recoverableGap: 60,
            }],
        });
        expect(result.beforeExposure).toBe(60);
    });

    it("does not reward a partial escape until it clears the exposed track", () => {
        const context = fixture(
            [enemy("skunk1")],
            [],
            [character("hero", [latexBinding(40, 70)])],
        );
        const result = evaluateSkunkRegenerationLiability(
            context,
            escapeCandidate(context, -20),
        );
        expect(result).toMatchObject({
            beforeExposure: 30,
            afterExposure: 50,
            recoveryAdjustment: 0,
            rawAdjustment: 0,
        });
    });

    it("rewards finishing a binding because zero has no Regeneration liability", () => {
        const context = fixture(
            [enemy("skunk1")],
            [],
            [character("hero", [latexBinding(10, 70)])],
        );
        const result = evaluateSkunkRegenerationLiability(
            context,
            escapeCandidate(context, -10),
        );
        expect(result).toMatchObject({
            beforeExposure: 60,
            afterExposure: 0,
            recoveryAdjustment: 60,
            rawAdjustment: 60,
        });
    });

    it("scales recovery exposure change by the number of living Skunks", () => {
        const one = fixture(
            [enemy("skunk1")],
            [],
            [character("hero", [latexBinding(40, 70)])],
        );
        const two = fixture(
            [enemy("skunk1"), enemy("skunk2")],
            [],
            [character("hero", [latexBinding(40, 70)])],
        );
        expect(evaluateSkunkRegenerationLiability(
            two,
            escapeCandidate(two, -20),
        ).recoveryAdjustment).toBe(2 * evaluateSkunkRegenerationLiability(
            one,
            escapeCandidate(one, -20),
        ).recoveryAdjustment);
    });

    it("credits proportional Skunk damage progress but not unrelated damage", () => {
        const context = fixture(
            [enemy("skunk1", { currHp: 100 }), enemy("wolf1", { currHp: 100 })],
            [attack("strike", ["skunk1", "wolf1"], 25)],
            [character("hero", [latexBinding(10, 70)])],
        );
        const skunk = evaluateSkunkRegenerationLiability(
            context,
            candidate(context, "strike", "skunk1"),
        );
        const wolf = evaluateSkunkRegenerationLiability(
            context,
            candidate(context, "strike", "wolf1"),
        );
        expect(skunk.offensiveAdjustment).toBe(15);
        expect(skunk.skunks[0]).toMatchObject({
            expectedDamage: 25,
            progressFraction: 0.25,
            contribution: 15,
        });
        expect(wolf.offensiveAdjustment).toBe(0);
    });
});

describe("Smart future Skunk puddle-production pressure", () => {
    function pressureAt(stock: number, target = "skunk1", enemies = [enemy("skunk1", { currHp: 100 })]) {
        const context = fixture(enemies, [attack("strike", enemies.map(({ id }) => id), 50)]);
        context.state.traps = [{ id: "trapPuddle", amount: stock }];
        return evaluateFuturePuddlePressure(
            context,
            candidate(context, "strike", target),
        );
    }

    it("is strongest at zero stock, lower at intermediate stock, and zero at 75+", () => {
        const empty = pressureAt(0);
        const intermediate = pressureAt(50);
        const full = pressureAt(75);
        expect(empty).toMatchObject({
            puddleAmount: 0,
            creationProbability: 0.75,
            pressurePerSkunk: 22.5,
            contribution: 11.25,
        });
        expect(intermediate.creationProbability).toBe(0.25);
        expect(intermediate.contribution).toBeLessThan(empty.contribution);
        expect(full).toMatchObject({
            creationProbability: 0,
            pressurePerSkunk: 0,
            contribution: 0,
        });
    });

    it("credits only damage progress against a living Skunk", () => {
        const enemies = [
            enemy("skunk1", { currHp: 100 }),
            enemy("wolf1", { currHp: 100 }),
        ];
        expect(pressureAt(0, "skunk1", enemies).contribution).toBe(11.25);
        expect(pressureAt(0, "wolf1", enemies).contribution).toBe(0);
    });

    it("treats multiple Skunks as multiple producers without removing all for one hit", () => {
        const result = pressureAt(0, "skunk1", [
            enemy("skunk1", { currHp: 100 }),
            enemy("skunk2", { currHp: 100 }),
        ]);
        expect(result).toMatchObject({
            livingSkunkCount: 2,
            pressurePerSkunk: 22.5,
            totalProducerPressure: 45,
            contribution: 11.25,
        });
        expect(result.skunks).toEqual([
            expect.objectContaining({ enemyId: "skunk1", progressFraction: 0.5 }),
            expect.objectContaining({ enemyId: "skunk2", progressFraction: 0 }),
        ]);
    });
});

describe("Smart Fairy healing knowledge", () => {
    it("adds no support pressure when no Skunk-family ally needs healing", () => {
        const context = fixture(
            [enemy("fairy1", { maxHp: 200, currHp: 200 }), enemy("skunk1")],
            [attack("strike", ["fairy1", "skunk1"], 50)],
        );
        expect(knowledge(context, "strike", "fairy1").rules
            .filter(({ id }) => id.includes("fairy-heal"))).toEqual([]);
    });

    it("scales support pressure with useful available healing", () => {
        const one = fixture(
            [enemy("fairy1", { maxHp: 200, currHp: 200 }), enemy("skunk1", { currHp: 200 })],
            [attack("strike", ["fairy1"], 200)],
        );
        const more = fixture(
            [
                enemy("fairy1", { maxHp: 200, currHp: 200 }),
                enemy("skunk1", { currHp: 200 }),
                enemy("skunkette1", { maxHp: 200, currHp: 100 }),
            ],
            [attack("strike", ["fairy1"], 200)],
        );
        expect(knowledge(one, "strike", "fairy1").raw).toBeGreaterThan(0);
        expect(knowledge(more, "strike", "fairy1").raw)
            .toBeGreaterThan(knowledge(one, "strike", "fairy1").raw);
    });

    it("makes committed useful healing more immediate and rewards lethal Fairy removal", () => {
        const skunk = enemy("skunk1", { currHp: 200 });
        const available = fixture(
            [enemy("fairy1", { maxHp: 200, currHp: 200 }), skunk],
            [attack("strike", ["fairy1"], 200)],
        );
        const committed = fixture(
            [enemy("fairy1", {
                maxHp: 200,
                currHp: 200,
                intentions: [healingIntention(skunk, 75)],
            }), skunk],
            [attack("strike", ["fairy1"], 200)],
        );
        const result = knowledge(committed, "strike", "fairy1");
        expect(result.raw).toBeGreaterThan(knowledge(available, "strike", "fairy1").raw);
        expect(result.rules).toContainEqual(expect.objectContaining({
            id: "skunk.fairy-committed-heal-prevention",
        }));
    });

    it("does not treat an unrelated enemy as Fairy support", () => {
        const context = fixture(
            [enemy("fairy1", { maxHp: 200, currHp: 200 }), enemy("skunk1", { currHp: 200 }), enemy("wolf1")],
            [attack("strike", ["wolf1"], 300)],
        );
        expect(knowledge(context, "strike", "wolf1").raw).toBe(0);
    });

    it("credits killing only the selected recipient that invalidates the committed heal", () => {
        const selected = enemy("skunk1", { currHp: 50 });
        const other = enemy("skunkette1", { maxHp: 200, currHp: 50 });
        const fairy = enemy("fairy1", {
            maxHp: 200,
            currHp: 200,
            intentions: [healingIntention(selected, 75, [{
                type: "damage", target: other.id, amount: -50,
            }])],
        });
        const context = fixture(
            [fairy, selected, other],
            [attack("finish", [selected.id, other.id], 60)],
        );
        expect(knowledge(context, "finish", selected.id).rules)
            .toContainEqual(expect.objectContaining({ id: "skunk.fairy-committed-heal-prevention" }));
        expect(knowledge(context, "finish", other.id).rules
            .some(({ id }) => id === "skunk.fairy-committed-heal-prevention")).toBe(false);
    });

    it("preserves meaningful damage invested in a healable enemy instead of spreading", () => {
        const context = fixture(
            [
                enemy("fairy1", { maxHp: 200, currHp: 200 }),
                enemy("skunkette1", { maxHp: 200, currHp: 100 }),
                enemy("skunkette2", { maxHp: 200, currHp: 200 }),
            ],
            [attack("strike", ["skunkette1", "skunkette2"], 50)],
        );
        const continuing = knowledge(context, "strike", "skunkette1");
        const spreading = knowledge(context, "strike", "skunkette2");
        expect(continuing.raw).toBeGreaterThan(spreading.raw);
        expect(continuing.rules).toContainEqual(expect.objectContaining({
            id: "skunk.fairy-focus-continuity",
            details: expect.objectContaining({ fairyIds: ["fairy1"] }),
        }));
    });

    it("still values removing Fairy more when that prevents more healing", () => {
        const context = fixture(
            [
                enemy("fairy1", { maxHp: 200, currHp: 200 }),
                enemy("skunk1", { maxHp: 200, currHp: 100 }),
                enemy("skunkette1", { maxHp: 200, currHp: 100 }),
            ],
            [attack("finish", ["fairy1", "skunk1"], 200)],
        );
        expect(knowledge(context, "finish", "fairy1").raw)
            .toBeGreaterThan(knowledge(context, "finish", "skunk1").raw);
    });

    it("adds no focus-continuity value without a meaningful healing source", () => {
        const context = fixture(
            [enemy("skunkette1", { maxHp: 200, currHp: 100 }), enemy("wolf1")],
            [attack("strike", ["skunkette1"], 50)],
        );
        expect(knowledge(context, "strike", "skunkette1").rules).not.toContainEqual(
            expect.objectContaining({ id: "skunk.fairy-focus-continuity" }),
        );
    });
});

describe("Smart Fairy Barrier knowledge", () => {
    const barrier = { id: "barrierMagic", duration: 2 } as const;

    it("strongly disfavors a two-hit attack fully absorbed by Barrier 2", () => {
        const context = fixture(
            [enemy("skunkette1", { maxHp: 200, currHp: 200, buffs: [barrier] })],
            [attack("two-hit", ["skunkette1"], 30, 2)],
        );
        const result = knowledge(context, "two-hit", "skunkette1");
        expect(result.raw).toBeLessThan(-60);
        expect(evaluateSmartDecision(context).selected.action).toEqual({ type: "endTurn" });
    });

    it("keeps meaningful post-Barrier offense from a six-hit attack", () => {
        const context = fixture(
            [enemy("skunkette1", { maxHp: 200, currHp: 200, buffs: [barrier] })],
            [attack("six-hit", ["skunkette1"], 30, 6)],
        );
        const decision = evaluateSmartDecision(context);
        expect(decision.selected.action).toMatchObject({ move: "six-hit" });
        expect(knowledge(context, "six-hit", "skunkette1").rules[0]?.details)
            .toMatchObject({ postBarrierExpectedDamage: 120, expectedBlockedHits: 2 });
    });

    it("preserves an attack that can kill through Barrier", () => {
        const context = fixture(
            [enemy("skunkette1", { maxHp: 200, currHp: 50, buffs: [barrier] })],
            [attack("kill-through", ["skunkette1"], 30, 4)],
        );
        expect(evaluateSmartDecision(context).selected.action).toMatchObject({ move: "kill-through" });
    });

    it("lets useful recovery beat an attack whose only result is stripping Barrier", () => {
        const restraint: Binding = {
            id: "restraint", value: 60, level: "hard", data: {}, status: [], tickEffects: [],
        };
        const context = fixture(
            [enemy("skunkette1", { maxHp: 200, currHp: 200, buffs: [barrier] })],
            [attack("strip", ["skunkette1"], 30, 2)],
            [character("hero", [restraint])],
        );
        context.actions[0].escapes.push({
            available: true,
            target: "hero",
            binding: "restraint",
            effects: [{ type: "binding", target: "hero", binding: "restraint", amount: -20 }],
        });
        expect(evaluateSmartDecision(context).selected.action).toMatchObject({ type: "escape" });
    });

    it("penalizes needless stripping more when natural expiry is one round away", () => {
        const fresh = fixture(
            [enemy("skunkette1", { buffs: [{ id: "barrierMagic", duration: 3 }] })],
            [attack("single", ["skunkette1"], 30)],
        );
        const expiring = fixture(
            [enemy("skunkette1", { buffs: [{ id: "barrierMagic", duration: 1 }] })],
            [attack("single", ["skunkette1"], 30)],
        );
        expect(knowledge(expiring, "single", "skunkette1").raw)
            .toBeLessThan(knowledge(fresh, "single", "skunkette1").raw);
    });

    it("does not change normal offense for no Barrier or an unrelated buff", () => {
        for (const buffs of [[], [{ id: "empoweringMagic", duration: 2 }]]) {
            const context = fixture(
                [enemy("skunkette1", { buffs })],
                [attack("strike", ["skunkette1"], 30)],
            );
            expect(knowledge(context, "strike", "skunkette1").rules
                .some(({ id }) => id.includes("barrier"))).toBe(false);
        }
    });
});

describe("Smart Skunk Explosion discipline", () => {
    it("does not penalize damage that remains above threshold", () => {
        const context = fixture([enemy("skunk1", { currHp: 100 })], [attack("safe", ["skunk1"], 20)]);
        expect(knowledge(context, "safe", "skunk1").rules
            .some(({ id }) => id.includes("explosion"))).toBe(false);
    });

    it("keeps the recent last-enemy threshold-crossing exception", () => {
        const context = fixture(
            [enemy("skunk1", { currHp: 100 })],
            [attack("cross", ["skunk1"], 50)],
        );
        expect(knowledge(context, "cross", "skunk1").rules).toContainEqual(
            expect.objectContaining({
                id: "skunk.explosion-last-enemy-no-penalty",
                adjustment: -0,
            }),
        );
    });

    it("penalizes a nonlethal threshold crossing but preserves a large clean kill", () => {
        const risky = fixture(
            [enemy("skunk1", { currHp: 100 }), enemy("other1")],
            [attack("risk", ["skunk1"], 50)],
        );
        const lethal = fixture(
            [enemy("skunk1", { currHp: 100 }), enemy("other1")],
            [attack("lethal", ["skunk1"], 100)],
        );
        expect(knowledge(risky, "risk", "skunk1").rules)
            .toContainEqual(expect.objectContaining({
                id: "skunk.explosion-nonlethal-threshold-risk",
                adjustment: expect.any(Number),
            }));
        expect(knowledge(risky, "risk", "skunk1").raw).toBeLessThan(0);
        expect(knowledge(lethal, "lethal", "skunk1").rules)
            .toContainEqual(expect.objectContaining({ id: "skunk.explosion-safe-lethal" }));
        expect(knowledge(lethal, "lethal", "skunk1").rules
            .filter(({ id }) => id.startsWith("skunk.explosion"))
            .reduce((total, rule) => total + rule.adjustment, 0)).toBe(0);
    });

    it("waives threshold risk when the remaining party damage EV covers the surviving Skunk", () => {
        const context = fixture(
            [enemy("skunk1", { currHp: 100 }), enemy("other1")],
            [attack("cross", ["skunk1"], 50)],
            [character("hero"), character("ally1"), character("ally2")],
        );
        context.actions.push(
            action("ally1", [attack("follow-a", ["skunk1"], 40)]),
            action("ally2", [attack("follow-b", ["skunk1"], 35)]),
        );

        const result = knowledge(context, "cross", "skunk1");
        expect(result.rules).toContainEqual(expect.objectContaining({
            id: "skunk.explosion-covered-threshold-crossing",
            adjustment: 0,
            details: expect.objectContaining({
                crossingProbability: 1,
                coveredCrossingProbability: 1,
                uncoveredCrossingProbability: 0,
                remainingPartyDamageEV: 75,
            }),
        }));
        expect(result.rules.some(({ id }) =>
            id === "skunk.explosion-nonlethal-threshold-risk"
        )).toBe(false);
    });

    it("keeps threshold risk when the remaining party damage EV is insufficient", () => {
        const context = fixture(
            [enemy("skunk1", { currHp: 100 }), enemy("other1")],
            [attack("cross", ["skunk1"], 50)],
            [character("hero"), character("ally")],
        );
        context.actions.push(
            action("ally", [attack("follow", ["skunk1"], 40)]),
        );

        const rule = knowledge(context, "cross", "skunk1").rules.find(({ id }) =>
            id === "skunk.explosion-nonlethal-threshold-risk"
        );
        expect(rule?.adjustment).toBeLessThan(0);
        expect(rule?.details).toMatchObject({
            crossingProbability: 1,
            coveredCrossingProbability: 0,
            uncoveredCrossingProbability: 1,
            remainingPartyDamageEV: 40,
        });
    });

    it("ignores spent actors when estimating remaining party damage", () => {
        const context = fixture(
            [enemy("skunk1", { currHp: 100 }), enemy("other1")],
            [attack("cross", ["skunk1"], 50)],
            [character("hero"), character("spent")],
        );
        const spent = action("spent", [attack("follow", ["skunk1"], 100)]);
        spent.available = false;
        spent.reason = "actorAlreadyActed";
        context.actions.push(spent);

        const rule = knowledge(context, "cross", "skunk1").rules.find(({ id }) =>
            id === "skunk.explosion-nonlethal-threshold-risk"
        );
        expect(rule?.details).toMatchObject({
            uncoveredCrossingProbability: 1,
            remainingPartyDamageEV: 0,
        });
    });

    it("uses each remaining actor's best attack instead of summing alternate moves", () => {
        const context = fixture(
            [enemy("skunk1", { currHp: 100 }), enemy("other1")],
            [attack("cross", ["skunk1"], 50)],
            [character("hero"), character("ally")],
        );
        context.actions.push(
            action("ally", [
                attack("option-a", ["skunk1"], 40),
                attack("option-b", ["skunk1"], 40),
            ]),
        );

        const rule = knowledge(context, "cross", "skunk1").rules.find(({ id }) =>
            id === "skunk.explosion-nonlethal-threshold-risk"
        );
        expect(rule?.details).toMatchObject({
            uncoveredCrossingProbability: 1,
            remainingPartyDamageEV: 40,
        });
    });

    it("adds urgency only when an already-low Skunk can actually be removed", () => {
        const context = fixture(
            [enemy("skunk1", { currHp: 50 })],
            [attack("poke", ["skunk1"], 10), attack("finish", ["skunk1"], 50)],
        );
        expect(knowledge(context, "poke", "skunk1").rules)
            .toContainEqual(expect.objectContaining({ id: "skunk.explosion-imminent-unresolved", adjustment: 0 }));
        expect(knowledge(context, "finish", "skunk1").rules)
            .toContainEqual(expect.objectContaining({
                id: "skunk.explosion-imminent-lethal-removal",
                adjustment: expect.any(Number),
            }));
        expect(knowledge(context, "finish", "skunk1").raw).toBeGreaterThan(0);
    });

    it("finds ordered multihit risk even when aggregate expected damage is lethal", () => {
        const context = fixture(
            [enemy("skunk1", { currHp: 100 }), enemy("other1")],
            [attack("six-hit", ["skunk1"], 20, 6, 90)],
        );
        const rule = knowledge(context, "six-hit", "skunk1").rules.find(({ id }) =>
            id === "skunk.explosion-nonlethal-threshold-risk"
        );
        expect(rule).toBeDefined();
        expect(rule?.details).toMatchObject({ safeLethal: false });
    });

    it("scales crossing risk with miss probability and ignores unrelated enemies", () => {
        const certain = fixture(
            [enemy("skunk1", { currHp: 100 }), enemy("other1")],
            [attack("hit", ["skunk1"], 50)],
        );
        const uncertain = fixture(
            [enemy("skunk1", { currHp: 100 }), enemy("other1")],
            [attack("hit", ["skunk1"], 50, 1, 50)],
        );
        expect(Math.abs(knowledge(uncertain, "hit", "skunk1").raw))
            .toBeLessThan(Math.abs(knowledge(certain, "hit", "skunk1").raw));

        const queen = fixture([enemy("queen1", { currHp: 100 })], [attack("hit", ["queen1"], 30)]);
        expect(knowledge(queen, "hit", "queen1").rules
            .some(({ id }) => id.includes("explosion"))).toBe(false);
    });
});
