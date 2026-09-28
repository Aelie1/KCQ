import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
    return fs.readFileSync(path.join(root, rel), "utf8");
}

function write(rel, text) {
    fs.writeFileSync(path.join(root, rel), text, "utf8");
}
function replaceOnce(text, before, after, label) {
    // Match the file's existing newline style.
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    before = before.replace(/\n/g, eol);
    after = after.replace(/\n/g, eol);

    const first = text.indexOf(before);

    if (first < 0) {
        // Makes the patcher safe to rerun after partially succeeding.
        if (text.includes(after)) {
            console.log(`already applied: ${label}`);
            return text;
        }

        throw new Error(`Could not find anchor: ${label}`);
    }

    if (text.indexOf(before, first + before.length) >= 0) {
        throw new Error(`Anchor is not unique: ${label}`);
    }

    return text.slice(0, first)
        + after
        + text.slice(first + before.length);
}

function patch(rel, transform) {
    const before = read(rel);
    const after = transform(before);

    if (before === after) {
        console.log(`already patched ${rel}`);
        return;
    }

    write(rel, after);
    console.log(`patched ${rel}`);
}

/* =========================================================
 * collector.ts
 * Give metrics access to the pre-action public ActionView.
 * ========================================================= */

patch("src/harness/metrics/collector.ts", (source) => {
    source = replaceOnce(
        source,
`import type {
    ActionResult,
    GameState,
    PlayerAction,
} from "../../engine/public/types";`,
`import type {
    ActionResult,
    ActionView,
    GameState,
    PlayerAction,
} from "../../engine/public/types";`,
        "collector ActionView import",
    );

    source = replaceOnce(
        source,
`    readonly before: GameState;
    readonly result: ActionResult;`,
`    readonly before: GameState;
    /** Public action availability immediately before the submitted action. */
    readonly actions?: readonly ActionView[];
    readonly result: ActionResult;`,
        "collector pre-action ActionView field",
    );

    return source;
});

/* =========================================================
 * harness.ts
 * Pass the ActionView that the policy actually saw.
 * ========================================================= */

patch("src/harness/harness.ts", (source) => replaceOnce(
    source,
`        collectors.onAction({
            actionIndex: trace.length,
            action,
            before,
            result,
        });`,
`        collectors.onAction({
            actionIndex: trace.length,
            action,
            before,
            actions,
            result,
        });`,
    "harness collector observation",
));

/* =========================================================
 * detailed-combat.ts
 * Explosion response decision metrics.
 * ========================================================= */

patch("src/harness/metrics/detailed-combat.ts", (source) => {
    source = replaceOnce(
        source,
`import type {
    BondageEvent,
    Buff,
    Character,
    Effect,
    Enemy,
    GameEvent,
    GameState,
    HitBand,
    LeafEvent,
    ModifierId,
} from "../../engine/public/types";`,
`import type {
    ActionInfo,
    ActionView,
    BondageEvent,
    Buff,
    Character,
    Effect,
    Enemy,
    GameEvent,
    GameState,
    HitBand,
    LeafEvent,
    ModifierId,
    PlayerAction,
    ValidTarget,
} from "../../engine/public/types";`,
        "detailed combat public type imports",
    );

    source = replaceOnce(
        source,
`export interface SkunkExplosionMetrics {
    intentionsQueued: number;
    killedBeforeUse: number;
    uses: number;
    cancelledBeforeUse: number;
}

/** Compact per-fight counters; derived averages are added only in BatchSummary. */`,
`export interface SkunkExplosionMetrics {
    intentionsQueued: number;
    killedBeforeUse: number;
    uses: number;
    cancelledBeforeUse: number;
}

export interface SkunkExplosionResponseActionCounts {
    damageExplodingSkunk: number;
    damageOtherEnemy: number;
    stopExplodingSkunk: number;
    supportExplodingSkunk: number;
    escape: number;
    stance: number;
    supportMove: number;
    endTurn: number;
}

export interface SkunkExplosionResponseMetrics {
    /** Successful player decisions submitted while at least one Explosion intention is visible. */
    decisionsObserved: number;

    /** Decisions where some currently-actionable character could damage an exploding Skunk. */
    withDamageOption: number;

    actions: SkunkExplosionResponseActionCounts;
    whileDamageOptionAvailable: SkunkExplosionResponseActionCounts;

    /** Selected player moves while Explosion is on the board. */
    movesByMove: Record<string, number>;
    whileDamageOptionAvailableByMove: Record<string, number>;

    /** Actual selected move targets. AoE all-target moves contribute every valid public target. */
    targetsById: Record<string, number>;
    whileDamageOptionAvailableTargetsById: Record<string, number>;

    damageExplodingSkunkByMove: Record<string, number>;
    damageOtherEnemyByMove: Record<string, number>;
}

/** Compact per-fight counters; derived averages are added only in BatchSummary. */`,
        "Explosion response interfaces",
    );

    source = replaceOnce(
        source,
`    bondageReceived: BondageReceivedMetrics;
    skunkExplosion: SkunkExplosionMetrics;
}`,
`    bondageReceived: BondageReceivedMetrics;
    skunkExplosion: SkunkExplosionMetrics;

    /** Optional so older/synthetic DetailedCombatMetrics fixtures remain valid. */
    skunkExplosionResponse?: SkunkExplosionResponseMetrics;
}`,
        "DetailedCombatMetrics Explosion response field",
    );

    source = replaceOnce(
        source,
`        bondageReceived: { moves: {}, ticks: {}, traps: {}, unattributed: 0 },
        skunkExplosion: emptySkunkExplosionMetrics(),
    };`,
`        bondageReceived: { moves: {}, ticks: {}, traps: {}, unattributed: 0 },
        skunkExplosion: emptySkunkExplosionMetrics(),
        skunkExplosionResponse: emptySkunkExplosionResponseMetrics(),
    };`,
        "collector Explosion response initialization",
    );

    source = replaceOnce(
        source,
`            if (!context.result.success) return;

            let prior = context.before;`,
`            if (!context.result.success) return;

            observeSkunkExplosionResponse(
                context.before,
                context.actions ?? [],
                context.action,
                result.skunkExplosionResponse!,
            );

            let prior = context.before;`,
        "collector Explosion response observation",
    );

    source = replaceOnce(
        source,
`function emptySkunkExplosionMetrics(): SkunkExplosionMetrics {
    return { intentionsQueued: 0, killedBeforeUse: 0, uses: 0, cancelledBeforeUse: 0 };
}

function attributeReceived(`,
`function emptySkunkExplosionMetrics(): SkunkExplosionMetrics {
    return { intentionsQueued: 0, killedBeforeUse: 0, uses: 0, cancelledBeforeUse: 0 };
}

function emptySkunkExplosionResponseActionCounts(): SkunkExplosionResponseActionCounts {
    return {
        damageExplodingSkunk: 0,
        damageOtherEnemy: 0,
        stopExplodingSkunk: 0,
        supportExplodingSkunk: 0,
        escape: 0,
        stance: 0,
        supportMove: 0,
        endTurn: 0,
    };
}

function emptySkunkExplosionResponseMetrics(): SkunkExplosionResponseMetrics {
    return {
        decisionsObserved: 0,
        withDamageOption: 0,
        actions: emptySkunkExplosionResponseActionCounts(),
        whileDamageOptionAvailable: emptySkunkExplosionResponseActionCounts(),
        movesByMove: {},
        whileDamageOptionAvailableByMove: {},
        targetsById: {},
        whileDamageOptionAvailableTargetsById: {},
        damageExplodingSkunkByMove: {},
        damageOtherEnemyByMove: {},
    };
}

function observeSkunkExplosionResponse(
    before: GameState,
    actionViews: readonly ActionView[],
    action: PlayerAction,
    result: SkunkExplosionResponseMetrics,
): void {
    const explodingSkunks = new Set(
        before.enemies
            .filter((enemy) => enemy.currHp > 0 && hasExplosionIntention(enemy))
            .map((enemy) => enemy.id),
    );

    if (explodingSkunks.size === 0) return;

    result.decisionsObserved += 1;

    const damageOptionAvailable = hasDamageOptionAgainst(
        actionViews,
        explodingSkunks,
    );

    if (damageOptionAvailable) {
        result.withDamageOption += 1;
    }

    const classification = classifyExplosionResponseAction(
        before,
        actionViews,
        action,
        explodingSkunks,
    );

    result.actions[classification] += 1;

    if (damageOptionAvailable) {
        result.whileDamageOptionAvailable[classification] += 1;
    }

    if (action.type !== "move") return;

    increment(result.movesByMove, action.move);

    if (damageOptionAvailable) {
        increment(
            result.whileDamageOptionAvailableByMove,
            action.move,
        );
    }

    const previews = selectedMovePreviews(actionViews, action);

    for (const preview of previews) {
        if (preview.target === null) continue;

        increment(result.targetsById, preview.target);

        if (damageOptionAvailable) {
            increment(
                result.whileDamageOptionAvailableTargetsById,
                preview.target,
            );
        }
    }

    if (classification === "damageExplodingSkunk") {
        increment(result.damageExplodingSkunkByMove, action.move);
    } else if (classification === "damageOtherEnemy") {
        increment(result.damageOtherEnemyByMove, action.move);
    }
}

function hasDamageOptionAgainst(
    actionViews: readonly ActionView[],
    enemyIds: ReadonlySet<string>,
): boolean {
    return actionViews.some(
        (actor) =>
            actor.available
            && actor.moves.some(
                (move) =>
                    move.available
                    && move.targets.some(
                        (target) =>
                            target.valid
                            && target.target !== null
                            && enemyIds.has(target.target)
                            && previewCanDamage(target),
                    ),
            ),
    );
}

function classifyExplosionResponseAction(
    before: GameState,
    actionViews: readonly ActionView[],
    action: PlayerAction,
    explodingSkunks: ReadonlySet<string>,
): keyof SkunkExplosionResponseActionCounts {
    switch (action.type) {
        case "escape":
            return "escape";

        case "stance":
            return "stance";

        case "endTurn":
            return "endTurn";

        case "move": {
            const previews = selectedMovePreviews(actionViews, action);

            const targetsExplosion = previews.some(
                (target) =>
                    target.target !== null
                    && explodingSkunks.has(target.target),
            );

            if (action.move === "stop" && targetsExplosion) {
                return "stopExplodingSkunk";
            }

            const damagesExplosion = previews.some(
                (target) =>
                    target.target !== null
                    && explodingSkunks.has(target.target)
                    && previewCanDamage(target),
            );

            if (damagesExplosion) {
                return "damageExplodingSkunk";
            }

            const enemyIds = new Set(
                before.enemies.map((enemy) => enemy.id),
            );

            const damagesOtherEnemy = previews.some(
                (target) =>
                    target.target !== null
                    && enemyIds.has(target.target)
                    && !explodingSkunks.has(target.target)
                    && previewCanDamage(target),
            );

            if (damagesOtherEnemy) {
                return "damageOtherEnemy";
            }

            if (targetsExplosion) {
                return "supportExplodingSkunk";
            }

            return "supportMove";
        }
    }
}

function selectedMovePreviews(
    actionViews: readonly ActionView[],
    action: Extract<PlayerAction, { type: "move" }>,
): ValidTarget[] {
    const moveInfo = findMoveInfo(
        actionViews,
        action.actor,
        action.move,
    );

    if (!moveInfo) return [];

    const valid = moveInfo.targets.filter(
        (target): target is ValidTarget => target.valid,
    );

    /*
     * Smart represents all-target and zero-target moves with no explicit
     * selected target IDs, so use their complete public preview set.
     */
    if (moveInfo.move.targets === "all" || moveInfo.move.targets === 0) {
        return valid;
    }

    const selectedIds = new Set(action.targets);

    return valid.filter(
        (target) =>
            target.target !== null
            && selectedIds.has(target.target),
    );
}

function findMoveInfo(
    actionViews: readonly ActionView[],
    actorId: string,
    moveId: string,
): ActionInfo | undefined {
    return actionViews
        .find((actor) => actor.id === actorId)
        ?.moves.find((move) => move.move.id === moveId);
}

function previewCanDamage(target: ValidTarget): boolean {
    if (
        Object.values(target.damage ?? {}).some(
            (band) => band !== undefined && band.max > 0,
        )
    ) {
        return true;
    }

    return target.effects.some(
        (effect) =>
            effect.type === "damage"
            && effect.amount > 0,
    );
}

function attributeReceived(`,
        "Explosion response helper functions",
    );

    return source;
});

/* =========================================================
 * batch/summary.ts
 * Aggregate the per-fight response metrics.
 * ========================================================= */

patch("src/harness/batch/summary.ts", (source) => {
    source = replaceOnce(
        source,
`    RescueMetrics,
    SkunkExplosionMetrics,
    UnattributedBondageBlockedMetrics,`,
`    RescueMetrics,
    SkunkExplosionMetrics,
    SkunkExplosionResponseMetrics,
    UnattributedBondageBlockedMetrics,`,
        "summary Explosion response import",
    );

    source = replaceOnce(
        source,
`    bondageReceived: BondageReceivedMetrics;
    skunkExplosion: SkunkExplosionMetrics;
    forensicExamples: ForensicExamples;`,
`    bondageReceived: BondageReceivedMetrics;
    skunkExplosion: SkunkExplosionMetrics;
    skunkExplosionResponse: SkunkExplosionResponseMetrics;
    forensicExamples: ForensicExamples;`,
        "BatchSummary Explosion response field",
    );

    source = replaceOnce(
        source,
`        skunkExplosion: { ...detailedCombat.skunkExplosion },
        forensicExamples,`,
`        skunkExplosion: { ...detailedCombat.skunkExplosion },
        skunkExplosionResponse: finishSkunkExplosionResponse(
            detailedCombat.skunkExplosionResponse,
        ),
        forensicExamples,`,
        "summary Explosion response output",
    );

    source = replaceOnce(
        source,
`        skunkExplosion: {
            intentionsQueued: 0,
            killedBeforeUse: 0,
            uses: 0,
            cancelledBeforeUse: 0,
        },
    };`,
`        skunkExplosion: {
            intentionsQueued: 0,
            killedBeforeUse: 0,
            uses: 0,
            cancelledBeforeUse: 0,
        },
        skunkExplosionResponse: emptySkunkExplosionResponseMetrics(),
    };`,
        "empty detailed combat Explosion response",
    );

    source = replaceOnce(
        source,
`    target.skunkExplosion.intentionsQueued += source.skunkExplosion.intentionsQueued;
    target.skunkExplosion.killedBeforeUse += source.skunkExplosion.killedBeforeUse;
    target.skunkExplosion.uses += source.skunkExplosion.uses;
    target.skunkExplosion.cancelledBeforeUse += source.skunkExplosion.cancelledBeforeUse;

    for (const [moveId, sourceMove] of Object.entries(source.playerMoves)) {`,
`    target.skunkExplosion.intentionsQueued += source.skunkExplosion.intentionsQueued;
    target.skunkExplosion.killedBeforeUse += source.skunkExplosion.killedBeforeUse;
    target.skunkExplosion.uses += source.skunkExplosion.uses;
    target.skunkExplosion.cancelledBeforeUse += source.skunkExplosion.cancelledBeforeUse;

    if (source.skunkExplosionResponse) {
        const response =
            target.skunkExplosionResponse ??=
                emptySkunkExplosionResponseMetrics();

        response.decisionsObserved +=
            source.skunkExplosionResponse.decisionsObserved;

        response.withDamageOption +=
            source.skunkExplosionResponse.withDamageOption;

        addExplosionResponseActions(
            response.actions,
            source.skunkExplosionResponse.actions,
        );

        addExplosionResponseActions(
            response.whileDamageOptionAvailable,
            source.skunkExplosionResponse.whileDamageOptionAvailable,
        );

        addRecord(
            response.movesByMove,
            source.skunkExplosionResponse.movesByMove,
        );

        addRecord(
            response.whileDamageOptionAvailableByMove,
            source.skunkExplosionResponse.whileDamageOptionAvailableByMove,
        );

        addRecord(
            response.targetsById,
            source.skunkExplosionResponse.targetsById,
        );

        addRecord(
            response.whileDamageOptionAvailableTargetsById,
            source.skunkExplosionResponse
                .whileDamageOptionAvailableTargetsById,
        );

        addRecord(
            response.damageExplodingSkunkByMove,
            source.skunkExplosionResponse.damageExplodingSkunkByMove,
        );

        addRecord(
            response.damageOtherEnemyByMove,
            source.skunkExplosionResponse.damageOtherEnemyByMove,
        );
    }

    for (const [moveId, sourceMove] of Object.entries(source.playerMoves)) {`,
        "aggregate Explosion response",
    );

    source = replaceOnce(
        source,
`function finishPlayerMoves(
    moves: Record<string, RawPlayerMoveMetrics>,
): Record<string, PlayerMovePerformanceSummary> {`,
`function emptySkunkExplosionResponseMetrics(): SkunkExplosionResponseMetrics {
    return {
        decisionsObserved: 0,
        withDamageOption: 0,
        actions: {
            damageExplodingSkunk: 0,
            damageOtherEnemy: 0,
            stopExplodingSkunk: 0,
            supportExplodingSkunk: 0,
            escape: 0,
            stance: 0,
            supportMove: 0,
            endTurn: 0,
        },
        whileDamageOptionAvailable: {
            damageExplodingSkunk: 0,
            damageOtherEnemy: 0,
            stopExplodingSkunk: 0,
            supportExplodingSkunk: 0,
            escape: 0,
            stance: 0,
            supportMove: 0,
            endTurn: 0,
        },
        movesByMove: {},
        whileDamageOptionAvailableByMove: {},
        targetsById: {},
        whileDamageOptionAvailableTargetsById: {},
        damageExplodingSkunkByMove: {},
        damageOtherEnemyByMove: {},
    };
}

function addExplosionResponseActions(
    target: SkunkExplosionResponseMetrics["actions"],
    source: SkunkExplosionResponseMetrics["actions"],
): void {
    for (const key of [
        "damageExplodingSkunk",
        "damageOtherEnemy",
        "stopExplodingSkunk",
        "supportExplodingSkunk",
        "escape",
        "stance",
        "supportMove",
        "endTurn",
    ] as const) {
        target[key] += source[key];
    }
}

function finishSkunkExplosionResponse(
    source: SkunkExplosionResponseMetrics | undefined,
): SkunkExplosionResponseMetrics {
    const value =
        source ?? emptySkunkExplosionResponseMetrics();

    return {
        decisionsObserved: value.decisionsObserved,
        withDamageOption: value.withDamageOption,

        actions: {
            ...value.actions,
        },

        whileDamageOptionAvailable: {
            ...value.whileDamageOptionAvailable,
        },

        movesByMove: sortedRecord(
            value.movesByMove,
        ),

        whileDamageOptionAvailableByMove: sortedRecord(
            value.whileDamageOptionAvailableByMove,
        ),

        targetsById: sortedRecord(
            value.targetsById,
        ),

        whileDamageOptionAvailableTargetsById: sortedRecord(
            value.whileDamageOptionAvailableTargetsById,
        ),

        damageExplodingSkunkByMove: sortedRecord(
            value.damageExplodingSkunkByMove,
        ),

        damageOtherEnemyByMove: sortedRecord(
            value.damageOtherEnemyByMove,
        ),
    };
}

function finishPlayerMoves(
    moves: Record<string, RawPlayerMoveMetrics>,
): Record<string, PlayerMovePerformanceSummary> {`,
        "summary Explosion response helpers",
    );

    return source;
});

/* =========================================================
 * Focused tests
 * ========================================================= */

const testPath =
    "tests/harness/skunk-explosion-response-metrics.test.ts";

if (fs.existsSync(path.join(root, testPath))) {
    throw new Error(
        `${testPath} already exists; refusing to overwrite it`,
    );
}

write(testPath, `import { describe, expect, it } from "vitest";
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

function character(id: string): Character {
    return {
        id,
        acted: false,
        standing: true,
        bonusEscapes: 0,
        bindings: [],
        buffs: [],
        cooldowns: {},
        modifiers: {},
        blockedMoveTypes: [],
        data: {},
    };
}

function enemy(id: string, exploding = false): Enemy {
    return {
        id,
        rank: "enemy",
        maxHp: 300,
        currHp: 50,
        currDef: 0,
        intentions: exploding
            ? [{
                move: "latexExplosion",
                targets: [],
                effects: [],
            }]
            : [],
        buffs: [],
        cooldowns: {},
    };
}

function state(): GameState {
    return {
        turn: {
            round: 1,
            step: 1,
            phase: "player",
            outcome: "ongoing",
        },
        characters: [character("ko")],
        enemies: [
            enemy("skunk1", true),
            enemy("other"),
        ],
        traps: [],
        encounter: null,
    };
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
`);

console.log(`created ${testPath}`);

console.log("");
console.log("Done. Suggested validation:");
console.log(
    "  npx vitest run tests/harness/skunk-explosion-response-metrics.test.ts",
);
console.log("  npx vitest run tests/harness");
console.log("  npx tsc --noEmit");
console.log("  git diff --check");