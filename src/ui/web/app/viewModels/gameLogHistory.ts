import type { Buff, EventFrame, GameEvent, GameState } from "../../../../engine/public/types";
import {
    aggregateGameLogOutcomes, gameLogContext, gameLogEntry,
    type GameLogContext, type GameLogPresentationEntry, type LogOutcome,
} from "../../../presentation/gameLog";

interface BuffReference { target: string; buff: string }
interface PendingBuffEntry {
    index: number;
    event: GameEvent;
    before: GameLogContext;
    after: GameLogContext;
    waiting: BuffReference[];
    recorded: { target: string; buff: Buff }[];
}

export interface GameLogSaveState {
    entries: GameLogPresentationEntry[];
    previous: GameLogContext;
    /** The last entry retains even cancelled changes until this stance run ends. */
    mergingStance: boolean;
    /** Only unresolved buff mutations need a recipe for later payload evidence.
     * Endpoints here are restricted to the event's effects, not historical game snapshots. */
    pendingBuffs: PendingBuffEntry[];
}

const effects = (event: GameEvent) => [
    ...(event.type === "useMove" ? event.targets.flatMap(target => target.effects) : []), ...event.effects,
];
const mutations = (event: GameEvent): BuffReference[] => effects(event).flatMap(effect =>
    effect.type === "buffAdded" || effect.type === "buffUpdated" || effect.type === "buffRemoved"
        ? [{ target: effect.target, buff: effect.buff }] : []);
const sameBuff = (a: BuffReference, b: BuffReference) => a.target === b.target && a.buff === b.buff;

/** Incremental semantic history. No accumulated EventFrame[] or localized text. */
export function createGameLogHistory(initialState: GameState, saved?: GameLogSaveState) {
    const history: GameLogSaveState = saved ? structuredClone(saved) : {
        entries: [], previous: gameLogContext(initialState), mergingStance: false, pendingBuffs: [],
    };

    if (saved) {
        // Older logs have no roster metadata. Recover each action's roster by
        // walking recorded spawns/defeats backward from the restored battle.
        const living = new Set(initialState.enemies.filter(enemy => enemy.currHp > 0).map(enemy => enemy.id));
        history.previous.livingEnemies ??= [...living];
        const undo = (outcomes: readonly LogOutcome[]) => {
            for (const outcome of [...outcomes].reverse()) {
                if (outcome.kind === "bindingTick") undo(outcome.outcomes);
                if (outcome.kind === "enemy") {
                    if (outcome.operation === "defeated") living.add(outcome.target);
                    else living.delete(outcome.target);
                }
            }
        };
        const pendingByIndex = new Map(history.pendingBuffs.map(pending => [pending.index, pending]));
        for (let index = history.entries.length - 1; index >= 0; index--) {
            const entry = history.entries[index]!;
            const pending = pendingByIndex.get(index);
            if (pending) pending.after.livingEnemies ??= [...living];
            undo(entry.outcomes);
            if (entry.kind === "move" && living.size) entry.livingEnemies ??= [...living];
            if (pending) pending.before.livingEnemies ??= [...living];
        }
    }

    const finishStance = () => {
        const last = history.entries.at(-1);
        if (history.mergingStance && last?.kind === "stance") {
            last.changes = last.changes.filter(change => change.initial !== change.final);
            if (!last.changes.length) history.entries.pop();
        }
        history.mergingStance = false;
    };

    return {
        record(nextFrames: readonly EventFrame[]): GameLogPresentationEntry[] {
            for (const { event, state } of nextFrames) {
                const changed = mutations(event);
                const entities = [...state.characters, ...state.enemies];
                for (const pending of history.pendingBuffs) {
                    const knownPayloads = pending.recorded.length;
                    pending.waiting = pending.waiting.filter(ref => {
                        const entity = entities.find(entity => entity.id === ref.target);
                        // Another mutation or despawn breaks the future-evidence chain.
                        if (!entity || changed.some(change => sameBuff(change, ref))) return false;
                        const buff = entity.buffs.find(buff => buff.id === ref.buff);
                        if (!buff) return true;
                        pending.recorded.push({ target: ref.target, buff: structuredClone(buff) });
                        return false;
                    });
                    if (pending.recorded.length === knownPayloads) continue;
                    const recorded = new Map<string, Map<string, Buff>>();
                    for (const { target, buff } of pending.recorded) {
                        if (!recorded.has(target)) recorded.set(target, new Map());
                        recorded.get(target)!.set(buff.id, buff);
                    }
                    history.entries[pending.index] = gameLogEntry(pending.event,
                        aggregateGameLogOutcomes(pending.event, pending.before, pending.after, recorded), pending.after.turn.round, pending.before)!;
                }
                history.pendingBuffs = history.pendingBuffs.filter(pending => pending.waiting.length > 0);

                const after = gameLogContext(state);
                const outcomes = aggregateGameLogOutcomes(event, history.previous, after);
                if (event.type === "changeStance" && outcomes.every(outcome => outcome.kind === "stance")) {
                    if (!history.mergingStance) history.entries.push({ kind: "stance", changes: [], outcomes: [] });
                    history.mergingStance = true;
                    const entry = history.entries.at(-1)!;
                    if (entry.kind === "stance") for (const outcome of outcomes) {
                        if (outcome.kind !== "stance") continue;
                        const previous = entry.changes.find(change => change.actor === outcome.actor);
                        if (previous) previous.final = outcome.final;
                        else entry.changes.push(outcome);
                    }
                } else {
                    finishStance();
                    const entry = gameLogEntry(event, outcomes, after.turn.round, history.previous);
                    if (entry) {
                        const index = history.entries.push(entry) - 1;
                        const waiting = changed.filter((ref, index) => !changed.slice(0, index).some(other => sameBuff(ref, other))
                            && effects(event).some(effect => (effect.type === "buffAdded" || effect.type === "buffUpdated")
                                && effect.target === ref.target && effect.buff === ref.buff)
                            && entities.some(entity => entity.id === ref.target && !entity.buffs.some(buff => buff.id === ref.buff)));
                        if (waiting.length) history.pendingBuffs.push({
                            index, event: structuredClone(event), before: gameLogContext(history.previous, event),
                            after: gameLogContext(after, event), waiting, recorded: [],
                        });
                    }
                }
                history.previous = after;
            }
            const visible = structuredClone(history.entries);
            for (const entry of visible) if (entry.kind === "stance") {
                entry.changes = entry.changes.filter(change => change.initial !== change.final);
            }
            return visible.filter(entry => entry.kind !== "stance" || entry.changes.length || entry.outcomes.length);
        },
        getSaveState(): GameLogSaveState {
            return structuredClone(history);
        },
    };
}
