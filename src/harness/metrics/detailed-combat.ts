import type { ContentLibrary, MoveReference } from "../../engine/public/library";
import type {
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
} from "../../engine/public/types";
import type { MetricCollector } from "./collector";

export interface SequenceCounts {
    single: number;
    double: number;
}

export interface EscapeSequenceMetrics extends SequenceCounts {
    byActor: Record<string, SequenceCounts>;
}

export interface CountByCharacterMetrics {
    total: number;
    byCharacter: Record<string, number>;
}

export interface RescueMetrics extends CountByCharacterMetrics {
    byMove: Record<string, number>;
}

export interface RawMoveAccuracyMetrics {
    stat: "hit" | "willpower" | null;
    modifierTotal: number;
    modifierUses: number;
    minModifier: number | null;
    maxModifier: number | null;
    usesByModifier: Record<string, number>;
    results: Record<HitBand, number>;
}

export interface RawPlayerMoveMetrics {
    uses: number;
    totalDamage: number;
    accuracy: RawMoveAccuracyMetrics;
    totalBondageRemoved: number;
    totalBondageBlocked: number;
}

export interface BondageRemovedMetrics {
    escapes: number;
    skills: number;
    rescues: number;
    unattributed: number;
}

export interface UnattributedBondageBlockedMetrics {
    unattributed: number;
}

export interface BondageReceivedMetrics {
    moves: Record<string, number>;
    ticks: Record<string, number>;
    traps: Record<string, number>;
    unattributed: number;
}

export interface SkunkExplosionMetrics {
    intentionsQueued: number;
    killedBeforeUse: number;
    uses: number;
    cancelledBeforeUse: number;
    hpAtTrigger: Record<string, number>;
    unspentCharactersAtTrigger: Record<string, number>;
    hpAndUnspentAtTrigger: Record<string, number>;
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

export interface EnemyLifetimeMetrics {
    /** Inclusive rounds observed across all instances with this exact public ID. */
    totalRounds: number;
    observations: number;
    defeated: number;
    survivedToEnd: number;
}

/** Compact per-fight counters; derived averages are added only in BatchSummary. */
export interface DetailedCombatMetrics {
    escapeSequences: EscapeSequenceMetrics;
    skunkings: CountByCharacterMetrics;
    rescues: RescueMetrics;
    playerMoves: Record<string, RawPlayerMoveMetrics>;
    bondageRemoved: BondageRemovedMetrics;
    bondageBlocked: UnattributedBondageBlockedMetrics;
    bondageReceived: BondageReceivedMetrics;
    skunkExplosion: SkunkExplosionMetrics;

    /** Optional so older/synthetic DetailedCombatMetrics fixtures remain valid. */
    enemyLifetimes?: Record<string, EnemyLifetimeMetrics>;

    /** Optional so older/synthetic DetailedCombatMetrics fixtures remain valid. */
    skunkExplosionResponse?: SkunkExplosionResponseMetrics;
}

const SKUNKED_BUFF = "skunked";

export function createDetailedCombatCollector(): MetricCollector<DetailedCombatMetrics> {
    const playerIds = new Set<string>();
    const pendingBonusEscape = new Set<string>();
    const pendingExplosions = new Set<string>();
    const defenseOrigins = new Map<string, string>();
    const activeEnemyFirstSeen = new Map<string, number>();
    const observedEnemyIds = new Set<string>();
    let library: ContentLibrary | undefined;
    const result: DetailedCombatMetrics = {
        escapeSequences: { single: 0, double: 0, byActor: {} },
        skunkings: { total: 0, byCharacter: {} },
        rescues: { total: 0, byCharacter: {}, byMove: {} },
        playerMoves: {},
        bondageRemoved: { escapes: 0, skills: 0, rescues: 0, unattributed: 0 },
        bondageBlocked: { unattributed: 0 },
        bondageReceived: { moves: {}, ticks: {}, traps: {}, unattributed: 0 },
        skunkExplosion: emptySkunkExplosionMetrics(),
        enemyLifetimes: {},
        skunkExplosionResponse: emptySkunkExplosionResponseMetrics(),
    };

    const countSequence = (actorId: string, kind: keyof SequenceCounts): void => {
        result.escapeSequences[kind] += 1;
        const actor = result.escapeSequences.byActor[actorId] ??= { single: 0, double: 0 };
        actor[kind] += 1;
    };

    const flushPending = (actorId: string): void => {
        if (!pendingBonusEscape.delete(actorId)) return;
        countSequence(actorId, "single");
    };

    return {
        id: "detailedCombat",
        onFightStart(context) {
            library = context.library;
            for (const character of context.view.characters) playerIds.add(character.id);
            observeEnemyAppearances(
                context.view,
                activeEnemyFirstSeen,
                observedEnemyIds,
            );
            queueNewExplosionEpisodes(context.view, pendingExplosions, result.skunkExplosion);
        },
        onAction(context) {
            for (const actorId of [...pendingBonusEscape]) {
                const actor = context.before.characters.find(({ id }) => id === actorId);
                if ((actor?.bonusEscapes ?? 0) === 0) flushPending(actorId);
            }
            const actionActor = context.action.type === "endTurn" ? undefined : context.action.actor;
            if (actionActor !== undefined && context.action.type !== "escape") flushPending(actionActor);
            if (!context.result.success) return;

            observeSkunkExplosionResponse(
                context.before,
                context.actions ?? [],
                context.action,
                result.skunkExplosionResponse!,
            );

            let prior = context.before;
            for (const frame of context.result.frames) {
                observeEnemyLifetimeFrame(
                    frame.event,
                    prior,
                    frame.state,
                    activeEnemyFirstSeen,
                    observedEnemyIds,
                    result.enemyLifetimes!,
                );
                observeFrame(
                    frame.event,
                    prior,
                    frame.state,
                    context.before,
                    playerIds,
                    library,
                    defenseOrigins,
                    pendingExplosions,
                    result,
                );
                prior = frame.state;
            }

            if (context.action.type === "escape") {
                const action = context.action;
                const events = context.result.frames.map((frame) => frame.event);
                if (!hasActualEscape(events, action.target, action.binding)) {
                    flushPending(action.actor);
                    return;
                }
                const actorBefore = context.before.characters.find(({ id }) => id === action.actor);
                const after = context.result.frames.at(-1)?.state ?? context.before;
                const actorAfter = after.characters.find(({ id }) => id === action.actor);
                if ((actorBefore?.bonusEscapes ?? 0) > 0 && pendingBonusEscape.delete(action.actor)) {
                    countSequence(action.actor, "double");
                } else if ((actorAfter?.bonusEscapes ?? 0) > 0) {
                    pendingBonusEscape.add(action.actor);
                } else {
                    countSequence(action.actor, "single");
                }
            }
        },
        onFightEnd(context) {
            for (const actorId of [...pendingBonusEscape]) flushPending(actorId);
            observeEnemyAppearances(
                context.view,
                activeEnemyFirstSeen,
                observedEnemyIds,
            );
            for (const enemyId of [...activeEnemyFirstSeen.keys()]) {
                closeEnemyLifetime(
                    enemyId,
                    context.view.turn.round,
                    false,
                    activeEnemyFirstSeen,
                    result.enemyLifetimes!,
                );
            }
        },
        getResult: () => structuredClone(result),
    };
}

function observeEnemyLifetimeFrame(
    event: GameEvent,
    before: GameState,
    after: GameState,
    active: Map<string, number>,
    observed: Set<string>,
    result: Record<string, EnemyLifetimeMetrics>,
): void {
    observeEnemyAppearances(before, active, observed);
    const leaves = flattenEvent(event);
    for (const leaf of leaves) {
        if (leaf.type === "enemySpawned") {
            observeEnemyAppearance(
                leaf.target,
                after.turn.round,
                active,
                observed,
            );
        }
    }
    observeEnemyAppearances(after, active, observed);
    for (const leaf of leaves) {
        if (leaf.type !== "enemyDefeated") continue;
        observeEnemyAppearance(
            leaf.target,
            after.turn.round,
            active,
            observed,
        );
        closeEnemyLifetime(
            leaf.target,
            after.turn.round,
            true,
            active,
            result,
        );
    }
}

function observeEnemyAppearances(
    view: GameState,
    active: Map<string, number>,
    observed: Set<string>,
): void {
    for (const enemy of view.enemies) {
        observeEnemyAppearance(enemy.id, view.turn.round, active, observed);
    }
}

function observeEnemyAppearance(
    enemyId: string,
    round: number,
    active: Map<string, number>,
    observed: Set<string>,
): void {
    if (observed.has(enemyId)) return;
    observed.add(enemyId);
    active.set(enemyId, round);
}

function closeEnemyLifetime(
    enemyId: string,
    endRound: number,
    defeated: boolean,
    active: Map<string, number>,
    result: Record<string, EnemyLifetimeMetrics>,
): void {
    const firstSeenRound = active.get(enemyId);
    if (firstSeenRound === undefined) return;
    active.delete(enemyId);
    const metrics = result[enemyId] ??= {
        totalRounds: 0,
        observations: 0,
        defeated: 0,
        survivedToEnd: 0,
    };
    metrics.totalRounds += Math.max(1, endRound - firstSeenRound + 1);
    metrics.observations += 1;
    if (defeated) metrics.defeated += 1;
    else metrics.survivedToEnd += 1;
}

function observeFrame(
    event: GameEvent,
    before: GameState,
    after: GameState,
    actionBefore: GameState,
    playerIds: ReadonlySet<string>,
    library: ContentLibrary | undefined,
    defenseOrigins: Map<string, string>,
    pendingExplosions: Set<string>,
    result: DetailedCombatMetrics,
): void {
    const leaves = flattenEvent(event);
    observeExplosionFrame(
        event,
        leaves,
        after,
        pendingExplosions,
        result.skunkExplosion,
    );
    const beforeLinks = skunkLinks(before);
    const afterLinks = skunkLinks(after);
    for (const [characterId] of afterLinks) {
        if (beforeLinks.has(characterId)) continue;
        result.skunkings.total += 1;
        increment(result.skunkings.byCharacter, characterId);
    }

    const defeated = new Set(leaves.flatMap((leaf) => leaf.type === "enemyDefeated"
        ? [leaf.target]
        : []));
    const rescued = new Set<string>();
    for (const [characterId, linkedEnemy] of beforeLinks) {
        if (afterLinks.has(characterId) || !defeated.has(linkedEnemy)) continue;
        rescued.add(characterId);
        result.rescues.total += 1;
        increment(result.rescues.byCharacter, characterId);
        if (event.type === "useMove" && playerIds.has(event.actor)) {
            increment(result.rescues.byMove, event.move);
        }
    }

    let playerMove: RawPlayerMoveMetrics | undefined;
    if (event.type === "useMove" && playerIds.has(event.actor)) {
        playerMove = getPlayerMove(result.playerMoves, event.move);
        playerMove.uses += 1;
        for (const target of event.targets) playerMove.accuracy.results[target.result] += 1;
        const move = library?.moves[event.move];
        const actor = actionBefore.characters.find(({ id }) => id === event.actor);
        recordAccuracy(playerMove.accuracy, actor, move);
        if (event.move === "stop") {
            playerMove.totalBondageBlocked += stoppedCommittedBondage(
                leaves,
                before,
                after,
                playerIds,
            );
        }
    }

    const blockedSources = new Set<string>();
    for (const leaf of leaves) {
        if (leaf.type !== "bondageBlocked") continue;
        const source = defensiveSource(leaf.target, leaves, before, defenseOrigins);
        if (source === undefined) {
            result.bondageBlocked.unattributed += leaf.amount;
            continue;
        }
        getPlayerMove(result.playerMoves, source).totalBondageBlocked += leaf.amount;
        blockedSources.add(source);
    }

    for (const leaf of leaves) {
        if (leaf.type === "enemyDamaged") {
            if (playerMove) {
                playerMove.totalDamage += leaf.amount;
            } else if (event.type === "useMove" && !playerIds.has(event.actor)
                && blockedSources.size === 1) {
                getPlayerMove(result.playerMoves, [...blockedSources][0]).totalDamage += leaf.amount;
            }
            continue;
        }
        if (!isBondageChange(leaf) || leaf.amount === 0) continue;
        if (leaf.amount < 0) {
            const amount = -leaf.amount;
            if (event.type === "useEscape") {
                result.bondageRemoved.escapes += amount;
            } else if (rescued.has(leaf.target)) {
                result.bondageRemoved.rescues += amount;
            } else if (playerMove) {
                result.bondageRemoved.skills += amount;
                playerMove.totalBondageRemoved += amount;
            } else {
                result.bondageRemoved.unattributed += amount;
            }
        } else {
            attributeReceived(leaf, event, before, playerIds, result.bondageReceived);
        }
    }

    if (playerMove && event.type === "useMove") {
        for (const leaf of leaves) {
            if (leaf.type !== "buffAdded" && leaf.type !== "buffUpdated") continue;
            if (leaf.buff === event.move) defenseOrigins.set(buffKey(leaf.target, leaf.buff), event.move);
        }
    }
    for (const [key] of defenseOrigins) {
        const [target, buff] = splitBuffKey(key);
        if (!entityBuffs(after, target).some(({ id }) => id === buff)) defenseOrigins.delete(key);
    }
}

function observeExplosionFrame(
    event: GameEvent,
    leaves: readonly LeafEvent[],
    after: GameState,
    pending: Set<string>,
    result: SkunkExplosionMetrics,
): void {
    let justUsed: string | undefined;
    if (event.type === "useMove" && event.move === "latexExplosion") {
        result.uses += 1;
        pending.delete(event.actor);
        justUsed = event.actor;
    }

    for (const leaf of leaves) {
        if (leaf.type === "intentionCancelled" && pending.has(leaf.target)
            && isLivingEnemy(after, leaf.target)) {
            result.cancelledBeforeUse += 1;
            pending.delete(leaf.target);
        } else if (leaf.type === "enemyDefeated" && pending.delete(leaf.target)) {
            result.killedBeforeUse += 1;
        }
    }

    for (const enemyId of [...pending]) {
        const enemy = after.enemies.find(({ id }) => id === enemyId);
        if (!enemy || !hasExplosionIntention(enemy)) pending.delete(enemyId);
    }
    queueNewExplosionEpisodes(after, pending, result, justUsed);
}

function explosionHpBucket(hp: number): string {
    if (hp <= 15) return "01-15";
    if (hp <= 30) return "16-30";
    if (hp <= 45) return "31-45";
    if (hp <= 60) return "46-60";
    return "61+";
}

function queueNewExplosionEpisodes(
    view: GameState,
    pending: Set<string>,
    result: SkunkExplosionMetrics,
    suppressedEnemy?: string,
): void {
    for (const enemy of view.enemies) {
        if (enemy.id === suppressedEnemy || !isLivingEnemy(view, enemy.id)
            || !hasExplosionIntention(enemy) || pending.has(enemy.id)) {
            continue;
        }
        pending.add(enemy.id);
        result.intentionsQueued += 1;

        const hpBucket = explosionHpBucket(enemy.currHp);
        const unspentCharacters = view.characters.filter(
            character => !character.acted
        ).length;

        increment(result.hpAtTrigger, hpBucket);
        increment(result.unspentCharactersAtTrigger, String(unspentCharacters));
        increment(
            result.hpAndUnspentAtTrigger,
            `${hpBucket}|${unspentCharacters}`,
        );
    }
}

function hasExplosionIntention(enemy: Enemy): boolean {
    return enemy.intentions.some(({ move }) => move === "latexExplosion");
}

function isLivingEnemy(view: GameState, enemyId: string): boolean {
    return view.enemies.some(({ id, currHp }) => id === enemyId && currHp > 0);
}

function stoppedCommittedBondage(
    leaves: readonly LeafEvent[],
    before: GameState,
    after: GameState,
    playerIds: ReadonlySet<string>,
): number {
    const cancelled = new Set(leaves.flatMap((leaf) => leaf.type === "intentionCancelled"
        ? [leaf.target]
        : []));
    const weakened = new Set(leaves.flatMap((leaf) => leaf.type === "intentionWeakened"
        ? [leaf.target]
        : []));
    let blocked = 0;
    for (const enemyId of cancelled) {
        blocked += committedPositiveBondage(before, enemyId, playerIds);
    }
    for (const enemyId of weakened) {
        blocked += Math.max(
            0,
            committedPositiveBondage(before, enemyId, playerIds)
            - committedPositiveBondage(after, enemyId, playerIds),
        );
    }
    return blocked;
}

function committedPositiveBondage(
    view: GameState,
    enemyId: string,
    playerIds: ReadonlySet<string>,
): number {
    const enemy = view.enemies.find(({ id }) => id === enemyId);
    if (!enemy) return 0;
    let total = 0;
    for (const intention of enemy.intentions) {
        total += positivePlayerBinding(intention.effects, playerIds);
        for (const target of intention.targets) {
            total += positivePlayerBinding(target.effects, playerIds);
        }
    }
    return total;
}

function positivePlayerBinding(
    effects: readonly Effect[],
    playerIds: ReadonlySet<string>,
): number {
    return effects.reduce((total, effect) => effect.type === "binding"
        && playerIds.has(effect.target) && (effect.amount ?? 0) > 0
        ? total + effect.amount!
        : total, 0);
}

function emptySkunkExplosionMetrics(): SkunkExplosionMetrics {
    return {
        intentionsQueued: 0,
        killedBeforeUse: 0,
        uses: 0,
        cancelledBeforeUse: 0,
        hpAtTrigger: {},
        unspentCharactersAtTrigger: {},
        hpAndUnspentAtTrigger: {},
    };
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

function attributeReceived(
    event: BondageEvent,
    parent: GameEvent,
    before: GameState,
    playerIds: ReadonlySet<string>,
    result: BondageReceivedMetrics,
): void {
    if (parent.type === "useMove" && !playerIds.has(parent.actor)) {
        increment(result.moves, parent.move, event.amount);
        return;
    }
    const trap = trapSource(parent, event);
    if (trap !== undefined) {
        increment(result.traps, trap, event.amount);
        return;
    }
    if (parent.type === "changePhase" && before.turn.phase === "player") {
        const sources = tickSources(before, event);
        if (sources.size === 1) {
            increment(result.ticks, [...sources][0], event.amount);
            return;
        }
    }
    result.unattributed += event.amount;
}

function trapSource(parent: GameEvent, event: BondageEvent): string | undefined {
    if (parent.type === "useMove" && !parent.effects.includes(event)) return undefined;
    const effects = parent.effects;
    const eventIndex = effects.indexOf(event);
    if (eventIndex < 0) return undefined;
    const triggers = effects.flatMap((leaf, index) => leaf.type === "trapTriggered"
        && leaf.actor === event.target && index < eventIndex ? [{ id: leaf.trap, index }] : []);
    if (triggers.length === 0) return undefined;
    const latestTrigger = triggers.at(-1)!;
    const competingBoundary = effects.findIndex((leaf, index) => index > latestTrigger.index
        && isBondageChange(leaf) && leaf.amount < 0);
    if (parent.type === "useEscape" && competingBoundary >= 0 && eventIndex > competingBoundary) {
        return undefined;
    }
    const ids = new Set(triggers.map(({ id }) => id));
    return ids.size === 1 ? latestTrigger.id : undefined;
}

function tickSources(view: GameState, event: BondageEvent): Set<string> {
    const sources = new Set<string>();
    const character = view.characters.find(({ id }) => id === event.target);
    for (const binding of character?.bindings ?? []) {
        if (binding.tickEffects.some((effect) => effect.type === "binding"
            && effect.target === event.target && effect.binding === event.binding)) {
            sources.add(binding.id);
        }
    }
    return sources;
}

function defensiveSource(
    target: string,
    leaves: readonly LeafEvent[],
    before: GameState,
    origins: ReadonlyMap<string, string>,
): string | undefined {
    const removed = new Set(leaves.flatMap((leaf) => leaf.type === "buffRemoved"
        && leaf.target === target ? [leaf.buff] : []));
    const candidates = new Set<string>();
    for (const buff of entityBuffs(before, target)) {
        if (!removed.has(buff.id)) continue;
        const origin = origins.get(buffKey(target, buff.id));
        if (origin !== undefined) candidates.add(origin);
    }
    return candidates.size === 1 ? [...candidates][0] : undefined;
}

function recordAccuracy(
    metrics: RawMoveAccuracyMetrics,
    actor: Character | undefined,
    move: MoveReference | undefined,
): void {
    if (!actor || !move?.accuracy) return;
    const stat = move.check === "willpower" ? "willpower" : "hit";
    const modifier = stat === "willpower"
        ? modifierValue(actor, move, "willpower")
        : modifierValue(actor, move, "hit") + moveTypeModifier(actor, move);
    metrics.stat = stat;
    metrics.modifierTotal += modifier;
    metrics.modifierUses += 1;
    metrics.minModifier = metrics.minModifier === null ? modifier : Math.min(metrics.minModifier, modifier);
    metrics.maxModifier = metrics.maxModifier === null ? modifier : Math.max(metrics.maxModifier, modifier);
    increment(metrics.usesByModifier, String(modifier));
}

function moveTypeModifier(actor: Character, move: MoveReference): number {
    const id = move.type === "arms" ? "hitarms"
        : move.type === "mouth" ? "hitmouth"
            : move.type === "legs" ? "hitlegs" : undefined;
    return id === undefined ? 0 : modifierValue(actor, move, id);
}

function modifierValue(actor: Character, move: MoveReference, id: ModifierId): number {
    return (actor.modifiers[id] ?? 0) + (move.modifiers?.[id] ?? 0);
}

function getPlayerMove(
    moves: Record<string, RawPlayerMoveMetrics>,
    id: string,
): RawPlayerMoveMetrics {
    return moves[id] ??= {
        uses: 0,
        totalDamage: 0,
        accuracy: {
            stat: null,
            modifierTotal: 0,
            modifierUses: 0,
            minModifier: null,
            maxModifier: null,
            usesByModifier: {},
            results: emptyResults(),
        },
        totalBondageRemoved: 0,
        totalBondageBlocked: 0,
    };
}

function flattenEvent(event: GameEvent): LeafEvent[] {
    return event.type === "useMove"
        ? [...event.targets.flatMap((target) => target.effects), ...event.effects]
        : event.effects;
}

function hasActualEscape(events: readonly GameEvent[], target: string, binding: string): boolean {
    return events.flatMap(flattenEvent).some((event) => isBondageChange(event)
        && event.target === target && event.binding === binding && event.amount < 0);
}

function isBondageChange(event: LeafEvent): event is BondageEvent {
    return event.type === "bondageChanged" || event.type === "bondageAdded"
        || event.type === "bondageRemoved";
}

function skunkLinks(view: GameState): Map<string, string> {
    const links = new Map<string, string>();
    for (const character of view.characters) {
        const buff = character.buffs.find(({ id, linkedEntity }) => id === SKUNKED_BUFF
            && linkedEntity !== undefined);
        if (buff?.linkedEntity !== undefined) links.set(character.id, buff.linkedEntity);
    }
    return links;
}

function entityBuffs(view: GameState, entityId: string): readonly Buff[] {
    return view.characters.find(({ id }) => id === entityId)?.buffs
        ?? view.enemies.find(({ id }) => id === entityId)?.buffs
        ?? [];
}

function buffKey(target: string, buff: string): string {
    return `${target}\u0000${buff}`;
}

function splitBuffKey(key: string): [string, string] {
    const separator = key.indexOf("\u0000");
    return [key.slice(0, separator), key.slice(separator + 1)];
}

function increment(record: Record<string, number>, key: string, amount = 1): void {
    record[key] = (record[key] ?? 0) + amount;
}

function emptyResults(): Record<HitBand, number> {
    return { miss: 0, graze: 0, hit: 0, crit: 0, none: 0 };
}
