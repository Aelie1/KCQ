import type { BindingEndpoint, BuffParticipant, GameLogPresentationEntry, LogOutcome, StanceOutcome } from "../../../presentation/gameLog";
import type { Presentation } from "../../../presentation/presentation";
import { playerTone, type PlayerTone } from "./linkedEntities";
import { formatSignedNumber } from "./presentationHelpers";

export interface GameLogValue {
    text: string;
    tone?: string;
}
export interface GameLogRow {
    kind: LogOutcome["kind"];
    target?: string;
    label?: string;
    values: GameLogValue[];
}
export interface GameLogViewModelEntry {
    kind: GameLogPresentationEntry["kind"];
    actorId?: string;
    actor?: string;
    actorTone?: PlayerTone;
    title?: string;
    target?: string;
    phase?: string;
    rows: GameLogRow[];
}

/** Formatting only: event grouping and historical endpoints come from Pass 1. */
export function createGameLogViewModel(
    entries: readonly GameLogPresentationEntry[], p: Presentation,
): GameLogViewModelEntry[] {
    const transition = (initial: string, final: string) => p.ui("gameLog.transition", { initial, final });
    const numeric = (initial?: number, final?: number): string | undefined =>
        initial !== undefined && final !== undefined ? transition(String(initial), String(final))
            : initial !== undefined ? p.ui("gameLog.from", { value: initial })
                : final !== undefined ? p.ui("gameLog.to", { value: final }) : undefined;
    const bindingValue = (endpoint: BindingEndpoint) => endpoint.level
        ? p.ui("gameLog.bindingEndpoint", { value: endpoint.value, level: p.bindingLevel(endpoint.level) })
        : String(endpoint.value);
    const buffChange = ({ initial, final }: BuffParticipant): string => {
        const before = initial.details?.severity;
        const after = final.details?.severity;
        if (!initial.present && final.present) return [p.ui("gameLog.added"), after !== undefined ? p.buffSeverity(after) : undefined].filter(Boolean).join(" · ");
        if (initial.present && !final.present) return [p.ui("gameLog.removed"), before !== undefined ? p.buffSeverity(before) : undefined].filter(Boolean).join(" · ");
        if (before !== undefined && after !== undefined) return before === after
            ? [p.ui("gameLog.updated"), p.buffSeverity(after)].join(" · ")
            : transition(p.buffSeverity(before), p.buffSeverity(after));
        if (before !== undefined) return p.ui("gameLog.from", { value: p.buffSeverity(before) });
        if (after !== undefined) return p.ui("gameLog.to", { value: p.buffSeverity(after) });
        return p.ui("gameLog.updated");
    };
    const stanceRow = (change: StanceOutcome): GameLogRow => ({
        kind: "stance", target: p.entity(change.actor), values: [{ text: change.initial
            ? transition(p.stance(change.initial), p.stance(change.final)) : p.stance(change.final) }],
    });
    const row = (outcome: LogOutcome): GameLogRow => {
        switch (outcome.kind) {
            case "damage": return {
                kind: outcome.kind, target: p.entity(outcome.target), values: outcome.hits.flatMap(hit => {
                    const values: GameLogValue[] = [];
                    if (hit.result !== "none") values.push({ text: hit.damage
                        ? p.ui("gameLog.hitDamage", { band: p.hitBand(hit.result), amount: hit.damage })
                        : p.hitBand(hit.result), tone: hit.result });
                    else if (hit.damage) values.push({ text: p.ui("targeting.damageAmount", { amount: hit.damage }), tone: "hit" });
                    if (hit.healing) values.push({ text: p.ui("gameLog.healed", { amount: hit.healing }), tone: "success" });
                    if (hit.blocked) values.push({ text: p.ui("gameLog.blocked", { amount: hit.blocked }), tone: "muted" });
                    return values;
                }),
            };
            case "binding": {
                const text = outcome.initial && outcome.final
                    ? transition(bindingValue(outcome.initial), bindingValue(outcome.final))
                    : formatSignedNumber(outcome.change);
                return { kind: outcome.kind, target: p.entity(outcome.target), label: p.binding(outcome.binding),
                    values: [{ text, tone: outcome.final?.level ? "binding-" + outcome.final.level : undefined },
                        ...(outcome.blocked ? [{ text: p.ui("gameLog.blocked", { amount: outcome.blocked }), tone: "muted" }] : [])] };
            }
            case "buff": {
                const names = outcome.participants.map(participant => p.entity(participant.target));
                const changes = outcome.participants.map(buffChange);
                const shared = changes.every(change => change === changes[0]);
                return { kind: outcome.kind,
                    target: names.length ? names.reduce((first, second) => p.ui("gameLog.linkedTargets", { first, second })) : undefined,
                    label: p.buff(outcome.buff, undefined), values: shared
                        ? (changes.length ? [{ text: changes[0], tone: "special" }] : [])
                        : changes.map((change, index) => ({ text: p.ui("gameLog.participantChange", { target: names[index], change }), tone: "special" })),
                };
            }
            case "resource": {
                const endpoints = numeric(outcome.initial, outcome.final);
                return { kind: outcome.kind, target: p.entity(outcome.target), label: p.data(outcome.resource),
                    values: [{ text: formatSignedNumber(outcome.change) },
                        ...(endpoints ? [{ text: endpoints, tone: "muted" }] : [])] };
            }
            case "stance": return stanceRow(outcome);
            case "trap": {
                const endpoints = numeric(outcome.initial, outcome.final);
                return { kind: outcome.kind, label: p.trap(outcome.trap), values: [
                    ...(endpoints ? [{ text: endpoints }] : outcome.change !== undefined ? [{ text: formatSignedNumber(outcome.change) }] : []),
                    ...outcome.triggers.map(trigger => ({ text: p.ui("gameLog.trapTriggered", { actor: p.entity(trigger.actor), amount: trigger.amount }), tone: "warning" })),
                ] };
            }
            case "enemy": return { kind: outcome.kind, target: p.entity(outcome.target),
                values: [{ text: p.ui(outcome.operation === "spawned" ? "gameLog.spawned" : "gameLog.defeated"), tone: "warning" }] };
            case "interrupt": return { kind: outcome.kind, target: p.entity(outcome.actor),
                values: [{ text: p.ui("gameLog.interrupted", { reason: p.failure(outcome.reason) }), tone: "warning" }] };
            case "refresh": return { kind: outcome.kind, target: p.entity(outcome.target),
                values: [{ text: p.ui("gameLog.refreshed"), tone: "success" }] };
            case "retarget": return { kind: outcome.kind, target: p.entity(outcome.target),
                values: [{ text: p.ui("gameLog.retargeted", { destination: p.entity(outcome.destination) }) }] };
            case "intention": return { kind: outcome.kind, target: p.entity(outcome.target),
                values: [{ text: p.ui(outcome.operation === "cancelled" ? "gameLog.cancelled" : "gameLog.weakened") }] };
        }
    };
    return entries.map(entry => {
        const model: GameLogViewModelEntry = { kind: entry.kind, rows: entry.outcomes.map(row) };
        switch (entry.kind) {
            case "move":
            case "escape":
                model.actorId = entry.actor;
                model.actor = p.entity(entry.actor);
                model.actorTone = playerTone(entry.actor);
                model.title = entry.kind === "move" ? p.move(entry.move) : p.ui("characterDetails.escape");
                if (entry.kind === "escape") model.target = p.entity(entry.target);
                break;
            case "phase":
                model.phase = entry.phase;
                model.title = [entry.round !== undefined ? p.ui("battleOverview.round", { round: entry.round }) : undefined,
                    p.ui("battleOverview.phase", { phase: p.phase(entry.phase) })].filter(Boolean).join(" · ");
                break;
            case "stance": model.rows.unshift(...entry.changes.map(stanceRow)); break;
            case "encounter":
            case "character": model.title = p.event({ type: entry.kind === "encounter" ? "loadEncounter" : "loadCharacter",
                id: entry.id, success: entry.success, bindings: [], effects: [] }); break;
        }
        return model;
    });
}
