import { describe, expect, it } from "vitest";
import type {
    ActionView,
    Character,
    Enemy,
    FailureReason,
    ThresholdInfo,
} from "../../src/engine/public/types";
import { Presentation } from "../../src/ui/presentation/presentation";
import { englishStrings } from "../../src/ui/presentation/localization/en";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { createBattleOverviewViewModel } from "../../src/ui/web/app/viewModels/battleOverview";
import {
    createEnemyCardViewModel,
    summarizeIntentions,
} from "../../src/ui/web/app/viewModels/enemyCard";
import { createPartyCardViewModel } from "../../src/ui/web/app/viewModels/partyCard";

const presentation = new Presentation(englishStrings);

describe("enemy card view model", () => {
    it.each([
        [0, 0, 0],
        [1, 1, 0],
        [2, 2, 0],
        [3, 2, 1],
        [5, 2, 3],
    ])("summarizes %i intentions as %i visible and %i overflow", (
        total,
        visible,
        overflow,
    ) => {
        const intentions = Array.from({ length: total }, (_, index) => index);

        expect(summarizeIntentions(intentions)).toEqual({
            visibleIntentions: intentions.slice(0, visible),
            overflowCount: overflow,
        });
    });

    it("retains every engine intention while localizing the compact summary", () => {
        const enemy: Enemy = {
            id: "queen1",
            defId: "queen",
            rank: "boss",
            currHp: 234,
            maxHp: 750,
            currDef: 0,
            intentions: Array.from({ length: 5 }, () => ({
                move: "skunkGun",
                targets: [{ target: "ko", band: "crit", effects: [] }],
                effects: [],
            })),
            buffs: [],
            cooldowns: {},
        };

        const model = createEnemyCardViewModel(enemy, presentation);

        expect(model.intentions).toHaveLength(5);
        expect(model.visibleIntentions).toHaveLength(2);
        expect(model.visibleIntentions[0]).toMatchObject({
            moveLabel: "Skunk Gun",
            targetLabel: "Ko-chan",
            outcome: "crit",
            outcomeLabel: "Critical",
        });
        expect(model.overflowCount).toBe(3);
        expect(model.overflowLabel).toBe("+3");
        expect(model.overflowAriaLabel).toBe("3 more intentions");
    });
});

describe("party card view model", () => {
    it.each([
        [undefined, undefined, false, "ready", "Ready"],
        ["actorAlreadyActed", undefined, true, "acted", "Acted"],
        [undefined, "actorImmobilized", false, "ready", "Ready"],
        ["actorIncapacitated", undefined, false, "incapacitated", "Incapacitated"],
        ["actorSkipped", undefined, false, "skipped", "Skipped"],
    ] as const)("maps engine state to %s / %s / %s as %s", (
        reason,
        stanceReason,
        acted,
        expectedKind,
        expectedLabel,
    ) => {
        const model = createPartyCardViewModel(
            character({ acted }),
            action(reason, stanceReason),
            thresholds,
            presentation,
        );

        expect(model.actionState).toMatchObject({
            kind: expectedKind,
            label: expectedLabel,
        });
    });

    it("keeps Ready action state independent from an immobilized stance", () => {
        const model = createPartyCardViewModel(
            character(),
            action(undefined, "actorImmobilized"),
            thresholds,
            presentation,
        );

        expect(model.actionState).toMatchObject({ kind: "ready", label: "Ready" });
        expect(model.stanceState).toMatchObject({
            kind: "immobilized",
            label: "Immobilized",
            tone: "danger",
        });
    });

    it("uses engine binding data and applies stable effect overflow policy", () => {
        const source = character({
            blockedMoveTypes: ["arms", "none", "legs"],
            bindings: [{
                id: "latexArms",
                value: 41,
                level: "heavy",
                data: {},
                status: [],
                tickEffects: [],
            }],
            buffs: [
                { id: "pounce" },
                { id: "burnout" },
                { id: "empowerment" },
                { id: "reflect" },
            ],
        });

        const model = createPartyCardViewModel(source, action(), thresholds, presentation);

        expect(model.bindings).toEqual([{
            id: "latexArms",
            label: "A",
            current: 41,
            max: 123,
            level: "heavy",
        }]);
        expect(model.blockedCapabilities).toEqual([
            { kind: "arms", label: "Arms" },
            { kind: "legs", label: "Legs" },
        ]);
        expect(model.effects).toBe(source.buffs);
        expect(model.visibleEffects).toEqual(["Pounce", "Burnout"]);
        expect(model.hiddenEffectCount).toBe(2);
        expect(model.effectsOverflowLabel).toBe("+2 more");
    });
});

describe("battle overview view model", () => {
    it("composes localized battle, enemy, trap, and party models from engine views", () => {
        const fixture = battleOverviewFixture;
        const model = createBattleOverviewViewModel(
            fixture.state,
            fixture.actions,
            fixture.thresholds,
            fixture.presentation,
        );

        expect(model.header).toMatchObject({
            encounterLabel: "Fight with Skunks",
            roundLabel: "Round 4",
            phaseLabel: "Enemy Phase",
            trap: {
                id: "trapPuddle",
                label: "Latex Puddle",
                amount: 57,
                max: 100,
                fillPercent: 57,
                valueLabel: "57/100",
            },
        });
        expect(model.enemiesCountLabel).toBe("6 remaining");
        expect(model.enemies).toHaveLength(6);
        expect(model.enemies[3].intentions).toHaveLength(3);
        expect(model.enemies[3].visibleIntentions).toHaveLength(2);
        expect(model.enemies[3].overflowCount).toBe(1);
        expect(model.partyCountLabel).toBe("3 / 3");
        expect(model.party[0].actionState.kind).toBe("ready");
        expect(model.party[0].stanceState.kind).toBe("immobilized");
        expect(model.party[1].stanceState.kind).toBe("moving");
        expect(model.party[2].stanceState.kind).toBe("standing");
    });

    it("rejects a state without a matching public action view", () => {
        const fixture = battleOverviewFixture;

        expect(() => createBattleOverviewViewModel(
            fixture.state,
            fixture.actions.slice(1),
            fixture.thresholds,
            fixture.presentation,
        )).toThrow("Missing ActionView for character ko.");
    });
});

const thresholds: ThresholdInfo = {
    thresholds: { heavy: 35 },
    max: 123,
};

function character(overrides: Partial<Character> = {}): Character {
    return {
        id: "ko",
        acted: false,
        standing: false,
        bonusEscapes: 0,
        bindings: [],
        buffs: [],
        cooldowns: {},
        modifiers: {},
        blockedMoveTypes: [],
        data: {},
        ...overrides,
    };
}

function action(reason?: FailureReason, stanceReason?: FailureReason): ActionView {
    return {
        id: "ko",
        available: reason === undefined,
        ...(reason ? { reason } : {}),
        moves: [],
        escapes: [],
        stance: stanceReason
            ? { available: false, reason: stanceReason }
            : { available: true },
    };
}
