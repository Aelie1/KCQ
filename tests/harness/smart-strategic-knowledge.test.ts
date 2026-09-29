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
    GameState,
    ModifierSet,
    TargetCount,
} from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import {
    assessSmartBoard,
    assessSmartPressure,
    CONTROL_KNOWLEDGE_WEIGHT,
    controlKnowledgeScorer,
    evaluateControlKnowledge,
    evaluateIncomingThreat,
    evaluateReactiveKnowledge,
    evaluateSmartDecision,
    evaluateTempoKnowledge,
    generateSmartCandidates,
    INCOMING_THREAT_WEIGHT,
    kitKnowledgeScorer,
    QUEEN_ADD_CLEAR_PENALTY,
    REACTIVE_KNOWLEDGE_WEIGHT,
    reactiveKnowledgeScorer,
    recoveryDebt,
    smartScorers,
    STARLIGHT_REAPPLICATION_MULTIPLIER,
    TEMPO_KNOWLEDGE_WEIGHT,
    tempoKnowledgeScorer,
} from "../../src/harness/policy/smart";
import { createEmptyContentLibrary } from "../helpers/library";

function binding(id: string, value: number, level: Binding["level"] = "none"): Binding {
    return { id, value, level, data: {}, status: [], tickEffects: [] };
}

function character(id: string, values: Partial<Character> = {}): Character {
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
        ...values,
    };
}

function enemy(id: string, values: Partial<Enemy> = {}): Enemy {
    return {
        id,
        rank: "enemy",
        maxHp: 200,
        currHp: 200,
        currDef: 0,
        intentions: [],
        buffs: [],
        cooldowns: {},
        ...values,
    };
}

interface MoveOptions {
    damage?: number;
    hits?: number;
    targets?: TargetCount;
    targetEffects?: readonly Effect[];
}

function move(
    id: string,
    targetIds: Array<string | null>,
    options: MoveOptions = {},
): ActionInfo {
    const damage = options.damage ?? 0;
    return {
        move: {
            id,
            targetSide: targetIds.length === 0 ? "none" : "enemy",
            targets: options.targets ?? (targetIds.length === 0 ? 0 : 1),
            hits: options.hits ?? 1,
            type: "mouth",
        },
        available: true,
        effects: [],
        targets: targetIds.map((target) => ({
            valid: true,
            target,
            effects: [...(options.targetEffects ?? [])],
            ...(target !== null && damage > 0
                ? { damage: { hit: { chance: 100, min: damage, max: damage } } }
                : {}),
        })),
    };
}

function starlight(
    id: "starlightBindings" | "fairyStarlightBindings",
    enemyIds: string[],
    modifiers: ModifierSet = { hit: -2, defense: -2 },
): ActionInfo {
    const info = move(id, enemyIds, { targets: id === "fairyStarlightBindings" ? "all" : 1 });
    info.targets = info.targets.map((preview) => preview.valid && preview.target !== null
        ? {
            ...preview,
            effects: [{
                type: "buff",
                target: preview.target,
                buff: id,
                operation: "add",
                effects: modifiers,
            }],
        }
        : preview);
    return info;
}

function release(enemyIds: string[], modifiers: ModifierSet): ActionInfo {
    const info = move("release", enemyIds);
    info.targets = info.targets.map((preview) => preview.valid && preview.target !== null
        ? {
            ...preview,
            effects: [{
                type: "buff",
                target: preview.target,
                buff: "currentReleaseDebuff",
                operation: "add",
                effects: modifiers,
            }],
        }
        : preview);
    return info;
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

function context(
    characters: Character[],
    enemies: Enemy[],
    actions: ActionView[],
): PolicyContext {
    const state: GameState = {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        characters,
        enemies,
        traps: [],
        encounter: null,
    };
    const library = createEmptyContentLibrary();
    addMoveReferences(library, actions);
    return {
        state,
        actions,
        thresholds: {
            thresholds: { easy: 20, medium: 40, hard: 60, extreme: 70, impossible: 80 },
            max: 100,
        },
        library,
        random: {
            next: () => { throw new Error("strategic knowledge must not use policy RNG"); },
            integer: () => { throw new Error("strategic knowledge must not use policy RNG"); },
        },
    };
}

function addMoveReferences(library: ContentLibrary, actions: ActionView[]): void {
    for (const view of actions) {
        for (const info of view.moves) {
            library.moves[info.move.id] = { ...info.move, bindings: [] };
        }
    }
}

function candidate(fixture: PolicyContext, moveId: string, targetId?: string) {
    const selected = generateSmartCandidates(fixture).find((value) =>
        value.action.type === "move"
        && value.action.move === moveId
        && (targetId === undefined || value.action.targets.includes(targetId))
    );
    if (selected === undefined) throw new Error(`Missing candidate ${moveId}`);
    return selected;
}

function tempo(fixture: PolicyContext, moveId: string, targetId?: string) {
    const board = assessSmartBoard(fixture);
    return evaluateTempoKnowledge(fixture, board, candidate(fixture, moveId, targetId));
}

function control(fixture: PolicyContext, moveId: string, targetId?: string) {
    return evaluateControlKnowledge(
        fixture,
        assessSmartBoard(fixture),
        candidate(fixture, moveId, targetId),
    );
}

function reactive(fixture: PolicyContext, moveId: string) {
    return evaluateReactiveKnowledge(fixture, candidate(fixture, moveId));
}

function bindingIntention(enemyMove: string, target: string, effects: Effect[]): Enemy["intentions"][number] {
    return {
        move: enemyMove,
        targets: [{ target, band: "hit", effects }],
        effects: [],
    };
}

function dangerousEnemy(id: string, target = "ko", amount = 60): Enemy {
    return enemy(id, {
        intentions: [bindingIntention(`${id}-move`, target, [{
            type: "binding",
            target,
            binding: "restraint",
            amount,
        }])],
    });
}

function highPartyBindings(): Binding[] {
    return [
        binding("arms", 60, "hard"),
        binding("legs", 60, "hard"),
        binding("torso", 60, "hard"),
    ];
}

describe("Smart tempo and pressure knowledge", () => {
    it("raises current party pressure with nonlinear recovery debt", () => {
        const low = context([character("ko")], [], [action("ko", [])]);
        const high = context(
            [character("ko", { bindings: highPartyBindings() })],
            [],
            [action("ko", [])],
        );
        expect(assessSmartPressure(high, assessSmartBoard(high)).currentPartyPressure)
            .toBeGreaterThan(assessSmartPressure(low, assessSmartBoard(low)).currentPartyPressure);
    });

    it("raises enemy pressure for additional enemies and committed threats", () => {
        const quiet = context([character("ko")], [enemy("one")], [action("ko", [])]);
        const dangerous = context(
            [character("ko")],
            [enemy("one"), dangerousEnemy("two"), dangerousEnemy("three")],
            [action("ko", [])],
        );
        expect(assessSmartPressure(dangerous, assessSmartBoard(dangerous)).enemyPressure)
            .toBeGreaterThan(assessSmartPressure(quiet, assessSmartBoard(quiet)).enemyPressure);
    });

    it("rates Queen alone below Queen plus a dangerous wave", () => {
        const queen = enemy("queen1", { rank: "boss", maxHp: 750, currHp: 750 });
        const alone = context([character("ko")], [queen], [action("ko", [])]);
        const wave = context(
            [character("ko")],
            [queen, dangerousEnemy("skunk1"), dangerousEnemy("skunkette1")],
            [action("ko", [])],
        );
        expect(assessSmartPressure(wave, assessSmartBoard(wave)).enemyPressure)
            .toBeGreaterThan(assessSmartPressure(alone, assessSmartBoard(alone)).enemyPressure);
    });

    it("adds breathing-room value to meaningful recovery on a quiet board", () => {
        const ko = character("ko", { bindings: highPartyBindings() });
        const view = action("ko", [move("advance", ["queen1"], { damage: 10 })]);
        view.escapes.push({
            available: true,
            target: "ko",
            binding: "arms",
            effects: [{ type: "binding", target: "ko", binding: "arms", amount: -30 }],
        });
        const fixture = context(
            [ko],
            [enemy("queen1", { rank: "boss", maxHp: 750, currHp: 700 })],
            [view],
        );
        const escapeCandidate = generateSmartCandidates(fixture).find(
            (value) => value.action.type === "escape",
        );
        if (escapeCandidate === undefined) throw new Error("Missing escape");
        expect(evaluateTempoKnowledge(fixture, assessSmartBoard(fixture), escapeCandidate).raw)
            .toBeGreaterThan(0);
        expect(evaluateSmartDecision(fixture).selected.action).toMatchObject({ type: "escape" });
    });

    it("increases value for expected removal of high enemy pressure", () => {
        const low = context(
            [character("ko")],
            [enemy("target", { currHp: 30 })],
            [action("ko", [move("finish", ["target"], { damage: 30 })])],
        );
        const high = context(
            [character("ko")],
            [dangerousEnemy("target", "ko", 80), ...[1, 2, 3].map((n) => dangerousEnemy(`add-${n}`))],
            [action("ko", [move("finish", ["target"], { damage: 200 })])],
        );
        expect(tempo(high, "finish").raw).toBeGreaterThan(tempo(low, "finish").raw);
    });

    it("reserves arbitrary nonlethal Queen damage while adds remain", () => {
        const fixture = context(
            [character("ko")],
            [
                enemy("queen1", { rank: "boss", maxHp: 750, currHp: 650 }),
                ...[1, 2, 3, 4].map((n) => dangerousEnemy(`add-${n}`)),
            ],
            [action("ko", [move("queen-chip", ["queen1"], { damage: 10 })])],
        );
        expect(tempo(fixture, "queen-chip").raw).toBe(-QUEEN_ADD_CLEAR_PENALTY);
    });

    it("allows normal offense when both party and enemy pressure are low", () => {
        const fixture = context(
            [character("ko")],
            [enemy("queen1", { rank: "boss", maxHp: 750, currHp: 700 })],
            [action("ko", [move("advance", ["queen1"], { damage: 30 })])],
        );
        expect(tempo(fixture, "advance").raw).toBe(0);
        expect(evaluateSmartDecision(fixture).selected.action).toMatchObject({ move: "advance" });
    });

    it("strongly penalizes a Queen threshold crossing under high party pressure", () => {
        const fixture = queenThresholdContext(highPartyBindings(), []);
        expect(tempo(fixture, "phase-push").rules)
            .toContainEqual(expect.objectContaining({ id: "tempo.queen-phase-push" }));
        expect(tempo(fixture, "phase-push").raw).toBeLessThan(-100);
    });

    it("strongly penalizes a Queen threshold crossing under high enemy pressure", () => {
        const fixture = queenThresholdContext(
            [],
            [1, 2, 3, 4].map((n) => dangerousEnemy(`add-${n}`)),
        );
        expect(tempo(fixture, "phase-push").raw).toBeLessThan(-100);
    });

    it("does not penalize a Queen threshold crossing on a stable quiet board", () => {
        const fixture = queenThresholdContext([], []);
        expect(tempo(fixture, "phase-push").rules).not.toContainEqual(
            expect.objectContaining({ id: "tempo.queen-phase-push" }),
        );
    });

    it("does not block expected-lethal Queen damage with phase logic", () => {
        const fixture = context(
            [character("ko", { bindings: highPartyBindings() })],
            [enemy("queen1", { rank: "boss", maxHp: 750, currHp: 50 })],
            [action("ko", [move("queen-kill", ["queen1"], { damage: 50 })])],
        );
        expect(tempo(fixture, "queen-kill").rules).not.toContainEqual(
            expect.objectContaining({ id: "tempo.queen-phase-push" }),
        );
    });

    it("does not penalize Queen damage that crosses no threshold", () => {
        const fixture = context(
            [character("ko", { bindings: highPartyBindings() })],
            [enemy("queen1", { rank: "boss", maxHp: 750, currHp: 650 })],
            [action("ko", [move("queen-chip", ["queen1"], { damage: 20 })])],
        );
        expect(tempo(fixture, "queen-chip").rules).not.toContainEqual(
            expect.objectContaining({ id: "tempo.queen-phase-push" }),
        );
    });

    it("strongly reserves Queen damage while adds and an unreached threshold remain", () => {
        const fixture = context(
            [character("ko")],
            [
                enemy("queen1", { rank: "boss", maxHp: 750, currHp: 194 }),
                enemy("skunk1"),
                enemy("fairy1"),
                enemy("rainmaker1"),
            ],
            [action("ko", [
                move("queen-chip", ["queen1"], { damage: 40 }),
                move("add-chip", ["skunk1"], { damage: 40 }),
            ])],
        );

        const result = tempo(fixture, "queen-chip");
        expect(result.rules).toContainEqual(expect.objectContaining({
            id: "tempo.queen-clear-adds",
            adjustment: -QUEEN_ADD_CLEAR_PENALTY,
            details: {
                queenId: "queen1",
                queenHp: 194,
                queenMaxHp: 750,
                livingAddCount: 3,
                pendingPhaseIntentions: [],
                crossedReinforcementThresholds: [],
                remainingReinforcementThresholds: [150],
                expectedLethalBypassed: false,
                adjustment: -QUEEN_ADD_CLEAR_PENALTY,
            },
        }));
        expect(result.rules).not.toContainEqual(
            expect.objectContaining({ id: "tempo.queen-phase-push" }),
        );
        expect(tempo(fixture, "add-chip").rules).not.toContainEqual(
            expect.objectContaining({ id: "tempo.queen-clear-adds" }),
        );
    });

    it("does not apply the add-clear reserve when the Queen is alone", () => {
        const fixture = context(
            [character("ko")],
            [enemy("queen1", { rank: "boss", maxHp: 750, currHp: 194 })],
            [action("ko", [move("queen-chip", ["queen1"], { damage: 40 })])],
        );
        expect(tempo(fixture, "queen-chip").rules).not.toContainEqual(
            expect.objectContaining({ id: "tempo.queen-clear-adds" }),
        );
    });

    it("removes the add-clear reserve after the final reinforcement threshold", () => {
        const fixture = context(
            [character("ko")],
            [
                enemy("queen1", { rank: "boss", maxHp: 750, currHp: 145 }),
                enemy("skunk1"),
            ],
            [action("ko", [move("queen-chip", ["queen1"], { damage: 40 })])],
        );
        expect(tempo(fixture, "queen-chip").rules).not.toContainEqual(
            expect.objectContaining({ id: "tempo.queen-clear-adds" }),
        );
    });

    it("lets expected lethal Queen damage bypass the add-clear reserve", () => {
        const fixture = context(
            [character("ko")],
            [
                enemy("queen1", { rank: "boss", maxHp: 750, currHp: 194 }),
                enemy("skunk1"),
            ],
            [action("ko", [move("queen-kill", ["queen1"], { damage: 194 })])],
        );
        expect(tempo(fixture, "queen-kill").rules).toContainEqual(expect.objectContaining({
            id: "tempo.queen-clear-adds",
            adjustment: 0,
            details: expect.objectContaining({ expectedLethalBypassed: true }),
        }));
    });

    for (const pendingMove of ["callReinforcements", "latexRainmaker"]) {
        it(`treats pending ${pendingMove} as unresolved phase pressure before the spawn exists`, () => {
            const fixture = context(
                [character("ko")],
                [enemy("queen1", {
                    rank: "boss",
                    maxHp: 750,
                    currHp: 610,
                    intentions: [{ move: pendingMove, targets: [], effects: [] }],
                })],
                [action("ko", [
                    move("multi-phase-push", ["queen1"], {
                        damage: 10,
                        hits: 2,
                        targets: "all",
                    }),
                    move("steady-alternative", []),
                ])],
            );

            const result = tempo(fixture, "multi-phase-push");
            expect(result.rules).toContainEqual(expect.objectContaining({
                id: "tempo.queen-phase-push",
                details: expect.objectContaining({
                    pendingPhaseIntentions: [pendingMove],
                    readinessRisk: 1,
                }),
            }));
            expect(result.rules).toContainEqual(expect.objectContaining({
                id: "tempo.queen-clear-adds",
                adjustment: -QUEEN_ADD_CLEAR_PENALTY,
                details: expect.objectContaining({
                    livingAddCount: 0,
                    pendingPhaseIntentions: [pendingMove],
                    crossedReinforcementThresholds: [600],
                }),
            }));
            expect(evaluateSmartDecision(fixture).selected.action)
                .toMatchObject({ move: "steady-alternative" });
        });
    }

    it("does not reserve Queen chip that crosses no new threshold solely for a pending phase", () => {
        const fixture = context(
            [character("ko")],
            [enemy("queen1", {
                rank: "boss",
                maxHp: 750,
                currHp: 650,
                intentions: [{ move: "callReinforcements", targets: [], effects: [] }],
            })],
            [action("ko", [move("queen-chip", ["queen1"], { damage: 20 })])],
        );
        expect(tempo(fixture, "queen-chip").rules).not.toContainEqual(
            expect.objectContaining({ id: "tempo.queen-clear-adds" }),
        );
        expect(tempo(fixture, "queen-chip").rules).not.toContainEqual(
            expect.objectContaining({ id: "tempo.queen-phase-push" }),
        );
    });
    it("treats multiple Queen thresholds crossed by one action as unresolved phase pressure", () => {
        const fixture = context(
            [character("matsuko")],
            [enemy("queen1", {
                rank: "boss",
                maxHp: 750,
                currHp: 310,
            })],
            [action("matsuko", [
                move("big-hit", ["queen1"], { damage: 80 }),
                move("wait", []),
            ])],
        );

        const result = tempo(fixture, "big-hit");

        expect(result.rules).toContainEqual(expect.objectContaining({
            id: "tempo.queen-clear-adds",
            adjustment: -QUEEN_ADD_CLEAR_PENALTY,
            details: expect.objectContaining({
                pendingPhaseIntentions: [],
                crossedReinforcementThresholds: [300, 250],
            }),
        }));
    });
    it("uses first-source reflected damage for pending Queen phase preservation", () => {
        const fixture = context(
            [character("ko")],
            [enemy("queen1", {
                rank: "boss",
                maxHp: 750,
                currHp: 610,
                intentions: [
                    { move: "callReinforcements", targets: [], effects: [] },
                    bindingIntention("queen-bind", "ko", [{
                        type: "binding",
                        target: "ko",
                        binding: "restraint",
                        amount: 20,
                    }]),
                ],
            })],
            [action("ko", [move("reflect", [])])],
        );
        expect(tempo(fixture, "reflect").rules).toContainEqual(expect.objectContaining({
            id: "tempo.queen-clear-adds",
            adjustment: -QUEEN_ADD_CLEAR_PENALTY,
        }));
    });
});

function queenThresholdContext(bindings: Binding[], adds: Enemy[]): PolicyContext {
    return context(
        [character("ko", { bindings })],
        [enemy("queen1", { rank: "boss", maxHp: 750, currHp: 610 }), ...adds],
        [action("ko", [move("phase-push", ["queen1"], { damage: 20 })])],
    );
}

describe("Smart Starlight control knowledge", () => {
    it("values Starlight against a meaningful enemy", () => {
        const fixture = starlightContext([dangerousEnemy("target")]);
        expect(control(fixture, "starlightBindings").raw).toBeGreaterThan(0);
    });

    it("increases Starlight value with target pressure", () => {
        const quiet = starlightContext([enemy("target")]);
        const dangerous = starlightContext([dangerousEnemy("target")]);
        expect(control(dangerous, "starlightBindings").raw)
            .toBeGreaterThan(control(quiet, "starlightBindings").raw);
    });

    it("derives defensive control value from the previewed hit reduction", () => {
        const fixture = starlightContext([dangerousEnemy("target")], { hit: -2 });
        const result = control(fixture, "starlightBindings");
        expect(result.targets[0].hitReductionValue).toBeGreaterThan(0);
        expect(result.targets[0].defenseReductionValue).toBe(0);
    });

    it("derives future offense value from the previewed defense reduction", () => {
        const fixture = starlightContext([enemy("target")], { defense: -2 });
        const result = control(fixture, "starlightBindings");
        expect(result.targets[0].defenseReductionValue).toBeGreaterThan(0);
        expect(result.targets[0].hitReductionValue).toBe(0);
    });

    it("makes Fairy Starlight substantially more valuable across several enemies", () => {
        const one = fairyStarlightContext([dangerousEnemy("one")]);
        const many = fairyStarlightContext(
            [1, 2, 3, 4].map((n) => dangerousEnemy(`enemy-${n}`)),
        );
        expect(control(many, "fairyStarlightBindings").raw)
            .toBeGreaterThan(control(one, "fairyStarlightBindings").raw * 3);
    });

    it("does not give Fairy Starlight an enormous board bonus for one trivial target", () => {
        const fixture = fairyStarlightContext([enemy("target")]);
        expect(control(fixture, "fairyStarlightBindings").raw).toBeLessThan(30);
    });

    it("discounts reapplication while equivalent Starlight control remains useful", () => {
        const active: Buff = {
            id: "starlightBindings",
            duration: 2,
            modifiers: { hit: -2, defense: -2 },
        };
        const fresh = starlightContext([dangerousEnemy("target")]);
        const covered = starlightContext([dangerousEnemy("target", "ko", 60)]);
        covered.state.enemies[0].buffs = [active];
        const freshValue = control(fresh, "starlightBindings").raw;
        expect(control(covered, "starlightBindings").raw)
            .toBeCloseTo(freshValue * STARLIGHT_REAPPLICATION_MULTIPLIER);
    });

    it("can beat ordinary damage under high enemy pressure", () => {
        const target = dangerousEnemy("target", "ko", 80);
        const fixture = context(
            [character("ko")],
            [target],
            [action("ko", [
                move("telekinesis", ["target"], { damage: 30 }),
                starlight("starlightBindings", ["target"]),
            ])],
        );
        expect(evaluateSmartDecision(fixture).selected.action)
            .toMatchObject({ move: "starlightBindings" });
    });

    it("does not force Starlight over immediate offense on a trivial board", () => {
        const fixture = context(
            [character("ko")],
            [enemy("target")],
            [action("ko", [
                move("telekinesis", ["target"], { damage: 30 }),
                starlight("starlightBindings", ["target"]),
            ])],
        );
        expect(evaluateSmartDecision(fixture).selected.action)
            .toMatchObject({ move: "telekinesis" });
    });
});

describe("Smart Release target control knowledge", () => {
    it("ranks a high-pressure Release target above a low-pressure target", () => {
        const low = enemy("low");
        const high = dangerousEnemy("high", "hinari", 70);
        const fixture = releaseContext([low, high]);
        expect(control(fixture, "release", "high").raw)
            .toBeGreaterThan(control(fixture, "release", "low").raw);
    });

    it("does not let stable target order choose the Release winner", () => {
        for (const enemies of [
            [enemy("low"), dangerousEnemy("high", "hinari", 70)],
            [dangerousEnemy("high", "hinari", 70), enemy("low")],
        ]) {
            expect(evaluateSmartDecision(releaseContext(enemies)).selected.action)
                .toMatchObject({ move: "release", targets: ["high"] });
        }
    });

    it("reads Release modifiers from the current public preview", () => {
        const weak = releaseContext([dangerousEnemy("target", "hinari", 40)], { hit: -1 });
        const strong = releaseContext([dangerousEnemy("target", "hinari", 40)], { hit: -3 });
        const weakResult = control(weak, "release", "target");
        const strongResult = control(strong, "release", "target");
        expect(strongResult.raw).toBeCloseTo(weakResult.raw * 3);
        expect(strongResult.targets[0]).toMatchObject({
            hitModifier: -3,
            defenseModifier: 0,
            durationSource: "public-preview-fallback",
        });
    });
});

function releaseContext(
    enemies: Enemy[],
    modifiers: ModifierSet = { hit: -2, defense: -2 },
): PolicyContext {
    return context(
        [character("hinari", { data: { subspace: 75, subspaceMax: 100 } })],
        enemies,
        [action("hinari", [release(enemies.map(({ id }) => id), modifiers)])],
    );
}

function starlightContext(enemies: Enemy[], modifiers?: ModifierSet): PolicyContext {
    return context(
        [character("ko")],
        enemies,
        [action("ko", [starlight("starlightBindings", [enemies[0].id], modifiers)])],
    );
}

function fairyStarlightContext(enemies: Enemy[]): PolicyContext {
    return context(
        [character("ko", { buffs: [{ id: "empowerment" }] })],
        enemies,
        [action("ko", [starlight("fairyStarlightBindings", enemies.map(({ id }) => id))])],
    );
}

describe("Smart Reflect reactive knowledge", () => {
    it("gives Reflect no special value without a committed binding attack on Ko", () => {
        const fixture = reflectContext([], 0);
        expect(reactive(fixture, "reflect").raw).toBe(0);
    });

    it("values Reflect against a meaningful committed binding attack on Ko", () => {
        const fixture = reflectContext([dangerousEnemy("source", "ko", 40)], 0);
        expect(reactive(fixture, "reflect").raw).toBeGreaterThan(0);
    });

    it("gives Fairy Reflect greater prevention value than regular Reflect", () => {
        const fixture = reflectContext([dangerousEnemy("source", "ko", 40)], 0);
        expect(reactive(fixture, "fairyReflect").preventedRecoveryDebt)
            .toBeGreaterThan(reactive(fixture, "reflect").preventedRecoveryDebt);
    });

    it("calculates prevention with recovery-debt differences", () => {
        const fixture = reflectContext([dangerousEnemy("source", "ko", 20)], 0);
        const result = reactive(fixture, "reflect");
        const expected = recoveryDebt(20, fixture.thresholds)
            - recoveryDebt(10, fixture.thresholds);
        expect(result.preventedRecoveryDebt).toBeCloseTo(expected);
    });

    it("values the same prevented amount more on an already severe track", () => {
        const empty = reflectContext([dangerousEnemy("source", "ko", 20)], 0);
        const severe = reflectContext([dangerousEnemy("source", "ko", 20)], 65);
        expect(reactive(severe, "reflect").preventedRecoveryDebt)
            .toBeGreaterThan(reactive(empty, "reflect").preventedRecoveryDebt);
    });

    it("credits reflected damage to the committed effect's enemy source", () => {
        const fixture = reflectContext([
            enemy("unrelated"),
            dangerousEnemy("actual-source", "ko", 40),
        ], 0);
        expect(reactive(fixture, "reflect")).toMatchObject({
            application: { enemyId: "actual-source", amount: 40 },
            reflectedDamage: 40,
        });
    });

    it("does not credit binding pressure aimed at another character", () => {
        const fixture = context(
            [character("ko"), character("matsuko")],
            [dangerousEnemy("source", "matsuko", 60)],
            [action("ko", [move("reflect", [])])],
        );
        expect(reactive(fixture, "reflect").raw).toBe(0);
    });

    it("ignores traps and unknown binding amounts that Reflect cannot quantify", () => {
        const source = enemy("source", {
            intentions: [bindingIntention("mixed", "ko", [
                { type: "trap", trap: "puddle", amount: 50 },
                { type: "binding", target: "ko", binding: "restraint" },
            ])],
        });
        const fixture = reflectContext([source], 0);
        expect(reactive(fixture, "reflect").raw).toBe(0);
    });

    it("values only the first application because Reflect is single-use", () => {
        const source = enemy("source", {
            intentions: [bindingIntention("multi-bind", "ko", [
                { type: "binding", target: "ko", binding: "arms", amount: 5 },
                { type: "binding", target: "ko", binding: "legs", amount: 60 },
            ])],
        });
        const fixture = reflectContext([source], 0);
        expect(reactive(fixture, "fairyReflect")).toMatchObject({
            application: { bindingId: "arms", amount: 5 },
            reflectedDamage: 5,
        });
    });

    it("lets a large Fairy Reflect opportunity beat immediate offense", () => {
        const fixture = reflectContext([dangerousEnemy("source", "ko", 60)], 60, true);
        expect(evaluateSmartDecision(fixture).selected.action)
            .toMatchObject({ move: "fairyReflect" });
    });

    it("does not force Reflect for a tiny incoming binding", () => {
        const fixture = reflectContext([dangerousEnemy("source", "ko", 1)], 0, true);
        expect(evaluateSmartDecision(fixture).selected.action)
            .toMatchObject({ move: "telekinesis" });
    });
});

function reflectContext(enemies: Enemy[], currentBinding: number, includeAttack = false): PolicyContext {
    const bindings = currentBinding > 0
        ? [binding("restraint", currentBinding, currentBinding >= 60 ? "hard" : "none")]
        : [];
    const moves = [
        ...(includeAttack ? [move("telekinesis", [enemies[0]?.id ?? "source"], { damage: 30 })] : []),
        move("reflect", []),
        move("fairyReflect", []),
    ];
    return context(
        [character("ko", { bindings, buffs: [{ id: "empowerment" }] })],
        enemies,
        [action("ko", moves)],
    );
}

describe("Smart strategic knowledge integration", () => {
    it("keeps tempo, control, and reactive diagnostics distinct", () => {
        const fixture = context(
            [character("ko", { bindings: highPartyBindings() })],
            [dangerousEnemy("target", "ko", 40)],
            [action("ko", [
                starlight("starlightBindings", ["target"]),
                move("reflect", []),
            ])],
        );
        const decision = evaluateSmartDecision(fixture);
        const starlightCandidate = decision.candidates.find(
            (value) => value.action.type === "move" && value.action.move === "starlightBindings",
        );
        const reflectCandidate = decision.candidates.find(
            (value) => value.action.type === "move" && value.action.move === "reflect",
        );
        expect(starlightCandidate?.components.controlKnowledge.diagnostics).toMatchObject({
            rules: [{ id: "control.starlight" }],
        });
        expect(reflectCandidate?.components.reactiveKnowledge.diagnostics).toMatchObject({
            rules: [{ id: "reactive.reflect-binding" }],
        });
        expect(starlightCandidate?.components.tempoKnowledge.diagnostics).toHaveProperty("pressure");
    });

    it("emits structured-cloneable diagnostics", () => {
        const fixture = queenThresholdContext(highPartyBindings(), [dangerousEnemy("add")]);
        const diagnostics = evaluateSmartDecision(fixture).candidates[0].components;
        expect(structuredClone(diagnostics)).toEqual(diagnostics);
    });

    it("is deterministic", () => {
        const fixture = starlightContext([dangerousEnemy("target")]);
        expect(evaluateSmartDecision(fixture)).toEqual(evaluateSmartDecision(fixture));
    });

    it("consumes no policy RNG", () => {
        const fixture = reflectContext([dangerousEnemy("source", "ko", 40)], 50);
        expect(() => evaluateSmartDecision(fixture)).not.toThrow();
    });

    it("registers each unit-weight strategic scorer exactly once", () => {
        expect(TEMPO_KNOWLEDGE_WEIGHT).toBe(1);
        expect(CONTROL_KNOWLEDGE_WEIGHT).toBe(1);
        expect(REACTIVE_KNOWLEDGE_WEIGHT).toBe(1);
        for (const scorer of [
            tempoKnowledgeScorer,
            controlKnowledgeScorer,
            reactiveKnowledgeScorer,
        ]) {
            expect(smartScorers.filter(({ id }) => id === scorer.id)).toEqual([scorer]);
        }
    });

    it("preserves the existing kitKnowledge scorer", () => {
        expect(smartScorers.filter(({ id }) => id === "kitKnowledge"))
            .toEqual([kitKnowledgeScorer]);
    });

    it("preserves expected-lethal-only incomingThreat semantics", () => {
        const source = dangerousEnemy("source", "ko", 40);
        source.currHp = 100;
        const fixture = context(
            [character("ko")],
            [source],
            [action("ko", [
                move("nonlethal", ["source"], { damage: 99 }),
                move("lethal", ["source"], { damage: 100 }),
            ])],
        );
        const board = assessSmartBoard(fixture);
        expect(evaluateIncomingThreat(fixture, board, candidate(fixture, "nonlethal")).raw)
            .toBe(0);
        expect(evaluateIncomingThreat(fixture, board, candidate(fixture, "lethal")).raw)
            .toBeGreaterThan(0);
        expect(INCOMING_THREAT_WEIGHT).toBe(1);
    });
});
