import { describe, expect, it } from "vitest";
import { stockStrings } from "../helpers/stockStrings";
import type {
    ActionView,
    Character,
    Enemy,
    FailureReason,
    ThresholdInfo,
} from "../../src/engine/public/types";
import { Presentation } from "../../src/ui/presentation/presentation";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { createBattleOverviewViewModel } from "../../src/ui/web/app/viewModels/battleOverview";
import {
    createEnemyCardViewModel,
    summarizeIntentions,
} from "../../src/ui/web/app/viewModels/enemyCard";
import { createPartyCardViewModel } from "../../src/ui/web/app/viewModels/partyCard";

import { makePublicActionView, makePublicBinding, makePublicCharacter, makePublicEnemy } from "../helpers/publicTestData";

const presentation = new Presentation(stockStrings);

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
        const enemy: Enemy = makePublicEnemy("queen1", {
            defId: "queen",
            rank: "boss",
            currHp: 234,
            maxHp: 750,
            intentions: Array.from({ length: 5 }, () => ({
                move: "skunkGun",
                targets: [{ target: "ko", band: "crit", effects: [] }],
                effects: [],
            })),
        });

        const model = createEnemyCardViewModel(enemy, presentation);

        expect(model.intentions).toHaveLength(5);
        expect(model.visibleIntentions).toHaveLength(2);
        expect(model.visibleIntentions[0]).toMatchObject({
            moveLabel: "Skunk Gun",
            targetLabel: "Ko-chan",
            outcome: "crit",
            outcomeLabel: "Crit",
        });
        expect(model.overflowCount).toBe(3);
        expect(model.overflowLabel).toBe("+3");
        expect(model.overflowAriaLabel).toBe("3 more intentions");
    });

    it("projects, deduplicates, and filters linked player relationships", () => {
        const enemy: Enemy = makePublicEnemy("skunkette1", {
            defId: "skunkette",
            currHp: 200,
            maxHp: 200,
            buffs: [
                { id: "pounce", linkedEntity: "ko" },
                { id: "skunked", linkedEntity: "ko" },
                { id: "ignored", linkedEntity: "not-a-player" },
                { id: "pounce", linkedEntity: "matsuko" },
            ],
        });

        const model = createEnemyCardViewModel(
            enemy,
            presentation,
            [makePublicCharacter("ko"), makePublicCharacter("ko", { id: "matsuko" })],
        );

        expect(model.linkedEntities).toEqual([
            { accessibleLabel: "Linked to Ko-chan", id: "ko", name: "Ko-chan", tone: "ko" },
            { accessibleLabel: "Linked to Matsuko", id: "matsuko", name: "Matsuko", tone: "matsuko" },
        ]);
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
            makePublicCharacter("ko", { acted }),
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
            makePublicCharacter("ko"),
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
        const source = makePublicCharacter("ko", {
            blockedMoveTypes: ["arms", "none", "legs"],
            bindings: [makePublicBinding("latexArms", {
                value: 41,
                level: "heavy",
            })],
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

    it("projects incoming binding as an effective signed delta with a result level", () => {
        const bindingThresholds: ThresholdInfo = {
            thresholds: { light: 10, moderate: 20, heavy: 30, severe: 50, overwhelming: 80 },
            max: 100,
        };
        const model = createPartyCardViewModel(
            makePublicCharacter("ko", {
                bindings: [makePublicBinding("latexArms", {
                    value: 90,
                    level: "overwhelming",
                    data: { peak: 96 },
                })],
            }),
            action(),
            bindingThresholds,
            presentation,
            undefined,
            { latexArms: 25 },
        );

        expect(model.bindings[0]).toMatchObject({
            current: 90,
            change: 3,
            peak: 96,
            resultLevel: "overwhelming",
        });
    });

    it("projects mixed and clean characters through encounter binding order", () => {
        const mixed = createPartyCardViewModel(
            makePublicCharacter("ko", {
                bindings: [makePublicBinding("latexArms", {
                    value: 41,
                    level: "heavy",
                })],
            }),
            action(),
            thresholds,
            presentation,
            ["latexLegs", "latexArms", "latexHead"],
        );
        const clean = createPartyCardViewModel(
            makePublicCharacter("ko"),
            action(),
            thresholds,
            presentation,
            ["latexHead", "latexArms", "latexTorso", "latexLegs"],
        );

        expect(mixed.bindings.map(({ id, current, level }) => ({ id, current, level }))).toEqual([
            { id: "latexLegs", current: 0, level: "none" },
            { id: "latexArms", current: 41, level: "heavy" },
            { id: "latexHead", current: 0, level: "none" },
        ]);
        expect(clean.bindings.map(({ current, level }) => ({ current, level }))).toEqual([
            { current: 0, level: "none" },
            { current: 0, level: "none" },
            { current: 0, level: "none" },
            { current: 0, level: "none" },
        ]);
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
            difficultyLabel: "Standard",
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

function action(reason?: FailureReason, stanceReason?: FailureReason): ActionView {
    return makePublicActionView("ko", {
        available: reason === undefined,
        ...(reason ? { reason } : {}),
        stance: stanceReason
            ? { available: false, reason: stanceReason }
            : { available: true },
    });
}
