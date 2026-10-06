import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import type {
    ActionView,
    Character,
    Enemy,
    GameEvent,
    GameState,
    PlayerAction,
    ValidTarget,
} from "../../src/engine/public/types";
import {
    createDetailedCombatCollector,
    type MetricActionObservation,
} from "../../src/harness/metrics";
import { makePublicCharacter, makePublicEnemy, makePublicGameState } from "../helpers/publicTestData";

function enemy(id: string, exploding = false): Enemy {
    const defId = /^(fairy|queen|rainmaker|skunk|skunkette)\d+$/.exec(id)?.[1] ?? id;
    return makePublicEnemy(id, {
        defId,
        maxHp: 300,
        currHp: 50,
        intentions: exploding
            ? [{ move: "latexExplosion", targets: [], effects: [] }]
            : [],
    });
}

function state(): GameState {
    return makePublicGameState({
        characters: [makePublicCharacter("ko", { standing: true })],
        enemies: [
            enemy("skunk1", true),
            enemy("other"),
        ],
    });
}

function damagePreview(target: string): ValidTarget {
    return {
        valid: true,
        target,
        accuracy: {
            hit: 100,
        },
        damage: {
            hit: {
                chance: 100,
                min: 20,
                max: 30,
            },
        },
        effects: [],
    };
}

function actionViews(
    includeDamage = true,
): ActionView[] {
    return [{
        id: "ko",
        available: true,

        moves: [{
            move: {
                id: "telekinesis",
                targetSide: "enemy",
                targets: 1,
                type: "arms",
            },

            available: includeDamage,

            targets: includeDamage
                ? [
                    damagePreview("skunk1"),
                    damagePreview("other"),
                ]
                : [],

            effects: [],
        }, {
            move: {
                id: "stop",
                targetSide: "enemy",
                targets: 1,
                type: "mouth",
            },

            available: true,

            targets: [{
                valid: true,
                target: "skunk1",
                effects: [],
            }],

            effects: [],
        }],

        escapes: [],
        stance: {
            available: true,
        },
    }];
}

function eventFor(
    action: PlayerAction,
): GameEvent {
    if (action.type === "move") {
        return {
            type: "useMove",
            actor: action.actor,
            move: action.move,

            targets: action.targets.map(
                (target) => ({
                    target,
                    result: "hit" as const,
                    effects: [],
                }),
            ),

            effects: [],
        };
    }

    return {
        type: "changePhase",
        phase: "player",
        effects: [],
    };
}

function observe(
    action: PlayerAction,
    actions: ActionView[],
): MetricActionObservation {
    const before = state();

    return {
        actionIndex: 1,
        action,
        before,
        actions,

        result: {
            success: true,
            actions: [],
            frames: [{
                event: eventFor(action),
                state: before,
            }],
        },
    };
}

describe("Skunk Explosion response metrics", () => {
    it("records escape decisions made despite a legal damage option", () => {
        const collector =
            createDetailedCombatCollector();

        const before = state();

        collector.onFightStart?.({
            view: before,
            library: createEngine(1).getLibrary(),
        });

        collector.onAction?.(
            observe(
                {
                    type: "escape",
                    actor: "ko",
                    target: "ko",
                    binding: "latexArms",
                },
                actionViews(),
            ),
        );

        expect(
            collector.getResult().skunkExplosionResponse,
        ).toMatchObject({
            decisionsObserved: 1,
            withDamageOption: 1,

            actions: {
                escape: 1,
            },

            whileDamageOptionAvailable: {
                escape: 1,
            },
        });
    });

    it("records attacks against the exploding Skunk and the selected move/target", () => {
        const collector =
            createDetailedCombatCollector();

        const before = state();

        collector.onFightStart?.({
            view: before,
            library: createEngine(1).getLibrary(),
        });

        collector.onAction?.(
            observe(
                {
                    type: "move",
                    actor: "ko",
                    move: "telekinesis",
                    targets: ["skunk1"],
                },
                actionViews(),
            ),
        );

        expect(
            collector.getResult().skunkExplosionResponse,
        ).toMatchObject({
            decisionsObserved: 1,
            withDamageOption: 1,

            actions: {
                damageExplodingSkunk: 1,
            },

            whileDamageOptionAvailable: {
                damageExplodingSkunk: 1,
            },

            movesByMove: {
                telekinesis: 1,
            },

            targetsById: {
                skunk1: 1,
            },

            damageExplodingSkunkByMove: {
                telekinesis: 1,
            },
        });
    });

    it("distinguishes damaging another enemy while the exploding Skunk was attackable", () => {
        const collector =
            createDetailedCombatCollector();

        const before = state();

        collector.onFightStart?.({
            view: before,
            library: createEngine(1).getLibrary(),
        });

        collector.onAction?.(
            observe(
                {
                    type: "move",
                    actor: "ko",
                    move: "telekinesis",
                    targets: ["other"],
                },
                actionViews(),
            ),
        );

        expect(
            collector.getResult().skunkExplosionResponse,
        ).toMatchObject({
            decisionsObserved: 1,
            withDamageOption: 1,

            actions: {
                damageOtherEnemy: 1,
            },

            whileDamageOptionAvailable: {
                damageOtherEnemy: 1,
            },

            targetsById: {
                other: 1,
            },

            damageOtherEnemyByMove: {
                telekinesis: 1,
            },
        });
    });

    it("does not claim a damage option when ActionView says it is unavailable", () => {
        const collector =
            createDetailedCombatCollector();

        const before = state();

        collector.onFightStart?.({
            view: before,
            library: createEngine(1).getLibrary(),
        });

        collector.onAction?.(
            observe(
                {
                    type: "endTurn",
                },
                actionViews(false),
            ),
        );

        expect(
            collector.getResult().skunkExplosionResponse,
        ).toMatchObject({
            decisionsObserved: 1,
            withDamageOption: 0,

            actions: {
                endTurn: 1,
            },

            whileDamageOptionAvailable: {
                endTurn: 0,
            },
        });
    });
});
