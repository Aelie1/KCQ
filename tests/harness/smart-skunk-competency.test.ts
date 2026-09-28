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
    evaluateKitKnowledge,
    evaluateSmartDecision,
    generateSmartCandidates,
} from "../../src/harness/policy/smart";
import { createEmptyContentLibrary } from "../helpers/library";

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
    return {
        id,
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
    mutateLibrary?.(library);
    const state: GameState = {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
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

    it("penalizes a nonlethal threshold crossing but preserves a large clean kill", () => {
        const risky = fixture([enemy("skunk1", { currHp: 100 })], [attack("risk", ["skunk1"], 30)]);
        const lethal = fixture([enemy("skunk1", { currHp: 100 })], [attack("lethal", ["skunk1"], 100)]);
        expect(knowledge(risky, "risk", "skunk1").rules)
            .toContainEqual(expect.objectContaining({
                id: "skunk.explosion-nonlethal-threshold-risk",
                adjustment: expect.any(Number),
            }));
        expect(knowledge(risky, "risk", "skunk1").raw).toBeLessThan(0);
        expect(knowledge(lethal, "lethal", "skunk1").rules)
            .toContainEqual(expect.objectContaining({ id: "skunk.explosion-safe-lethal" }));
        expect(knowledge(lethal, "lethal", "skunk1").raw).toBe(0);
    });

    it("adds urgency only when an already-low Skunk can actually be removed", () => {
        const context = fixture(
            [enemy("skunk1", { currHp: 60 })],
            [attack("poke", ["skunk1"], 10), attack("finish", ["skunk1"], 60)],
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
            [enemy("skunk1", { currHp: 100 })],
            [attack("six-hit", ["skunk1"], 20, 6, 90)],
        );
        const rule = knowledge(context, "six-hit", "skunk1").rules.find(({ id }) =>
            id === "skunk.explosion-nonlethal-threshold-risk"
        );
        expect(rule).toBeDefined();
        expect(rule?.details).toMatchObject({ safeLethal: false });
    });

    it("scales crossing risk with miss probability and ignores unrelated enemies", () => {
        const certain = fixture([enemy("skunk1", { currHp: 100 })], [attack("hit", ["skunk1"], 30)]);
        const uncertain = fixture([enemy("skunk1", { currHp: 100 })], [attack("hit", ["skunk1"], 30, 1, 50)]);
        expect(Math.abs(knowledge(uncertain, "hit", "skunk1").raw))
            .toBeLessThan(Math.abs(knowledge(certain, "hit", "skunk1").raw));

        const queen = fixture([enemy("queen1", { currHp: 100 })], [attack("hit", ["queen1"], 30)]);
        expect(knowledge(queen, "hit", "queen1").rules
            .some(({ id }) => id.includes("explosion"))).toBe(false);
    });
});
