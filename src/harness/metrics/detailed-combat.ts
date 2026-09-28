import type { ContentLibrary, MoveReference } from "../../engine/public/library";
import type {
    BondageEvent,
    Buff,
    Character,
    GameEvent,
    GameState,
    HitBand,
    LeafEvent,
    ModifierId,
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

/** Compact per-fight counters; derived averages are added only in BatchSummary. */
export interface DetailedCombatMetrics {
    escapeSequences: EscapeSequenceMetrics;
    skunkings: CountByCharacterMetrics;
    rescues: RescueMetrics;
    playerMoves: Record<string, RawPlayerMoveMetrics>;
    bondageRemoved: BondageRemovedMetrics;
    bondageBlocked: UnattributedBondageBlockedMetrics;
    bondageReceived: BondageReceivedMetrics;
}

const SKUNKED_BUFF = "skunked";

export function createDetailedCombatCollector(): MetricCollector<DetailedCombatMetrics> {
    const playerIds = new Set<string>();
    const pendingBonusEscape = new Set<string>();
    const defenseOrigins = new Map<string, string>();
    let library: ContentLibrary | undefined;
    const result: DetailedCombatMetrics = {
        escapeSequences: { single: 0, double: 0, byActor: {} },
        skunkings: { total: 0, byCharacter: {} },
        rescues: { total: 0, byCharacter: {}, byMove: {} },
        playerMoves: {},
        bondageRemoved: { escapes: 0, skills: 0, rescues: 0, unattributed: 0 },
        bondageBlocked: { unattributed: 0 },
        bondageReceived: { moves: {}, ticks: {}, traps: {}, unattributed: 0 },
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
        },
        onAction(context) {
            for (const actorId of [...pendingBonusEscape]) {
                const actor = context.before.characters.find(({ id }) => id === actorId);
                if ((actor?.bonusEscapes ?? 0) === 0) flushPending(actorId);
            }
            const actionActor = context.action.type === "endTurn" ? undefined : context.action.actor;
            if (actionActor !== undefined && context.action.type !== "escape") flushPending(actionActor);
            if (!context.result.success) return;

            let prior = context.before;
            for (const frame of context.result.frames) {
                observeFrame(frame.event, prior, frame.state, context.before, playerIds, library, defenseOrigins, result);
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
        onFightEnd() {
            for (const actorId of [...pendingBonusEscape]) flushPending(actorId);
        },
        getResult: () => structuredClone(result),
    };
}

function observeFrame(
    event: GameEvent,
    before: GameState,
    after: GameState,
    actionBefore: GameState,
    playerIds: ReadonlySet<string>,
    library: ContentLibrary | undefined,
    defenseOrigins: Map<string, string>,
    result: DetailedCombatMetrics,
): void {
    const leaves = flattenEvent(event);
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
