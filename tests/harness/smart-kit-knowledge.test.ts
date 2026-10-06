import { describe, expect, it } from "vitest";
import type { ContentLibrary } from "../../src/engine/public/library";
import type {
    ActionInfo,
    ActionView,
    Binding,
    Buff,
    Character,
    Effect,
    Enemy,
    EntitySide,
    GameState,
    TargetCount,
} from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import {
    assessSmartBoard,
    detectPounceRelationships,
    EMPOWERED_OFFENSE_SUBSTITUTION_PENALTY,
    evaluateKitKnowledge,
    evaluateSmartDecision,
    generateSmartCandidates,
    IMMOLATION_RESERVE_PENALTY,
    KIT_KNOWLEDGE_WEIGHT,
    kitKnowledgeScorer,
    OBEY_KO_BONUS,
    POUNCE_CLEAR_BONUS,
    POUNCE_REMOVAL_VALUE,
    smartScorers,
} from "../../src/harness/policy/smart";
import { createEmptyContentLibrary } from "../helpers/library";
import { makePublicActionView, makePublicBinding, makePublicCharacter, makePublicEnemy, makePublicGameState } from "../helpers/publicTestData";
import { STANDARD_DIFFICULTY } from "../helpers/state";

function binding(id: string, value: number, level: Binding["level"]): Binding {
    return makePublicBinding(id, { value, level });
}

function enemy(id: string, values: Partial<Enemy> = {}): Enemy {
    const defId = /^(fairy|queen|rainmaker|skunk|skunkette)\d+$/.exec(id)?.[1] ?? id;
    return makePublicEnemy(id, { defId, maxHp: 200, currHp: 200, ...values });
}

interface MoveOptions {
    damage?: number;
    hits?: number;
    accuracy?: number;
    targets?: TargetCount;
    side?: EntitySide;
    effects?: Effect[];
    targetEffects?: Effect[];
}

function move(
    id: string,
    targetIds: Array<string | null>,
    options: MoveOptions = {},
): ActionInfo {
    const damage = options.damage ?? 0;
    const accuracy = options.accuracy ?? 100;
    return {
        move: {
            id,
            targetSide: options.side ?? "enemy",
            targets: options.targets ?? (targetIds.length === 0 ? 0 : 1),
            type: "arms",
            hits: options.hits ?? 1,
        },
        available: true,
        effects: options.effects ?? [],
        targets: targetIds.map((target) => ({
            valid: true,
            target,
            effects: options.targetEffects ?? [],
            ...(target !== null && damage > 0
                ? {
                    accuracy: { miss: 100 - accuracy, hit: accuracy },
                    damage: {
                        miss: { chance: 100 - accuracy, min: 0, max: 0 },
                        hit: { chance: accuracy, min: damage, max: damage },
                    },
                }
                : {}),
        })),
    };
}

function action(actor: string, moves: ActionInfo[]): ActionView {
    return makePublicActionView(actor, {
        moves,
        stance: { available: false, reason: "moveUnavailable" },
    });
}

function context(
    characters: Character[],
    enemies: Enemy[],
    actions: ActionView[],
): PolicyContext {
    const state: GameState = makePublicGameState({
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        difficulty: STANDARD_DIFFICULTY,
        characters,
        enemies,
        traps: [],
        encounter: null,
    });
    const library = createEmptyContentLibrary();
    addMoveReferences(library, actions);
    return {
        state,
        actions,
        thresholds: {
            thresholds: { light: 20, moderate: 40, heavy: 60, severe: 70, overwhelming: 80 },
            max: 100,
        },
        library,
        random: {
            next: () => { throw new Error("kit knowledge must not use policy random"); },
            integer: () => { throw new Error("kit knowledge must not use policy random"); },
        },
    };
}

function addMoveReferences(library: ContentLibrary, actions: ActionView[]): void {
    for (const view of actions) {
        for (const info of view.moves) {
            library.moves[info.move.id] = {
                ...info.move,
                bindings: [],
                baseHits: info.move.id === "rockfall"
                    ? 4
                    : info.move.id === "fairyRockfall" ? 6 : info.move.hits,
            };
        }
    }
}

function candidate(fixture: PolicyContext, moveId: string, targetId?: string) {
    const result = generateSmartCandidates(fixture).find((value) =>
        value.action.type === "move"
        && value.action.move === moveId
        && (targetId === undefined || value.action.targets.includes(targetId))
    );
    if (result === undefined) throw new Error(`Missing candidate ${moveId} -> ${targetId ?? "any"}`);
    return result;
}

function knowledge(fixture: PolicyContext, moveId: string, targetId?: string) {
    return evaluateKitKnowledge(
        fixture,
        assessSmartBoard(fixture),
        candidate(fixture, moveId, targetId),
    );
}

function pounceBuff(linkedEntity: string, level?: number): Buff {
    return {
        id: "pounce",
        linkedEntity,
        ...(level === undefined ? {} : { modifiers: { hit: level * 2 } }),
    };
}

function bindingIntention(
    moveId: string,
    target: string,
    bindingId: string,
    amount?: number,
    band: "miss" | "hit" = "hit",
): Enemy["intentions"][number] {
    return {
        move: moveId,
        targets: [{
            target,
            band,
            effects: amount === undefined ? [] : [{
                type: "binding",
                target,
                binding: bindingId,
                amount,
            }],
        }],
        effects: [],
    };
}

function addEnemyMove(
    fixture: PolicyContext,
    moveId: string,
    targets: TargetCount = 1,
    side: EntitySide = "player",
): void {
    fixture.library.moves[moveId] = {
        id: moveId,
        targetSide: side,
        targets,
        type: "arms",
        bindings: [],
    };
}

function pounceContext(
    actorId: string,
    level: number,
    attackOptions: MoveOptions = { damage: 10, hits: 1, accuracy: 100 },
    sourceAttackable = true,
): PolicyContext {
    const actor = makePublicCharacter(actorId, { buffs: [pounceBuff("pounce-source")] });
    const source = enemy("pounce-source", {
        buffs: [pounceBuff(actorId, level)],
    });
    const other = enemy("other-enemy");
    const moves = [
        ...(sourceAttackable
            ? [move("source-attack", ["pounce-source", "other-enemy"], attackOptions)]
            : []),
        move("throwOff", [], { targets: 0, side: "none" }),
    ];
    return context([actor], [source, other], [action(actorId, moves)]);
}

describe("Smart Matsuko kit knowledge", () => {
    it("prefers an available fairy attack over equivalent ordinary offense", () => {
        const fixture = context(
            [makePublicCharacter("matsuko", { buffs: [{ id: "empowerment" }] })],
            [enemy("target")],
            [action("matsuko", [
                move("punch", ["target"], { damage: 30 }),
                move("fairyWhiteFlame", ["target"], { damage: 30 }),
            ])],
        );

        expect(knowledge(fixture, "punch").raw)
            .toBe(EMPOWERED_OFFENSE_SUBSTITUTION_PENALTY);
        expect(evaluateSmartDecision(fixture).selected.action)
            .toMatchObject({ move: "fairyWhiteFlame" });
    });

    it("does not force empowerment consumption over urgent recovery", () => {
        const matsuko = makePublicCharacter("matsuko", {
            buffs: [{ id: "empowerment" }],
            bindings: [binding("restraint", 80, "overwhelming")],
        });
        const view = action("matsuko", [
            move("punch", ["target"], { damage: 30 }),
            move("fairyPhoenixKick", ["target"], { damage: 30 }),
        ]);
        view.escapes.push({
            available: true,
            target: "matsuko",
            binding: "restraint",
            effects: [{ type: "binding", target: "matsuko", binding: "restraint", amount: -40 }],
        });
        const fixture = context([matsuko], [enemy("target")], [view]);

        expect(evaluateSmartDecision(fixture).selected.action).toMatchObject({ type: "escape" });
    });

    it("reserves Immolation despite enormous healthy-enemy AoE damage", () => {
        const enemies = [1, 2, 3, 4].map((index) => enemy(`target-${index}`));
        const fixture = context(
            [makePublicCharacter("matsuko")],
            enemies,
            [action("matsuko", [
                move("punch", ["target-1"], { damage: 30 }),
                move("immolation", enemies.map(({ id }) => id), {
                    damage: 75,
                    targets: "all",
                }),
            ])],
        );

        expect(knowledge(fixture, "immolation").raw).toBe(IMMOLATION_RESERVE_PENALTY);
        expect(evaluateSmartDecision(fixture).selected.action).toMatchObject({ move: "punch" });
    });

    it("releases the Immolation reserve in a serious binding emergency", () => {
        const fixture = context(
            [makePublicCharacter("matsuko", {
                bindings: [binding("restraint", 80, "overwhelming")],
            })],
            [enemy("target")],
            [action("matsuko", [move("immolation", ["target"], { damage: 75 })])],
        );

        expect(knowledge(fixture, "immolation")).toMatchObject({
            raw: 0,
            rules: [{ id: "matsuko.immolation-release-emergency", adjustment: 0 }],
        });
    });

    it("shows Immolation emergency recovery and Queen transition cost together", () => {
        const bindings = ["head", "arms", "torso", "legs"].map((id) =>
            binding(id, id === "head" ? 75 : 80, id === "head" ? "severe" : "overwhelming")
        );
        const enemies = [
            enemy("queen1", { rank: "boss", maxHp: 750, currHp: 160 }),
            enemy("rainmaker1"),
            enemy("skunk1"),
        ];
        const fixture = context(
            [makePublicCharacter("matsuko", { bindings })],
            enemies,
            [action("matsuko", [move("immolation", enemies.map(({ id }) => id), {
                damage: 20,
                targets: "all",
                effects: bindings.map(({ id }) => ({
                    type: "binding" as const,
                    target: "matsuko",
                    binding: id,
                    amount: -40,
                })),
            })])],
        );

        const decision = evaluateSmartDecision(fixture);
        const immolation = decision.candidates.find((value) =>
            value.action.type === "move" && value.action.move === "immolation"
        );
        expect(immolation?.components.bindingRecovery.raw).toBeGreaterThan(0);
        expect(immolation?.components.kitKnowledge.diagnostics).toMatchObject({
            rules: [expect.objectContaining({
                id: "matsuko.immolation-release-emergency",
            })],
        });
        expect(immolation?.components.tempoKnowledge.diagnostics).toMatchObject({
            rules: expect.arrayContaining([
                expect.objectContaining({ id: "tempo.queen-phase-push" }),
                expect.objectContaining({ id: "tempo.queen-clear-adds" }),
            ]),
        });
    });

    it("releases the Immolation reserve when it finishes every enemy", () => {
        const fixture = context(
            [makePublicCharacter("matsuko")],
            [enemy("one", { currHp: 70 }), enemy("two", { currHp: 75 })],
            [action("matsuko", [move("immolation", ["one", "two"], {
                damage: 75,
                targets: "all",
            })])],
        );

        expect(knowledge(fixture, "immolation")).toMatchObject({
            raw: 0,
            rules: [{ id: "matsuko.immolation-release-finisher", adjustment: 0 }],
        });
    });

    it("gives Obey targeting Ko its explicit bonus", () => {
        const fixture = context(
            [makePublicCharacter("matsuko"), makePublicCharacter("ko", { acted: true })],
            [],
            [action("matsuko", [move("obey", ["ko"], { side: "player" })])],
        );
        expect(knowledge(fixture, "obey", "ko").raw).toBe(OBEY_KO_BONUS);
    });

    it("does not give Obey targeting Hinari the Ko bonus", () => {
        const fixture = context(
            [makePublicCharacter("matsuko"), makePublicCharacter("hinari", { acted: true })],
            [],
            [action("matsuko", [move("obey", ["hinari"], { side: "player" })])],
        );
        expect(knowledge(fixture, "obey", "hinari").raw).toBe(0);
    });

    it("does not invent an Obey fallback when Ko is not a valid target", () => {
        const fixture = context(
            [makePublicCharacter("matsuko"), makePublicCharacter("hinari", { acted: true })],
            [],
            [action("matsuko", [move("obey", ["hinari"], { side: "player" })])],
        );
        expect(knowledge(fixture, "obey").rules).toEqual([]);
    });

    it("gives Stop no utility for a committed miss", () => {
        const target = enemy("target", {
            intentions: [bindingIntention("miss", "matsuko", "arms", undefined, "miss")],
        });
        const fixture = context(
            [makePublicCharacter("matsuko")],
            [target],
            [action("matsuko", [move("stop", ["target"])])],
        );
        expect(knowledge(fixture, "stop")).toMatchObject({
            raw: 0,
            rules: [{ details: { intentions: [{ reason: "committed-miss" }] } }],
        });
    });

    it("values harmful non-boss Stop by prevented recovery debt", () => {
        const fixture = context(
            [makePublicCharacter("matsuko")],
            [enemy("target", {
                intentions: [bindingIntention("bind", "matsuko", "arms", 40)],
            })],
            [action("matsuko", [
                move("punch", ["target"], { damage: 30 }),
                move("stop", ["target"]),
            ])],
        );
        expect(knowledge(fixture, "stop").raw).toBeGreaterThan(0);
        expect(evaluateSmartDecision(fixture).selected.action).toMatchObject({ move: "stop" });
    });

    it("values a larger harmful intention above a smaller one", () => {
        const stopValue = (amount: number) => {
            const fixture = context(
                [makePublicCharacter("matsuko")],
                [enemy("target", {
                    intentions: [bindingIntention("bind", "matsuko", "arms", amount)],
                })],
                [action("matsuko", [move("stop", ["target"])])],
            );
            return knowledge(fixture, "stop").raw;
        };
        expect(stopValue(60)).toBeGreaterThan(stopValue(20));
    });

    it("only proportionally mitigates a boss intention", () => {
        const make = (rank: Enemy["rank"]) => context(
            [makePublicCharacter("matsuko")],
            [enemy("target", {
                rank,
                intentions: [bindingIntention("bind", "matsuko", "arms", 60)],
            })],
            [action("matsuko", [move("stop", ["target"])])],
        );
        const full = knowledge(make("enemy"), "stop").raw;
        const boss = knowledge(make("boss"), "stop");
        expect(boss.raw).toBeCloseTo(full * 0.25);
        expect(boss.rules[0].details).toMatchObject({ reason: "boss-weaken" });
    });

    it("gives Stop no utility without an intention", () => {
        const fixture = context(
            [makePublicCharacter("matsuko")],
            [enemy("target")],
            [action("matsuko", [move("stop", ["target"])])],
        );
        expect(knowledge(fixture, "stop").raw).toBe(0);
    });

    it("reuses existing trap pressure for harmful non-binding intentions", () => {
        const fixture = context(
            [makePublicCharacter("matsuko")],
            [enemy("target", {
                intentions: [{
                    move: "trap",
                    targets: [],
                    effects: [{ type: "trap", trap: "puddle", amount: 20 }],
                }],
            })],
            [action("matsuko", [move("stop", ["target"])])],
        );
        expect(knowledge(fixture, "stop")).toMatchObject({
            raw: 5,
            rules: [{ details: { committedTrapPressure: 5 } }],
        });
    });

    it("strongly values Attack Me when it redirects a deep track to clean Matsuko", () => {
        const attackMe = move("attackMe", ["source"], {
            targets: "all",
            effects: [{
                type: "buff",
                target: "matsuko",
                buff: { id: "defenseBarrier", modifiers: { defense: 3 } },
                operation: "add",
            }],
        });
        const fixture = context(
            [
                makePublicCharacter("matsuko", { bindings: [binding("arms", 0, "none")] }),
                makePublicCharacter("ko", { bindings: [binding("arms", 70, "severe")] }),
            ],
            [enemy("source", {
                intentions: [bindingIntention("bind", "ko", "arms", 20)],
            })],
            [action("matsuko", [
                move("punch", ["source"], { damage: 30 }),
                attackMe,
            ])],
        );
        addEnemyMove(fixture, "bind");
        const result = knowledge(fixture, "attackMe");
        expect(result.raw).toBeGreaterThan(70);
        expect(result.rules[0].details).toMatchObject({
            defenseModifier: 3,
            defenseBenefit: expect.any(Number),
        });
        expect(evaluateSmartDecision(fixture).selected.action).toMatchObject({ move: "attackMe" });
    });

    it("does not value Attack Me when Matsuko is the worse recipient", () => {
        const fixture = attackMeContext(70, 0, "ko", 20);
        expect(knowledge(fixture, "attackMe").raw).toBe(0);
    });

    it("values Attack Me's public Defense even when Matsuko is already targeted", () => {
        const fixture = attackMeContext(0, 70, "matsuko", 20);
        const result = knowledge(fixture, "attackMe");
        expect(result.raw).toBeGreaterThan(0);
        expect(result.rules[0].details).toMatchObject({
            trackTransferGain: 0,
            alreadyTargetedMatsukoDebt: expect.any(Number),
            defenseModifier: 3,
            defenseBenefit: expect.any(Number),
        });
    });

    it("does not value Attack Me for AoE or missed intentions without Matsuko pressure", () => {
        for (const [target, targets, amount, band] of [
            ["ko", "all", 20, "hit"],
            ["ko", 1, undefined, "miss"],
        ] as const) {
            const fixture = attackMeContext(0, 70, target, amount, band);
            addEnemyMove(fixture, "bind", targets);
            expect(knowledge(fixture, "attackMe").raw).toBe(0);
        }
    });

    it("adds useful redirects from multiple eligible enemies", () => {
        const one = attackMeContext(0, 70, "ko", 10);
        const many = attackMeContext(0, 70, "ko", 10, "hit", 2);
        expect(knowledge(many, "attackMe").raw).toBeGreaterThan(
            knowledge(one, "attackMe").raw,
        );
    });
});

function attackMeContext(
    matsukoArms: number,
    koArms: number,
    target: string,
    amount?: number,
    band: "miss" | "hit" = "hit",
    enemyCount = 1,
): PolicyContext {
    const enemies = Array.from({ length: enemyCount }, (_, index) => enemy(`source-${index}`, {
        intentions: [bindingIntention("bind", target, "arms", amount, band)],
    }));
    const attackMe = move("attackMe", enemies.map(({ id }) => id), {
        targets: "all",
        effects: [{
            type: "buff",
            target: "matsuko",
            buff: { id: "defenseBarrier", modifiers: { defense: 3 } },
            operation: "add",
        }],
    });
    const fixture = context(
        [
            makePublicCharacter("matsuko", { bindings: [binding("arms", matsukoArms, "none")] }),
            makePublicCharacter("ko", { bindings: [binding("arms", koArms, "none")] }),
        ],
        enemies,
        [action("matsuko", [attackMe])],
    );
    addEnemyMove(fixture, "bind");
    return fixture;
}

describe("Smart Hinari kit knowledge", () => {
    it("gives Brace no utility without incoming binding", () => {
        const fixture = braceContext([], 0);
        expect(knowledge(fixture, "brace").raw).toBe(0);
    });

    it("values known binding that fits in Subspace", () => {
        const fixture = braceContext([
            enemy("source", { intentions: [bindingIntention("bind", "hinari", "arms", 40)] }),
        ], 0);
        expect(knowledge(fixture, "brace").raw).toBeGreaterThan(0);
    });

    it("strongly values a huge committed binding", () => {
        const source = enemy("source", {
            intentions: [bindingIntention("crit", "hinari", "arms", 96)],
        });
        const fixture = context(
            [makePublicCharacter("hinari", {
                bindings: [binding("arms", 0, "none")],
                data: { subspace: 0, subspaceMax: 100 },
            })],
            [source],
            [action("hinari", [
                move("rockfall", ["source"], { damage: 30 }),
                move("brace", []),
            ])],
        );
        expect(knowledge(fixture, "brace").raw).toBeGreaterThan(250);
        expect(evaluateSmartDecision(fixture).selected.action).toMatchObject({ move: "brace" });
    });

    it("values only the amount that fits in nearly full Subspace", () => {
        const source = enemy("source", {
            intentions: [bindingIntention("bind", "hinari", "arms", 40)],
        });
        const fixture = braceContext([
            source,
        ], 90);
        expect(knowledge(fixture, "brace").rules[0].details).toMatchObject({
            incomingAmount: 40,
            subspaceRoom: 10,
            absorbedAmount: 10,
            overflowAmount: 30,
        });
        expect(knowledge(fixture, "brace").raw).toBeLessThan(
            knowledge(braceContext([source], 0), "brace").raw,
        );
    });

    it("treats only the first incoming application as intercepted", () => {
        const source = enemy("source", {
            intentions: [{
                move: "multi",
                targets: [{
                    target: "hinari",
                    band: "hit",
                    effects: [
                        { type: "binding", target: "hinari", binding: "arms", amount: 5 },
                        { type: "binding", target: "hinari", binding: "legs", amount: 60 },
                    ],
                }],
                effects: [],
            }],
        });
        const fixture = braceContext([source], 0);
        const result = knowledge(fixture, "brace");
        expect(result.rules[0].details).toMatchObject({
            bindingId: "arms",
            incomingAmount: 5,
            absorbedAmount: 5,
        });
        const firstOnly = braceContext([
            enemy("source", {
                intentions: [bindingIntention("first", "hinari", "arms", 5)],
            }),
        ], 0);
        expect(result.raw).toBeCloseTo(knowledge(firstOnly, "brace").raw);
    });

    it("prefers Fairy Rockfall over ordinary Rockfall when choosing offense", () => {
        const fixture = context(
            [makePublicCharacter("hinari", {
                buffs: [{ id: "empowerment" }],
                data: { subspace: 0, subspaceMax: 100 },
            })],
            [enemy("target")],
            [action("hinari", [
                move("rockfall", ["target"], { damage: 10, hits: 4 }),
                move("fairyRockfall", ["target"], { damage: 10, hits: 6 }),
            ])],
        );
        expect(knowledge(fixture, "rockfall").raw)
            .toBe(EMPOWERED_OFFENSE_SUBSTITUTION_PENALTY);
        expect(evaluateSmartDecision(fixture).selected.action)
            .toMatchObject({ move: "fairyRockfall" });
    });

    it("creates no artificial Release urgency at low Subspace", () => {
        const fixture = hinariSubspaceContext(0, 4);
        expect(knowledge(fixture, "release").raw).toBe(0);
    });

    it("increases Release value as Subspace rises and Rockfall loses hits", () => {
        const moderate = hinariSubspaceContext(25, 3);
        const high = hinariSubspaceContext(75, 1);
        expect(knowledge(high, "release").raw).toBeGreaterThan(
            knowledge(moderate, "release").raw,
        );
    });

    it("penalizes high-Subspace Store but lets urgent recovery outweigh it", () => {
        const hinari = makePublicCharacter("hinari", {
            bindings: [binding("restraint", 100, "max")],
            data: { subspace: 75, subspaceMax: 100 },
        });
        const store = move("store", ["hinari"], { side: "player" });
        store.targets[0] = {
            valid: true,
            target: "hinari",
            effects: [{ type: "binding", target: "hinari", binding: "restraint", amount: -100 }],
        };
        const fixture = context(
            [hinari],
            [enemy("target")],
            [action("hinari", [
                move("rockfall", ["target"], { damage: 10, hits: 1 }),
                move("release", ["target"]),
                store,
            ])],
        );
        expect(knowledge(fixture, "store").raw).toBeLessThan(0);
        expect(evaluateSmartDecision(fixture).selected.action).toMatchObject({ move: "store" });
    });

    it("does not remain highly charged while choosing a degraded Rockfall", () => {
        const fixture = hinariSubspaceContext(75, 1);
        expect(evaluateSmartDecision(fixture).selected.action).toMatchObject({ move: "release" });
    });

});

function braceContext(enemies: Enemy[], subspace: number): PolicyContext {
    return context(
        [makePublicCharacter("hinari", {
            bindings: [binding("arms", 0, "none"), binding("legs", 0, "none")],
            data: { subspace, subspaceMax: 100 },
        })],
        enemies,
        [action("hinari", [move("brace", [])])],
    );
}

function hinariSubspaceContext(subspace: number, rockfallHits: number): PolicyContext {
    return context(
        [makePublicCharacter("hinari", { data: { subspace, subspaceMax: 100 } })],
        [enemy("target")],
        [action("hinari", [
            move("rockfall", ["target"], { damage: 10, hits: rockfallHits }),
            move("release", ["target"]),
        ])],
    );
}

describe("Smart Pounce and Throw Off knowledge", () => {
    it("derives Pounce level from the source's public hit modifier divided by two", () => {
        expect(detectPounceRelationships(pounceContext("ko", 3))).toEqual([{
            characterId: "ko",
            enemyId: "pounce-source",
            level: 3,
        }]);
    });

    it("values a damaging attack against the actual Pounce source", () => {
        const fixture = pounceContext("ko", 2);
        expect(knowledge(fixture, "source-attack", "pounce-source").raw).toBeGreaterThan(0);
    });

    it("does not value the same attack against an unrelated enemy", () => {
        const fixture = pounceContext("ko", 2);
        expect(knowledge(fixture, "source-attack", "other-enemy").raw).toBe(0);
    });

    it("values more useful damaging hits over fewer hits", () => {
        const one = pounceContext("ko", 4, { damage: 10, hits: 1, accuracy: 100 });
        const four = pounceContext("ko", 4, { damage: 10, hits: 4, accuracy: 100 });
        expect(knowledge(four, "source-attack").raw)
            .toBeGreaterThan(knowledge(one, "source-attack").raw);
    });

    it("applies the same source-removal rule to Ko, Matsuko, and Hinari", () => {
        for (const actorId of ["ko", "matsuko", "hinari"]) {
            const result = knowledge(pounceContext(actorId, 2), "source-attack");
            expect(result.rules.some(({ id }) => id === "skunk.pounce-source-removal")).toBe(true);
        }
    });

    it("uses public non-miss accuracy for expected successful hits", () => {
        const half = pounceContext("ko", 4, { damage: 10, hits: 2, accuracy: 50 });
        const certain = pounceContext("ko", 4, { damage: 10, hits: 2, accuracy: 100 });
        expect(knowledge(half, "source-attack").raw).toBe(POUNCE_REMOVAL_VALUE);
        expect(knowledge(certain, "source-attack").raw).toBe(2 * POUNCE_REMOVAL_VALUE);
    });

    it("adds a named bonus when expected hits can clear Pounce", () => {
        const fixture = pounceContext("ko", 2, { damage: 10, hits: 2, accuracy: 100 });
        const result = knowledge(fixture, "source-attack");
        expect(result.rules).toContainEqual(expect.objectContaining({
            id: "skunk.pounce-clear",
            adjustment: POUNCE_CLEAR_BONUS,
        }));
    });

    it("strongly discourages low-level Throw Off when a good source attack exists", () => {
        const fixture = pounceContext("ko", 1);
        expect(knowledge(fixture, "throwOff").raw).toBeLessThan(0);
        expect(evaluateSmartDecision(fixture).selected.action)
            .toMatchObject({ move: "source-attack" });
    });

    it("makes Throw Off substantially more acceptable around level three", () => {
        const low = knowledge(pounceContext("ko", 1), "throwOff").raw;
        const high = knowledge(pounceContext("ko", 3), "throwOff").raw;
        expect(high).toBeGreaterThan(low);
        expect(high).toBeGreaterThan(0);
    });

    it("still prefers a strong multi-hit source attack at level four", () => {
        const fixture = pounceContext("ko", 4, { damage: 10, hits: 6, accuracy: 100 });
        expect(evaluateSmartDecision(fixture).selected.action)
            .toMatchObject({ move: "source-attack" });
    });

    it("uses Throw Off as fallback when the source cannot be attacked", () => {
        const fixture = pounceContext("ko", 4, {}, false);
        expect(evaluateSmartDecision(fixture).selected.action)
            .toMatchObject({ move: "throwOff" });
    });
});

describe("Smart knowledge diagnostics and registration", () => {
    it("gives unknown characters and moves zero adjustment", () => {
        const fixture = context(
            [makePublicCharacter("unknown-hero")],
            [enemy("unknown-enemy")],
            [action("unknown-hero", [move("unknown-move", ["unknown-enemy"], { damage: 10 })])],
        );
        expect(knowledge(fixture, "unknown-move")).toEqual({ rules: [], raw: 0 });
    });

    it("emits named rule diagnostics with inspectable adjustments", () => {
        const fixture = context(
            [makePublicCharacter("matsuko", { buffs: [{ id: "empowerment" }] })],
            [enemy("target")],
            [action("matsuko", [
                move("punch", ["target"], { damage: 30 }),
                move("fairyWhiteFlame", ["target"], { damage: 30 }),
            ])],
        );
        expect(knowledge(fixture, "punch").rules).toEqual([{
            id: "matsuko.consume-empowerment",
            adjustment: EMPOWERED_OFFENSE_SUBSTITUTION_PENALTY,
            reason: expect.any(String),
        }]);
    });

    it("produces structured-cloneable diagnostics", () => {
        const fixture = pounceContext("matsuko", 2);
        const result = knowledge(fixture, "source-attack");
        expect(structuredClone(result)).toEqual(result);
    });

    it("is deterministic and consumes no policy RNG", () => {
        const fixture = pounceContext("hinari", 3, { damage: 10, hits: 4, accuracy: 75 });
        const first = evaluateSmartDecision(fixture, [kitKnowledgeScorer]);
        const second = evaluateSmartDecision(fixture, [kitKnowledgeScorer]);
        expect(second).toEqual(first);
    });

    it("registers the unit-weight knowledge scorer exactly once", () => {
        expect(kitKnowledgeScorer.weight).toBe(KIT_KNOWLEDGE_WEIGHT);
        expect(KIT_KNOWLEDGE_WEIGHT).toBe(1);
        expect(smartScorers.filter(({ id }) => id === "kitKnowledge"))
            .toEqual([kitKnowledgeScorer]);
    });
});
