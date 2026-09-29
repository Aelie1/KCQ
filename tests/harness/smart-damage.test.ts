import { describe, expect, it } from "vitest";
import type { PreviewProfile } from "../../src/engine/public/types";
import type { SmartCandidate } from "../../src/harness/policy/smart";
import {
    damageDistribution,
    probabilityDamageAtLeast,
} from "../../src/harness/policy/smart";

function candidate(damage: PreviewProfile, hits = 1): SmartCandidate {
    return {
        action: { type: "move", actor: "hero", move: "attack", targets: ["enemy"] },
        effects: [],
        hits,
        targets: [{
            valid: true,
            target: "enemy",
            effects: [],
            damage,
        }],
    };
}

describe("Smart public-preview damage distribution", () => {
    it("represents a single deterministic damage value", () => {
        expect(damageDistribution(candidate({
            hit: { chance: 100, min: 7, max: 7 },
        }), "enemy")).toEqual([{ damage: 7, probability: 1 }]);
    });

    it("distributes a flat band uniformly across every inclusive integer", () => {
        const outcomes = damageDistribution(candidate({
            hit: { chance: 100, min: 10, max: 12 },
        }), "enemy");

        expect(outcomes.map(({ damage }) => damage)).toEqual([10, 11, 12]);
        for (const outcome of outcomes) expect(outcome.probability).toBeCloseTo(1 / 3);
    });

    it("merges damage values shared by overlapping bands", () => {
        expect(damageDistribution(candidate({
            hit: { chance: 50, min: 2, max: 3 },
            crit: { chance: 50, min: 3, max: 4 },
        }), "enemy")).toEqual([
            { damage: 2, probability: 0.25 },
            { damage: 3, probability: 0.5 },
            { damage: 4, probability: 0.25 },
        ]);
    });

    it("convolves independently resolved multihit damage", () => {
        expect(damageDistribution(candidate({
            miss: { chance: 50, min: 0, max: 0 },
            hit: { chance: 50, min: 2, max: 2 },
        }, 2), "enemy")).toEqual([
            { damage: 0, probability: 0.25 },
            { damage: 2, probability: 0.5 },
            { damage: 4, probability: 0.25 },
        ]);
    });

    it("calculates at-least probabilities at inclusive boundaries", () => {
        const attack = candidate({
            miss: { chance: 50, min: 0, max: 0 },
            hit: { chance: 50, min: 2, max: 2 },
        }, 2);

        expect(probabilityDamageAtLeast(attack, "enemy", 0)).toBe(1);
        expect(probabilityDamageAtLeast(attack, "enemy", 1)).toBe(0.75);
        expect(probabilityDamageAtLeast(attack, "enemy", 2)).toBe(0.75);
        expect(probabilityDamageAtLeast(attack, "enemy", 3)).toBe(0.25);
        expect(probabilityDamageAtLeast(attack, "enemy", 4)).toBe(0.25);
        expect(probabilityDamageAtLeast(attack, "enemy", 5)).toBe(0);
    });

    it("treats unrepresented preview probability as zero previewed damage", () => {
        expect(damageDistribution(candidate({
            hit: { chance: 40, min: 5, max: 5 },
        }), "enemy")).toEqual([
            { damage: 0, probability: 0.6 },
            { damage: 5, probability: 0.4 },
        ]);
    });
});
