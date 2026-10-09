import type {
    BindingId, BindingLevel, Buff, BuffId, EntityId, EventFrame, FailureReason,
    GameEvent, GameState, HitBand, LeafEvent, MoveId, Phase, StanceId, TrapId,
} from "../../engine/public/types";

/** Semantic IDs are localized by Presentation at render time. No preview mechanics run here. */
export interface LogHit {
    result: HitBand;
    damage: number;
    healing: number;
    blocked: number;
}
export interface DamageOutcome {
    kind: "damage";
    target: EntityId;
    /** One item per resolved target result, including misses and non-damaging hits. */
    hits: LogHit[];
    damage: number;
    healing: number;
    blocked: number;
}
export interface BindingEndpoint { value: number; level?: BindingLevel }
export interface BindingOutcome {
    kind: "binding"; target: EntityId; binding: BindingId;
    change: number; blocked: number;
    initial?: BindingEndpoint; final?: BindingEndpoint;
}
/** Missing details means presence is known from leaves, but the buff payload is unavailable. */
export interface BuffEndpoint { present: boolean; details?: Buff }
export interface BuffParticipant {
    target: EntityId; initial: BuffEndpoint; final: BuffEndpoint;
}
export interface BuffOutcome {
    kind: "buff"; buff: BuffId;
    /** A reciprocal linked buff has one row with both participants' distinct payloads. */
    participants: BuffParticipant[];
}
export interface StanceOutcome { kind: "stance"; actor: EntityId; initial?: StanceId; final: StanceId }
export interface TrapOutcome {
    kind: "trap"; trap: TrapId;
    change?: number; initial?: number; final?: number;
    /** Trigger consumption is separate from adjustment leaves; frames supply net change. */
    triggers: { actor: EntityId; amount: number }[];
}
export interface ResourceOutcome {
    kind: "resource"; target: EntityId; resource: string;
    /** Sum of emitted applied deltas; silent changes can make this differ from final - initial. */
    change: number; initial?: number; final?: number; max?: number;
}
export type LogOutcome = ResourceOutcome | DamageOutcome | BindingOutcome | BuffOutcome | StanceOutcome | TrapOutcome
    | { kind: "enemy"; target: EntityId; operation: "spawned" | "defeated" }
    | { kind: "interrupt"; actor: EntityId; reason: FailureReason }
    | { kind: "refresh"; target: EntityId }
    | { kind: "retarget"; target: EntityId; destination: EntityId }
    | { kind: "intention"; target: EntityId; move: MoveId; operation: "cancelled" | "weakened" };

export type GameLogPresentationEntry =
    | { kind: "move"; actor: EntityId; move: MoveId; outcomes: LogOutcome[] }
    | { kind: "escape"; actor: EntityId; target: EntityId; outcomes: LogOutcome[] }
    | { kind: "phase"; phase: Phase; round?: number; outcomes: LogOutcome[] }
    | { kind: "stance"; changes: StanceOutcome[]; outcomes: LogOutcome[] }
    | { kind: "encounter" | "character"; id: string; success: boolean; outcomes: LogOutcome[] };

const entity = (state: GameState | undefined, id: EntityId) =>
    state?.characters.find((character) => character.id === id)
    ?? state?.enemies.find((enemy) => enemy.id === id);
const stance = (state: GameState | undefined, id: EntityId): StanceId | undefined => {
    const character = state?.characters.find((candidate) => candidate.id === id);
    return character ? character.standing ? "standing" : "moving" : undefined;
};
function bindingEndpoint(state: GameState | undefined, target: EntityId, id: BindingId): BindingEndpoint | undefined {
    const character = state?.characters.find((candidate) => candidate.id === target);
    if (!character) return undefined;
    const binding = character.bindings.find((candidate) => candidate.id === id);
    return binding ? { value: binding.value, level: binding.level } : { value: 0, level: "none" };
}
type RecordedBuffs = Map<EntityId, Map<BuffId, Buff>>;
const recordedBuff = (state: GameState | undefined, recorded: RecordedBuffs, target: EntityId, id: BuffId) =>
    entity(state, target)?.buffs.find((buff) => buff.id === id) ?? recorded.get(target)?.get(id);

function buffEndpoint(state: GameState | undefined, target: EntityId, id: BuffId, present: boolean, recorded: RecordedBuffs): BuffEndpoint {
    if (!state) return { present };
    const buff = recordedBuff(state, recorded, target, id);
    // Public snapshots omit inactive buffs. Leaves still establish their presence.
    return buff ? { present: true, details: structuredClone(buff) } : { present };
}
function linkedTarget(before: GameState | undefined, after: GameState | undefined, target: EntityId, id: BuffId, recorded: RecordedBuffs) {
    for (const state of [after, before]) {
        const linked = recordedBuff(state, recorded, target, id)?.linkedEntity;
        if (linked && recordedBuff(state, recorded, linked, id)?.linkedEntity === target) return linked;
    }
    return undefined;
}

function aggregateOutcomes(event: GameEvent, before?: GameState, after?: GameState, recorded: RecordedBuffs = new Map()): LogOutcome[] {
    const outcomes: LogOutcome[] = [];
    const damageGroup = (target: EntityId): DamageOutcome => {
        let group = outcomes.find((outcome): outcome is DamageOutcome => outcome.kind === "damage" && outcome.target === target);
        if (!group) {
            group = { kind: "damage", target, hits: [], damage: 0, healing: 0, blocked: 0 };
            outcomes.push(group);
        }
        return group;
    };
    const consume = (effect: LeafEvent, hit?: { target: EntityId; value: LogHit }): void => {
        switch (effect.type) {
            case "enemyDamaged":
            case "enemyHealed":
            case "damageBlocked": {
                const group = damageGroup(effect.target);
                const field = effect.type === "enemyDamaged" ? "damage" : effect.type === "enemyHealed" ? "healing" : "blocked";
                group[field] += effect.amount;
                if (hit?.target === effect.target) hit.value[field] += effect.amount;
                else group.hits.push({ result: "none", damage: 0, healing: 0, blocked: 0, [field]: effect.amount });
                break;
            }
            case "bondageAdded":
            case "bondageChanged":
            case "bondageRemoved":
            case "bondageBlocked": {
                let group = outcomes.find((outcome): outcome is BindingOutcome => outcome.kind === "binding"
                    && outcome.target === effect.target && outcome.binding === effect.binding);
                if (!group) {
                    group = { kind: "binding", target: effect.target, binding: effect.binding, change: 0, blocked: 0,
                        initial: bindingEndpoint(before, effect.target, effect.binding),
                        final: bindingEndpoint(after, effect.target, effect.binding) };
                    outcomes.push(group);
                }
                if (effect.type === "bondageBlocked") group.blocked += effect.amount;
                else {
                    if (!group.initial && effect.type === "bondageAdded" && group.change === 0) group.initial = { value: 0, level: "none" };
                    group.change += effect.amount;
                    if (!after) {
                        if (!group.initial && effect.type === "bondageRemoved") group.initial = { value: -group.change };
                        if (group.initial) group.final = effect.type === "bondageRemoved"
                            ? { value: 0, level: "none" } : { value: group.initial.value + group.change };
                    }
                }
                break;
            }
            case "buffAdded":
            case "buffUpdated":
            case "buffRemoved": {
                const linked = linkedTarget(before, after, effect.target, effect.buff, recorded);
                let group = outcomes.find((outcome): outcome is BuffOutcome => outcome.kind === "buff"
                    && outcome.buff === effect.buff && outcome.participants.some(({ target }) => target === effect.target));
                if (!group) {
                    group = { kind: "buff", buff: effect.buff, participants: [] };
                    for (const target of linked ? [effect.target, linked] : [effect.target]) {
                        group.participants.push({ target,
                            initial: buffEndpoint(before, target, effect.buff, effect.type !== "buffAdded", new Map()),
                            final: buffEndpoint(after, target, effect.buff, effect.type !== "buffRemoved", recorded) });
                    }
                    outcomes.push(group);
                }
                const participant = group.participants.find(({ target }) => target === effect.target)!;
                if (effect.type === "buffRemoved") participant.final = { present: false };
                else if (!participant.final.present) participant.final = { present: true };
                break;
            }
            case "dataChanged": {
                let group = outcomes.find((outcome): outcome is ResourceOutcome => outcome.kind === "resource"
                    && outcome.target === effect.target && outcome.resource === effect.name);
                if (!group) {
                    const initial = before?.characters.find(({ id }) => id === effect.target)?.data;
                    const final = after?.characters.find(({ id }) => id === effect.target)?.data;
                    group = { kind: "resource", target: effect.target, resource: effect.name, change: 0,
                        initial: initial?.[effect.name], final: final?.[effect.name],
                        max: effect.name === "subspace" ? (final ?? initial)?.subspaceMax : undefined };
                    outcomes.push(group);
                }
                group.change += effect.amount;
                break;
            }
            case "stanceSet": {
                let group = outcomes.find((outcome): outcome is StanceOutcome => outcome.kind === "stance" && outcome.actor === effect.actor);
                if (group) group.final = effect.stance;
                else outcomes.push({ kind: "stance", actor: effect.actor, initial: stance(before, effect.actor), final: effect.stance });
                break;
            }
            case "trapAdded":
            case "trapRemoved":
            case "trapTriggered": {
                let group = outcomes.find((outcome): outcome is TrapOutcome => outcome.kind === "trap" && outcome.trap === effect.trap);
                if (!group) {
                    group = { kind: "trap", trap: effect.trap, change: 0, triggers: [],
                        initial: before ? before.traps.find(({ id }) => id === effect.trap)?.amount ?? 0 : undefined,
                        final: after ? after.traps.find(({ id }) => id === effect.trap)?.amount ?? 0 : undefined };
                    outcomes.push(group);
                }
                if (effect.type === "trapTriggered") {
                    group.triggers.push({ actor: effect.actor, amount: effect.amount });
                    group.change = undefined;
                } else if (group.change !== undefined) group.change += effect.type === "trapRemoved" ? -effect.amount : effect.amount;
                break;
            }
            case "enemySpawned":
            case "enemyDefeated": outcomes.push({ kind: "enemy", target: effect.target, operation: effect.type === "enemySpawned" ? "spawned" : "defeated" }); break;
            case "actionInterrupted": outcomes.push({ kind: "interrupt", actor: effect.actor, reason: effect.reason }); break;
            case "actionRefreshed": outcomes.push({ kind: "refresh", target: effect.target }); break;
            case "targetChanged": {
                const previous = outcomes.find((outcome) => outcome.kind === "retarget" && outcome.target === effect.target);
                if (previous?.kind === "retarget") previous.destination = effect.destination;
                else outcomes.push({ kind: "retarget", target: effect.target, destination: effect.destination });
                break;
            }
            case "intentionCancelled":
            case "intentionWeakened": outcomes.push({ kind: "intention", target: effect.target, move: effect.move, operation: effect.type === "intentionCancelled" ? "cancelled" : "weakened" }); break;
            case "cooldownChanged": break; // bookkeeping, not an action outcome
        }
    };
    if (event.type === "useMove") {
        const defeated = new Set<EntityId>();
        for (const target of event.targets) {
            // Effects are rejected by the engine once the entity has been removed.
            // Misses are separately recorded accuracy results and remain useful.
            if (defeated.has(target.target) && target.result !== "miss" && target.effects.length === 0) continue;
            const hit: LogHit = { result: target.result, damage: 0, healing: 0, blocked: 0 };
            // Accuracy remains useful even when a binding/buff attack has no HP damage.
            if (target.result !== "none" || target.effects.some((effect) =>
                (effect.type === "enemyDamaged" || effect.type === "enemyHealed" || effect.type === "damageBlocked") && effect.target === target.target)) {
                damageGroup(target.target).hits.push(hit);
            }
            for (const effect of target.effects) {
                consume(effect, { target: target.target, value: hit });
                if (effect.type === "enemyDefeated") defeated.add(effect.target);
                if (effect.type === "enemySpawned") defeated.delete(effect.target);
            }
        }
    }
    for (const effect of event.effects) consume(effect);
    for (const outcome of outcomes) {
        if (outcome.kind === "binding") {
            // Leaf amounts are resolved deltas, so a known endpoint establishes the other value.
            if (!outcome.initial && outcome.final) outcome.initial = { value: outcome.final.value - outcome.change };
            if (!outcome.final && outcome.initial) outcome.final = { value: outcome.initial.value + outcome.change };
        }
        if (outcome.kind === "trap" && outcome.initial !== undefined && outcome.final !== undefined) {
            outcome.change = outcome.final - outcome.initial;
        }
    }
    return outcomes.filter((outcome) => outcome.kind !== "stance" || outcome.initial !== outcome.final);
}

/** Inactive buffs first appear after activation. Recover only the first recorded
 * payload before another leaf changes that buff; bare events break this evidence chain. */
function delayedBuffPayloads(input: readonly (GameEvent | EventFrame)[]): RecordedBuffs[] {
    const result: RecordedBuffs[] = input.map(() => new Map());
    const next: RecordedBuffs = new Map();
    for (let index = input.length - 1; index >= 0; index--) {
        const item = input[index]!;
        if (!("event" in item)) { next.clear(); continue; }
        const { event, state } = item;
        const ids = new Set([...state.characters, ...state.enemies].map(({ id }) => id));
        for (const id of next.keys()) if (!ids.has(id)) next.delete(id);
        for (const entity of [...state.characters, ...state.enemies]) {
            const buffs = next.get(entity.id) ?? new Map<BuffId, Buff>();
            for (const buff of entity.buffs) buffs.set(buff.id, buff);
            next.set(entity.id, buffs);
        }
        const leaves = [...(event.type === "useMove" ? event.targets.flatMap(target => target.effects) : []), ...event.effects];
        for (const effect of leaves) {
            if (effect.type !== "buffAdded" && effect.type !== "buffUpdated" && effect.type !== "buffRemoved") continue;
            const buff = next.get(effect.target)?.get(effect.buff);
            if (effect.type !== "buffRemoved" && buff) {
                const buffs = result[index]!.get(effect.target) ?? new Map<BuffId, Buff>();
                buffs.set(effect.buff, buff);
                result[index]!.set(effect.target, buffs);
            }
        }
        // Invalidate only after collecting all participants of reciprocal changes.
        for (const effect of leaves) {
            if (effect.type === "buffAdded" || effect.type === "buffUpdated" || effect.type === "buffRemoved") {
                next.get(effect.target)?.delete(effect.buff);
            }
        }
    }
    return result;
}

/**
 * Frames hold post-event snapshots; initialState is the snapshot before the first event.
 * Bare events are supported with unknown endpoints, never fabricated buff levels or links.
 * A bare event breaks the snapshot chain; the next frame restores it for following events.
 */
export function createGameLogEntries(
    input: readonly (GameEvent | EventFrame)[], initialState?: GameState,
): GameLogPresentationEntry[] {
    const entries: GameLogPresentationEntry[] = [];
    let before = initialState;
    let pendingStance: Extract<GameLogPresentationEntry, { kind: "stance" }> | undefined;
    const flushStance = () => {
        if (pendingStance) {
            pendingStance.changes = pendingStance.changes.filter((change) => change.initial !== change.final);
            if (pendingStance.changes.length) entries.push(pendingStance);
            pendingStance = undefined;
        }
    };
    const recorded = delayedBuffPayloads(input);
    for (const [index, item] of input.entries()) {
        const event = "event" in item ? item.event : item;
        const after = "event" in item ? item.state : undefined;
        const outcomes = aggregateOutcomes(event, before, after, recorded[index]);
        // Only stance-only neighbors can merge. Other gameplay outcomes keep their event boundary.
        if (event.type === "changeStance" && outcomes.every((outcome) => outcome.kind === "stance")) {
            pendingStance ??= { kind: "stance", changes: [], outcomes: [] };
            for (const outcome of outcomes) {
                if (outcome.kind !== "stance") continue;
                const previous = pendingStance.changes.find(({ actor }) => actor === outcome.actor);
                if (previous) previous.final = outcome.final;
                else pendingStance.changes.push(outcome);
            }
        } else {
            flushStance();
            switch (event.type) {
                case "useMove": entries.push({ kind: "move", actor: event.actor, move: event.move, outcomes }); break;
                case "useEscape": entries.push({ kind: "escape", actor: event.actor, target: event.target, outcomes }); break;
                case "changePhase": entries.push({ kind: "phase", phase: event.phase, round: after?.turn.round, outcomes }); break;
                case "changeStance": entries.push({ kind: "stance", changes: outcomes.filter((outcome): outcome is StanceOutcome => outcome.kind === "stance"),
                    outcomes: outcomes.filter((outcome) => outcome.kind !== "stance") }); break;
                case "loadEncounter":
                case "loadCharacter":
                    if (!event.success || outcomes.length) entries.push({ kind: event.type === "loadEncounter" ? "encounter" : "character",
                        id: event.id, success: event.success, outcomes });
                    break;
            }
        }
        before = after;
    }
    flushStance();
    return entries;
}
