import { describe, expect, it } from "vitest";
import type {
    ActionInfo,
    ActionView,
    Character,
    Enemy,
    GameState,
    PreviewInfo,
} from "../../src/engine/public/types";
import {
    createPolicyRandom,
    runSingleFight,
    type FightPolicy,
    type PolicyContext,
} from "../../src/harness/harness";
import { runBatch } from "../../src/harness/batch/batch";
import { getPolicy, policies } from "../../src/harness/policies";
import {
    evaluateSmartDecision,
    expectedDamageScorer,
    generateSmartCandidates,
    smartScorers,
    smartPolicy,
    type SmartDecision,
    type SmartScorer,
} from "../../src/harness/policy/smart";
import { firstPolicy } from "../../src/harness/policy/first";
import { createEngine } from "../../src/engine/public/engine";

function character(id: string): Character {
    return {
        id,
        acted: false,
        standing: false,
        bonusEscapes: 0,
        bindings: [],
        buffs: [],
        cooldowns: {},
        modifiers: {},
        blockedMoveTypes: [],
        data: {},
    };
}

function enemy(id: string): Enemy {
    return {
        id,
        rank: "enemy",
        maxHp: 100,
        currHp: 100,
        currDef: 0,
        intentions: [],
        buffs: [],
        cooldowns: {},
    };
}

function state(enemyIds = ["enemy-1", "enemy-2", "enemy-3"]): GameState {
    return {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        characters: [character("hero"), character("ally")],
        enemies: enemyIds.map(enemy),
        traps: [],
        encounter: null,
    };
}

function view(
    id: string,
    values: Partial<Omit<ActionView, "id">> = {},
): ActionView {
    return {
        id,
        available: true,
        moves: [],
        escapes: [],
        stance: { available: false, reason: "moveUnavailable" },
        ...values,
    };
}

function target(
    id: string | null,
    values: Partial<Extract<PreviewInfo, { valid: true }>> = {},
): Extract<PreviewInfo, { valid: true }> {
    return { valid: true, target: id, effects: [], ...values };
}

function move(
    id: string,
    targets: number | "all",
    previews: PreviewInfo[],
    values: Partial<ActionInfo> = {},
): ActionInfo {
    return {
        move: { id, targetSide: "enemy", targets, type: "arms" },
        available: true,
        effects: [],
        targets: previews,
        ...values,
    };
}

function context(actions: ActionView[], gameState = state()): PolicyContext {
    return {
        state: gameState,
        actions,
        random: {
            next: () => { throw new Error("Smart must not consume policy random"); },
            integer: () => { throw new Error("Smart must not consume policy random"); },
        },
    };
}

function scores(decision: ReturnType<typeof evaluateSmartDecision>): number[] {
    return decision.candidates.map((candidate) => candidate.total);
}

describe("Smart 1 candidate generation", () => {
    it("enumerates legal primary actions in stable order", () => {
        const invalid: PreviewInfo = {
            valid: false,
            target: "enemy-bad",
            reason: "invalidTarget",
        };
        const actions = [
            view("disabled-actor", {
                available: false,
                reason: "actorAlreadyActed",
                moves: [move("ignored-actor-move", 1, [target("enemy-1")])],
            }),
            view("hero", {
                moves: [
                    move("unavailable", 1, [target("enemy-1")], {
                        available: false,
                        reason: "moveUnavailable",
                    }),
                    move("single", 1, [target("enemy-1"), invalid, target("enemy-2")]),
                    move("double", 2, [
                        target("enemy-1"),
                        target("enemy-2"),
                        target("enemy-3"),
                    ]),
                    move("empty", 0, [target(null)]),
                    move("everyone", "all", [target("enemy-1"), invalid, target("enemy-2")]),
                ],
                escapes: [
                    {
                        available: false,
                        reason: "escapeUnavailable",
                        target: "hero",
                        binding: "ignored-rope",
                        effects: [],
                    },
                    {
                        available: true,
                        target: "ally",
                        binding: "rope",
                        effects: [],
                    },
                ],
                stance: { available: true },
            }),
        ];

        const candidates = generateSmartCandidates(context(actions));

        expect(candidates.map(({ action }) => action)).toEqual([
            { type: "move", actor: "hero", move: "single", targets: ["enemy-1"] },
            { type: "move", actor: "hero", move: "single", targets: ["enemy-2"] },
            { type: "move", actor: "hero", move: "double", targets: ["enemy-1", "enemy-2"] },
            { type: "move", actor: "hero", move: "double", targets: ["enemy-1", "enemy-3"] },
            { type: "move", actor: "hero", move: "double", targets: ["enemy-2", "enemy-3"] },
            { type: "move", actor: "hero", move: "empty", targets: [] },
            { type: "move", actor: "hero", move: "everyone", targets: [] },
            { type: "escape", actor: "hero", target: "ally", binding: "rope" },
            { type: "endTurn" },
        ]);
        expect(candidates.at(-1)?.action).toEqual({ type: "endTurn" });
        expect(candidates.some(({ action }) => action.type === "stance")).toBe(false);
        expect(candidates[6].targets.map(({ target: id }) => id)).toEqual([
            "enemy-1",
            "enemy-2",
        ]);
    });

    it("does not duplicate target IDs or permutations", () => {
        const candidates = generateSmartCandidates(context([
            view("hero", {
                moves: [move("pair", 2, [
                    target("enemy-1"),
                    target("enemy-1"),
                    target("enemy-2"),
                ])],
            }),
        ]));

        expect(candidates.map(({ action }) => action)).toEqual([
            { type: "move", actor: "hero", move: "pair", targets: ["enemy-1", "enemy-2"] },
            { type: "endTurn" },
        ]);
    });
});

describe("Smart 2 composable scoring", () => {
    it("retains raw values and weights, sums contributions, and selects by combined total", () => {
        const fixture = context([view("hero", {
            moves: [
                move("largest-individual", 0, [target(null)]),
                move("best-combined", 0, [target(null)]),
            ],
        })]);
        const impact: SmartScorer = {
            id: "impact",
            weight: 1,
            prepare: () => ({ action }) => action.type === "move"
                ? (action.move === "largest-individual" ? 10 : 8)
                : 0,
        };
        const neutral: SmartScorer = {
            id: "neutral",
            weight: 0,
            prepare: () => () => 4,
        };
        const danger: SmartScorer = {
            id: "danger",
            weight: -1,
            prepare: () => ({ action }) => action.type === "move"
                ? (action.move === "largest-individual" ? 5 : 1)
                : 0,
        };

        const decision = evaluateSmartDecision(fixture, [impact, neutral, danger]);

        expect(Object.keys(decision.candidates[0].components)).toEqual([
            "impact",
            "neutral",
            "danger",
        ]);
        expect(decision.candidates[0].components).toEqual({
            impact: { raw: 10, weight: 1, score: 10 },
            neutral: { raw: 4, weight: 0, score: 0 },
            danger: { raw: 5, weight: -1, score: -5 },
        });
        expect(scores(decision)).toEqual([5, 7, 0]);
        expect(decision.selected.action).toMatchObject({ move: "best-combined" });

        const reweighted = evaluateSmartDecision(fixture, [
            impact,
            neutral,
            { ...danger, weight: 0 },
        ]);
        expect(reweighted.candidates[0].components.danger).toEqual({
            raw: 5,
            weight: 0,
            score: 0,
        });
        expect(scores(reweighted)).toEqual([10, 8, 0]);
        expect(reweighted.selected.action).toMatchObject({ move: "largest-individual" });
    });

    it("rejects duplicate component IDs before producing an ambiguous breakdown", () => {
        const duplicate: SmartScorer = { id: "same", weight: 1, prepare: () => () => 0 };
        expect(() => evaluateSmartDecision(context([]), [duplicate, duplicate]))
            .toThrow("Duplicate Smart scorer ID: same");
    });

    it("prepares every scorer once per decision rather than once per candidate", () => {
        let preparations = 0;
        let evaluations = 0;
        const scorer: SmartScorer = {
            id: "prepared",
            weight: 1,
            prepare: (preparedContext) => {
                preparations += 1;
                const enemyCount = preparedContext.state.enemies.length;
                return () => {
                    evaluations += 1;
                    return enemyCount;
                };
            },
        };
        const fixture = context([view("hero", {
            moves: [
                move("one", 0, [target(null)]),
                move("two", 0, [target(null)]),
            ],
        })]);

        const decision = evaluateSmartDecision(fixture, [scorer]);

        expect(decision.candidates).toHaveLength(3);
        expect(preparations).toBe(1);
        expect(evaluations).toBe(3);
        expect(scores(decision)).toEqual([3, 3, 3]);
    });

    it("registers expected damage as the sole production scorer at weight 1", () => {
        expect(smartScorers).toEqual([expectedDamageScorer]);
        expect(expectedDamageScorer.id).toBe("expectedDamage");
        expect(expectedDamageScorer.weight).toBe(1);
    });
});

describe("Smart 2 expected direct enemy damage", () => {
    it("uses probability times band midpoint, sums bands, and scales by hits", () => {
        const strike = move("strike", 1, [target("enemy-1", {
            damage: {
                miss: { chance: 25, min: 0, max: 0 },
                hit: { chance: 50, min: 8, max: 12 },
                crit: { chance: 25, min: 28, max: 32 },
            },
        })]);
        strike.move.hits = 2;

        const decision = evaluateSmartDecision(context([view("hero", { moves: [strike] })]));

        // Per hit: .25*0 + .50*10 + .25*30 = 12.5; two hits = 25.
        expect(scores(decision)).toEqual([25, 0]);
        expect(decision.candidates[0].components).toEqual({
            expectedDamage: { raw: 25, weight: 1, score: 25 },
        });
    });

    it("sums only the selected targets for explicit multi-target actions", () => {
        const decision = evaluateSmartDecision(context([
            view("hero", {
                moves: [move("pair", 2, [
                    target("enemy-1", { damage: { hit: { chance: 100, min: 2, max: 2 } } }),
                    target("enemy-2", { damage: { hit: { chance: 100, min: 5, max: 5 } } }),
                    target("enemy-3", { damage: { hit: { chance: 100, min: 11, max: 11 } } }),
                ])],
            }),
        ]));

        expect(scores(decision)).toEqual([7, 13, 16, 0]);
        expect(decision.selected.action).toMatchObject({ targets: ["enemy-2", "enemy-3"] });
    });

    it("sums every valid target preview for all-target moves", () => {
        const decision = evaluateSmartDecision(context([
            view("hero", {
                moves: [move("all", "all", [
                    target("enemy-1", { damage: { hit: { chance: 100, min: 3, max: 3 } } }),
                    { valid: false, target: "enemy-2", reason: "invalidTarget" },
                    target("enemy-3", { damage: { hit: { chance: 100, min: 7, max: 7 } } }),
                ])],
            }),
        ]));

        expect(decision.candidates[0].action).toMatchObject({ targets: [] });
        expect(scores(decision)).toEqual([10, 0]);
    });

    it("counts enemy damage effects with their preview scope", () => {
        const strike = move("effects", 1, [target("enemy-1", {
            effects: [
                { type: "damage", target: "enemy-2", amount: 2 },
                { type: "damage", target: "hero", amount: 100 },
            ],
        })], {
            effects: [{ type: "damage", target: "enemy-3", amount: 5 }],
        });
        strike.move.hits = 3;

        const escapeView = view("hero", {
            moves: [strike],
            escapes: [{
                available: true,
                target: "hero",
                binding: "rope",
                effects: [
                    { type: "damage", target: "enemy-1", amount: 4 },
                    { type: "damage", target: "ally", amount: 50 },
                ],
            }],
        });
        const decision = evaluateSmartDecision(context([escapeView]));

        // Move-level 5 occurs once; target-level 2 occurs for each of 3 hits.
        expect(scores(decision)).toEqual([11, 4, 0]);
    });

    it("scores actions with no direct enemy damage at zero", () => {
        const decision = evaluateSmartDecision(context([
            view("hero", {
                moves: [move("buff", 0, [target(null)], {
                    effects: [{
                        type: "buff",
                        target: "hero",
                        buff: "focus",
                        operation: "add",
                    }],
                })],
                escapes: [{
                    available: true,
                    target: "hero",
                    binding: "rope",
                    effects: [{ type: "binding", target: "hero", binding: "rope", amount: -3 }],
                }],
            }),
        ]));

        expect(scores(decision)).toEqual([0, 0, 0]);
    });
});

describe("Smart 2 selection and integration", () => {
    it("selects the highest score and breaks ties by enumeration order", () => {
        const decision = evaluateSmartDecision(context([
            view("hero", {
                moves: [
                    move("first-tie", 1, [target("enemy-1", {
                        damage: { hit: { chance: 100, min: 10, max: 10 } },
                    })]),
                    move("lower", 1, [target("enemy-1", {
                        damage: { hit: { chance: 100, min: 9, max: 9 } },
                    })]),
                    move("second-tie", 1, [target("enemy-1", {
                        damage: { hit: { chance: 100, min: 10, max: 10 } },
                    })]),
                ],
            }),
        ]));

        expect(decision.selected).toBe(decision.candidates[0]);
        expect(decision.selected.action).toMatchObject({ move: "first-tie" });
    });

    it("is repeatable, exposes every score, and adapts to FightPolicy exactly", () => {
        const fixture = context([
            view("hero", {
                moves: [move("strike", 1, [target("enemy-1", {
                    damage: { hit: { chance: 100, min: 6, max: 6 } },
                })])],
            }),
        ]);

        const first = evaluateSmartDecision(fixture);
        const second = evaluateSmartDecision(fixture);

        expect(second).toEqual(first);
        expect(first.candidates).toHaveLength(2);
        expect(first.candidates.every((candidate) =>
            typeof candidate.total === "number"
            && typeof candidate.components.expectedDamage.raw === "number"
            && candidate.components.expectedDamage.weight === 1
            && candidate.components.expectedDamage.score === candidate.total,
        )).toBe(true);
        expect(smartPolicy.chooseAction(fixture)).toEqual(first.selected.action);
    });

    it("preserves representative Smart 1 scores and choices with the default scorer", () => {
        const multiHit = move("multi-hit", 1, [target("enemy-1", {
            damage: { hit: { chance: 100, min: 4, max: 4 } },
        })]);
        multiHit.move.hits = 3;
        const fixture = context([view("hero", {
            moves: [
                move("single", 1, [target("enemy-1", {
                    damage: { hit: { chance: 100, min: 9, max: 9 } },
                })]),
                move("all", "all", [
                    target("enemy-1", { damage: { hit: { chance: 100, min: 2, max: 2 } } }),
                    target("enemy-2", { damage: { hit: { chance: 100, min: 3, max: 3 } } }),
                ]),
                multiHit,
                move("utility", 0, [target(null)]),
                move("later-tie", 1, [target("enemy-2", {
                    damage: { hit: { chance: 100, min: 12, max: 12 } },
                })]),
            ],
        })]);

        const decision = evaluateSmartDecision(fixture);

        // These are the pre-refactor Smart 1 EVs: single, AoE, multihit, utility,
        // equal-scoring later candidate, and the final end-turn fallback.
        expect(scores(decision)).toEqual([9, 5, 12, 0, 12, 0]);
        expect(decision.selected).toBe(decision.candidates[2]);
        expect(decision.selected.action).toMatchObject({ move: "multi-hit" });
    });

    it("registers smart and completes a real stock encounter without rejected actions", () => {
        const encounterId = createEngine(1).listEncounters()[0];
        if (!encounterId) throw new Error("The stock encounter catalogue is empty");

        expect(getPolicy("smart")).toBe(smartPolicy);
        expect(policies.smart).toBe(smartPolicy);

        const result = runSingleFight({
            encounterId,
            engineSeed: 12345,
            policySeed: 67890,
            maxActions: 1_000,
            policy: smartPolicy,
        });

        expect(["victory", "defeat"]).toContain(result.termination);
        expect(result.error).toBeUndefined();
        expect(result.actionCount).toBeGreaterThan(0);
        expect(result.policyId).toBe("smart");
    });

    it("never consumes PolicyRandom", () => {
        const random = createPolicyRandom(123);
        const expectedFirstRoll = createPolicyRandom(123).next();
        evaluateSmartDecision({ ...context([]), random });
        expect(random.next()).toBe(expectedFirstRoll);
    });

    it("captures every Smart decision only for replay and executes the recorded selection", () => {
        const encounterId = createEngine(1).listEncounters()[0];
        if (!encounterId) throw new Error("The stock encounter catalogue is empty");

        const result = runSingleFight({
            encounterId,
            engineSeed: 2468,
            policySeed: 1357,
            maxActions: 1_000,
            policy: smartPolicy,
            replay: true,
        });

        expect(result.replay?.steps).toHaveLength(result.trace.length);
        expect(result.replay?.steps.length).toBeGreaterThan(0);
        for (const step of result.replay?.steps ?? []) {
            expect(step.policyDecision?.policyId).toBe("smart");
            const decision = step.policyDecision?.diagnostics as SmartDecision;
            expect(decision.candidates.length).toBeGreaterThan(0);
            expect(decision.candidates.every((candidate) =>
                typeof candidate.components.expectedDamage.raw === "number"
                && candidate.components.expectedDamage.weight === 1
                && candidate.total === candidate.components.expectedDamage.score,
            )).toBe(true);
            expect(step.action).toEqual(decision.selected.action);
        }
    });

    it("executes the same actions with replay diagnostics enabled", () => {
        const encounterId = createEngine(1).listEncounters()[0];
        if (!encounterId) throw new Error("The stock encounter catalogue is empty");
        const input = {
            encounterId,
            engineSeed: 8642,
            policySeed: 9753,
            maxActions: 1_000,
            policy: smartPolicy,
        };

        const ordinary = runSingleFight(input);
        const recorded = runSingleFight({ ...input, replay: true });

        expect(recorded.trace).toEqual(ordinary.trace);
        expect(recorded.termination).toBe(ordinary.termination);
        expect(recorded.finalState).toEqual(ordinary.finalState);
    });

    it("does not evaluate or retain detailed decisions in ordinary fights or batches", () => {
        const encounterId = createEngine(1).listEncounters()[0];
        if (!encounterId) throw new Error("The stock encounter catalogue is empty");
        let detailedEvaluations = 0;
        const observedSmart: FightPolicy = {
            ...smartPolicy,
            id: "observed-smart",
            evaluateDecision(context, chosenAction) {
                detailedEvaluations += 1;
                return smartPolicy.evaluateDecision!(context, chosenAction);
            },
        };

        const fight = runSingleFight({
            encounterId,
            engineSeed: 12,
            policySeed: 34,
            maxActions: 1_000,
            policy: observedSmart,
        });
        const batch = runBatch({
            encounterId,
            masterSeed: 56,
            runs: 2,
            maxActions: 1_000,
            policy: observedSmart,
        });

        expect(detailedEvaluations).toBe(0);
        expect(fight.replay).toBeUndefined();
        expect(batch.runs.every(({ result }) => result.replay === undefined)).toBe(true);
        expect(JSON.stringify({ fight, batch })).not.toContain("policyDecision");
    });

    it("leaves non-Smart replay steps unchanged", () => {
        const encounterId = createEngine(1).listEncounters()[0];
        if (!encounterId) throw new Error("The stock encounter catalogue is empty");

        const result = runSingleFight({
            encounterId,
            engineSeed: 99,
            policySeed: 88,
            maxActions: 1_000,
            policy: firstPolicy,
            replay: true,
        });

        expect(result.replay?.steps.length).toBeGreaterThan(0);
        expect(result.replay?.steps.every((step) => !("policyDecision" in step))).toBe(true);
    });
});
