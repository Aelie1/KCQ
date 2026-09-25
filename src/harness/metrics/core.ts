import type {
    Character,
    GameEvent,
    GameView,
    HitBand,
    LeafEvent,
} from "../../engine/public/types";
import type {
    MetricActionObservation,
    MetricCollector,
    MetricCollectorFactory,
    MetricFightEnd,
    MetricFightStart,
} from "./collector";

export interface OutcomeMetrics {
    termination: MetricFightEnd["termination"] | null;
    win: boolean;
    loss: boolean;
}

export interface ResolutionMetrics {
    resolved: boolean;
    actionsObserved: number;
    roundsObserved: number;
    actionsToResolution: number | null;
    roundsToResolution: number | null;
}

export interface BondageTrackMetrics {
    final: number;
    peak: number;
}

export interface CharacterBondageMetrics {
    finalTotal: number;
    peakTotal: number;
    tracks: Record<string, BondageTrackMetrics>;
}

export interface BondageMetrics {
    party: {
        finalTotal: number;
        peakTotal: number;
    };
    characters: Record<string, CharacterBondageMetrics>;
}

export interface DamageMetrics {
    /** Actual enemy HP removed, from enemyDamaged events. */
    dealt: number;
    dealtByTarget: Record<string, number>;
    /** Unsupported: characters do not have HP and no received-damage event exists. */
    received: null;
}

export interface SideMoveUsageMetrics {
    total: number;
    byMove: Record<string, number>;
    byActor: Record<string, Record<string, number>>;
}

export interface MoveUsageMetrics {
    player: SideMoveUsageMetrics;
    enemy: SideMoveUsageMetrics;
}

export type AccuracyCounts = Record<HitBand, number>;

export interface AccuracyMetrics {
    player: AccuracyCounts;
    enemy: AccuracyCounts;
}

export interface EscapeMetrics {
    attempts: number;
    successes: number;
    assists: {
        attempts: number;
        successes: number;
    };
    byActor: Record<string, { attempts: number; successes: number }>;
}

export interface TrapTrackMetrics {
    added: number;
    removed: number;
    triggered: number;
    addedAmount: number;
    removedAmount: number;
    triggeredAmount: number;
    finalAmount: number;
    peakAmount: number;
}

export interface TrapMetrics {
    totals: Omit<TrapTrackMetrics, "finalAmount" | "peakAmount">;
    tracks: Record<string, TrapTrackMetrics>;
}

export interface IncapacitationPoint {
    action: number;
    round: number;
    character: string;
}

export interface IncapacitationMetrics {
    occurrences: number;
    first: IncapacitationPoint | null;
    characters: Record<string, {
        occurrences: number;
        first: Omit<IncapacitationPoint, "character">;
    }>;
    /** Unsupported without a public capture event or capture state. */
    captures: null;
}

export interface MetricLimitations {
    damageReceived: string;
    damageAttribution: string;
    captures: string;
    incapacitationTiming: string;
}

export interface CoreMetricResults {
    outcome: OutcomeMetrics;
    resolution: ResolutionMetrics;
    bondage: BondageMetrics;
    damage: DamageMetrics;
    moves: MoveUsageMetrics;
    accuracy: AccuracyMetrics;
    escapes: EscapeMetrics;
    traps: TrapMetrics;
    incapacitations: IncapacitationMetrics;
    limitations: MetricLimitations;
}

export const metricLimitations: MetricLimitations = {
    damageReceived: "Characters expose bondage rather than HP, and public events have no character-damage event.",
    damageAttribution: "enemyDamaged events identify the target and amount but omit the damage source.",
    captures: "The public view and event stream do not expose a content-neutral capture event or capture state.",
    incapacitationTiming: "Incapacitation is observable only in post-action public views, so transitions within one action are not visible.",
};

export const coreMetricCollectorFactories: readonly MetricCollectorFactory[] = [
    createOutcomeCollector,
    createResolutionCollector,
    createBondageCollector,
    createDamageCollector,
    createMoveUsageCollector,
    createAccuracyCollector,
    createEscapeCollector,
    createTrapCollector,
    createIncapacitationCollector,
    createLimitationsCollector,
];

function leafEvents(events: readonly GameEvent[]): LeafEvent[] {
    return events.flatMap((event) => event.type === "useMove"
        ? [...event.targets.flatMap((target) => target.effects), ...event.effects]
        : event.effects);
}

export function createOutcomeCollector(): MetricCollector<OutcomeMetrics> {
    let result: OutcomeMetrics = { termination: null, win: false, loss: false };
    return {
        id: "outcome",
        onFightEnd(context) {
            result = {
                termination: context.termination,
                win: context.termination === "victory",
                loss: context.termination === "defeat",
            };
        },
        getResult: () => result,
    };
}

export function createResolutionCollector(): MetricCollector<ResolutionMetrics> {
    let result: ResolutionMetrics = {
        resolved: false,
        actionsObserved: 0,
        roundsObserved: 0,
        actionsToResolution: null,
        roundsToResolution: null,
    };
    return {
        id: "resolution",
        onFightEnd(context) {
            const resolved = context.termination === "victory" || context.termination === "defeat";
            result = {
                resolved,
                actionsObserved: context.actionCount,
                roundsObserved: context.view.turn.round,
                actionsToResolution: resolved ? context.actionCount : null,
                roundsToResolution: resolved ? context.view.turn.round : null,
            };
        },
        getResult: () => result,
    };
}

export function createBondageCollector(): MetricCollector<BondageMetrics> {
    const knownTracks = new Map<string, Set<string>>();
    const currentTracks = new Map<string, Map<string, number>>();
    const peakTracks = new Map<string, Map<string, number>>();
    const peakTotals = new Map<string, number>();
    let finalView: GameView | undefined;
    let partyPeak = 0;

    const updatePeaks = (): void => {
        let partyTotal = 0;
        for (const [characterId, current] of currentTracks) {
            const peaks = getOrCreate(peakTracks, characterId, () => new Map<string, number>());
            let characterTotal = 0;
            for (const [track, value] of current) {
                peaks.set(track, Math.max(peaks.get(track) ?? 0, value));
                characterTotal += value;
            }
            peakTotals.set(characterId, Math.max(peakTotals.get(characterId) ?? 0, characterTotal));
            partyTotal += characterTotal;
        }
        partyPeak = Math.max(partyPeak, partyTotal);
    };

    const observe = (view: GameView): void => {
        finalView = view;
        for (const character of view.characters) {
            const tracks = getOrCreate(knownTracks, character.id, () => new Set<string>());
            for (const binding of view.encounter?.bindings ?? []) tracks.add(binding);
            const current = new Map<string, number>();
            for (const track of tracks) current.set(track, 0);
            for (const binding of character.bindings) {
                tracks.add(binding.id);
                current.set(binding.id, binding.value);
            }
            currentTracks.set(character.id, current);
        }
        updatePeaks();
    };

    const observeEvents = (events: readonly GameEvent[]): void => {
        for (const event of leafEvents(events)) {
            if (event.type !== "bondageChanged" && event.type !== "bondageAdded"
                && event.type !== "bondageRemoved") continue;
            const tracks = getOrCreate(knownTracks, event.target, () => new Set<string>());
            tracks.add(event.binding);
            const current = getOrCreate(currentTracks, event.target, () => new Map<string, number>());
            const next = event.type === "bondageRemoved"
                ? 0
                : Math.max(0, (current.get(event.binding) ?? 0) + event.amount);
            current.set(event.binding, next);
            updatePeaks();
        }
    };

    return {
        id: "bondage",
        onFightStart: ({ view }) => observe(view),
        onAction: ({ result }) => {
            if (!result.success) return;
            observeEvents(result.events);
            // The public post-action view is authoritative and also reconciles
            // changes that do not currently emit a bondage event.
            observe(result.view);
        },
        onFightEnd: ({ view }) => observe(view),
        getResult() {
            const finalCharacters = new Map(
                (finalView?.characters ?? []).map((character) => [character.id, character]),
            );
            const characters: Record<string, CharacterBondageMetrics> = {};
            let partyFinal = 0;
            for (const [characterId, tracks] of knownTracks) {
                const character = finalCharacters.get(characterId);
                const current = new Map(
                    (character?.bindings ?? []).map((binding) => [binding.id, binding.value]),
                );
                const trackResults: Record<string, BondageTrackMetrics> = {};
                let finalTotal = 0;
                for (const track of tracks) {
                    const final = current.get(track) ?? 0;
                    finalTotal += final;
                    trackResults[track] = {
                        final,
                        peak: peakTracks.get(characterId)?.get(track) ?? 0,
                    };
                }
                partyFinal += finalTotal;
                characters[characterId] = {
                    finalTotal,
                    peakTotal: peakTotals.get(characterId) ?? 0,
                    tracks: trackResults,
                };
            }
            return {
                party: { finalTotal: partyFinal, peakTotal: partyPeak },
                characters,
            };
        },
    };
}

export function createDamageCollector(): MetricCollector<DamageMetrics> {
    let dealt = 0;
    const dealtByTarget: Record<string, number> = {};
    return {
        id: "damage",
        onAction({ result }) {
            if (!result.success) return;
            for (const event of leafEvents(result.events)) {
                if (event.type !== "enemyDamaged") continue;
                dealt += event.amount;
                increment(dealtByTarget, event.target, event.amount);
            }
        },
        getResult: () => ({ dealt, dealtByTarget: { ...dealtByTarget }, received: null }),
    };
}

export function createMoveUsageCollector(): MetricCollector<MoveUsageMetrics> {
    const playerIds = new Set<string>();
    const player = emptySideMoveUsage();
    const enemy = emptySideMoveUsage();
    return {
        id: "moves",
        onFightStart({ view }) {
            for (const character of view.characters) playerIds.add(character.id);
        },
        onAction({ result }) {
            if (!result.success) return;
            for (const event of result.events) {
                if (event.type !== "useMove") continue;
                addMoveUsage(playerIds.has(event.actor) ? player : enemy, event.actor, event.move);
            }
        },
        getResult: () => ({ player, enemy }),
    };
}

export function createAccuracyCollector(): MetricCollector<AccuracyMetrics> {
    const playerIds = new Set<string>();
    const player = emptyAccuracyCounts();
    const enemy = emptyAccuracyCounts();
    return {
        id: "accuracy",
        onFightStart({ view }) {
            for (const character of view.characters) playerIds.add(character.id);
        },
        onAction({ result }) {
            if (!result.success) return;
            for (const event of result.events) {
                if (event.type !== "useMove") continue;
                const counts = playerIds.has(event.actor) ? player : enemy;
                for (const target of event.targets) counts[target.result] += 1;
            }
        },
        getResult: () => ({ player: { ...player }, enemy: { ...enemy } }),
    };
}

export function createEscapeCollector(): MetricCollector<EscapeMetrics> {
    let attempts = 0;
    let successes = 0;
    let assistAttempts = 0;
    let assistSuccesses = 0;
    const byActor: Record<string, { attempts: number; successes: number }> = {};
    return {
        id: "escapes",
        onAction({ action, result }) {
            if (action.type !== "escape") return;
            attempts += 1;
            const actor = byActor[action.actor] ??= { attempts: 0, successes: 0 };
            actor.attempts += 1;
            const assist = action.actor !== action.target;
            if (assist) assistAttempts += 1;
            if (!result.success || !hasSuccessfulEscape(result.events, action.target, action.binding)) {
                return;
            }
            successes += 1;
            actor.successes += 1;
            if (assist) assistSuccesses += 1;
        },
        getResult: () => ({
            attempts,
            successes,
            assists: { attempts: assistAttempts, successes: assistSuccesses },
            byActor: structuredClone(byActor),
        }),
    };
}

export function createTrapCollector(): MetricCollector<TrapMetrics> {
    const tracks = new Map<string, TrapTrackMetrics>();
    const totals = emptyTrapEventTotals();
    const observe = (view: GameView): void => {
        const current = new Map(view.traps.map((trap) => [trap.id, trap.amount]));
        for (const trap of view.traps) {
            const track = getTrapTrack(tracks, trap.id);
            track.finalAmount = trap.amount;
            track.peakAmount = Math.max(track.peakAmount, trap.amount);
        }
        for (const [id, track] of tracks) {
            if (!current.has(id)) track.finalAmount = 0;
        }
    };
    return {
        id: "traps",
        onFightStart: ({ view }) => observe(view),
        onAction({ result }) {
            if (!result.success) return;
            for (const event of leafEvents(result.events)) {
                if (event.type !== "trapAdded" && event.type !== "trapRemoved"
                    && event.type !== "trapTriggered") continue;
                const track = getTrapTrack(tracks, event.trap);
                if (event.type === "trapAdded") {
                    track.added += 1;
                    track.addedAmount += event.amount;
                    totals.added += 1;
                    totals.addedAmount += event.amount;
                } else if (event.type === "trapRemoved") {
                    track.removed += 1;
                    track.removedAmount += event.amount;
                    totals.removed += 1;
                    totals.removedAmount += event.amount;
                } else {
                    track.triggered += 1;
                    track.triggeredAmount += event.amount;
                    totals.triggered += 1;
                    totals.triggeredAmount += event.amount;
                }
            }
            observe(result.view);
        },
        onFightEnd: ({ view }) => observe(view),
        getResult: () => ({ totals: { ...totals }, tracks: Object.fromEntries(tracks) }),
    };
}

export function createIncapacitationCollector(): MetricCollector<IncapacitationMetrics> {
    const incapacitated = new Set<string>();
    const characters: IncapacitationMetrics["characters"] = {};
    let occurrences = 0;
    let first: IncapacitationPoint | null = null;

    const observe = (view: GameView, action: number): void => {
        const current = new Set(
            view.characters.filter(isIncapacitated).map((character) => character.id),
        );
        for (const character of view.characters) {
            if (!current.has(character.id) || incapacitated.has(character.id)) continue;
            occurrences += 1;
            const point = { action, round: view.turn.round };
            const existing = characters[character.id];
            characters[character.id] = existing
                ? { ...existing, occurrences: existing.occurrences + 1 }
                : { occurrences: 1, first: point };
            first ??= { ...point, character: character.id };
        }
        incapacitated.clear();
        for (const id of current) incapacitated.add(id);
    };

    return {
        id: "incapacitations",
        onFightStart: ({ view }) => observe(view, 0),
        onAction: ({ actionIndex, result }) => {
            if (result.success) observe(result.view, actionIndex);
        },
        onFightEnd: ({ actionCount, view }) => observe(view, actionCount),
        getResult: () => ({
            occurrences,
            first,
            characters: structuredClone(characters),
            captures: null,
        }),
    };
}

export function createLimitationsCollector(): MetricCollector<MetricLimitations> {
    return {
        id: "limitations",
        getResult: () => ({ ...metricLimitations }),
    };
}

function getOrCreate<Key, Value>(
    map: Map<Key, Value>,
    key: Key,
    create: () => Value,
): Value {
    const existing = map.get(key);
    if (existing !== undefined) return existing;
    const value = create();
    map.set(key, value);
    return value;
}

function increment(record: Record<string, number>, key: string, amount = 1): void {
    record[key] = (record[key] ?? 0) + amount;
}

function emptySideMoveUsage(): SideMoveUsageMetrics {
    return { total: 0, byMove: {}, byActor: {} };
}

function addMoveUsage(metrics: SideMoveUsageMetrics, actor: string, move: string): void {
    metrics.total += 1;
    increment(metrics.byMove, move);
    const actorMoves = metrics.byActor[actor] ??= {};
    increment(actorMoves, move);
}

function emptyAccuracyCounts(): AccuracyCounts {
    return { miss: 0, graze: 0, hit: 0, crit: 0, none: 0 };
}

function hasSuccessfulEscape(events: readonly GameEvent[], target: string, binding: string): boolean {
    return leafEvents(events).some((event) =>
        (event.type === "bondageChanged" || event.type === "bondageRemoved")
        && event.target === target
        && event.binding === binding
        && event.amount < 0,
    );
}

function emptyTrapEventTotals(): TrapMetrics["totals"] {
    return {
        added: 0,
        removed: 0,
        triggered: 0,
        addedAmount: 0,
        removedAmount: 0,
        triggeredAmount: 0,
    };
}

function getTrapTrack(tracks: Map<string, TrapTrackMetrics>, id: string): TrapTrackMetrics {
    return getOrCreate(tracks, id, () => ({
        ...emptyTrapEventTotals(),
        finalAmount: 0,
        peakAmount: 0,
    }));
}

function isIncapacitated(character: Character): boolean {
    return character.bindings.some((binding) =>
        binding.status.some((status) => status.id === "incapacitated" && status.value > 0),
    ) || character.buffs.some((buff) =>
        buff.statuses?.some((status) => status.id === "incapacitated" && status.value > 0),
    );
}
