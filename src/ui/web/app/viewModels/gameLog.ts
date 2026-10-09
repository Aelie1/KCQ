import type { BindingEndpoint, BuffOutcome, BuffParticipant, GameLogPresentationEntry, LogOutcome, StanceOutcome } from "../../../presentation/gameLog";
import type { Presentation, UiLabel } from "../../../presentation/presentation";
import { playerTone, type PlayerTone } from "./linkedEntities";
import { formatSignedNumber } from "./presentationHelpers";

export interface GameLogText {
    text: string;
    tone?: string;
}
export interface GameLogValue extends GameLogText {
    /** Localized phrase parts retain semantic colors even when a locale reorders them. */
    parts?: GameLogText[];
    /** Compact binding transitions use the shared wrapping flow. */
    binding?: true;
}
export interface GameLogRow {
    kind: LogOutcome["kind"];
    target?: string;
    targetParts?: GameLogText[];
    label?: string;
    emphasis?: "defeat" | "incapacitated" | "rescued";
    values: GameLogValue[];
    /** Activation consequences retain the same row styling inside their causal group. */
    rows?: GameLogRow[];
}
export interface GameLogViewModelEntry {
    kind: GameLogPresentationEntry["kind"];
    actorId?: string;
    actor?: string;
    actorTone?: PlayerTone;
    title?: string;
    band?: GameLogValue;
    target?: string;
    targetTone?: PlayerTone;
    phase?: string;
    rows: GameLogRow[];
}

/** Compact presentation of Pass 1 outcomes; event boundaries and historical state stay intact. */
export function createGameLogViewModel(
    entries: readonly GameLogPresentationEntry[], p: Presentation, party: readonly string[] = [],
): GameLogViewModelEntry[] {
    const transition = (initial: string, final: string) => p.ui("gameLog.transition", { initial, final });
    const numeric = (initial?: number, final?: number): string | undefined =>
        initial !== undefined && final !== undefined ? transition(String(initial), String(final))
            : initial !== undefined ? p.ui("gameLog.from", { value: initial })
                : final !== undefined ? p.ui("gameLog.to", { value: final }) : undefined;
    const bindingValue = (endpoint: BindingEndpoint) => endpoint.level
        ? p.ui("gameLog.bindingEndpoint", { value: endpoint.value, level: p.bindingLevel(endpoint.level) })
        : String(endpoint.value);
    // Substitute colored slots through Presentation, so complete phrases can be reordered.
    const phrase = (key: UiLabel, slots: Record<string, GameLogText | GameLogValue>): GameLogValue => {
        const args = Object.fromEntries(Object.keys(slots).map(name => [name, "\uE000" + name + "\uE001"]));
        const parts = p.ui(key, args).split(/(\uE000[^\uE001]+\uE001)/).filter(Boolean).flatMap(text => {
            const slot = slots[text.slice(1, -1)];
            return text.startsWith("\uE000") && slot ? ("parts" in slot && slot.parts ? slot.parts : [slot]) : [{ text, tone: "muted" }];
        });
        return { text: parts.map(part => part.text).join(""), parts };
    };
    const name = (id: string): GameLogText => ({ text: p.entity(id), tone: "entity-" + playerTone(id) });
    const targets = (ids: string[], linked = false): GameLogValue => {
        if (!linked && ids.length > 1 && party.length > 0 && ids.length === party.length && party.every(id => ids.includes(id))) {
            return { text: p.ui("gameLog.allies"), parts: [{ text: p.ui("gameLog.allies"), tone: "muted" }] };
        }
        return ids.map(id => ({ ...name(id), parts: [name(id)] })).reduce<GameLogValue>((first, second) =>
            first.text ? phrase(linked ? "gameLog.linkedTargets" : "gameLog.targetList", { first, second }) : second, { text: "" });
    };
    const buffOperation = ({ initial, final }: BuffParticipant) => !initial.present && final.present ? "added"
        : initial.present && !final.present ? "removed"
            : initial.details?.severity === final.details?.severity
                && initial.details?.duration !== undefined && final.details?.duration !== undefined
                && final.details.duration > initial.details.duration ? "buffExtended" : "buffRefreshed";
    const buffChange = (buff: string, participant: BuffParticipant): GameLogValue => {
        const { initial, final } = participant;
        const before = initial.details?.severity;
        const after = final.details?.severity;
        const operation = buffOperation(participant);
        const changed = initial.present && final.present && before !== undefined && after !== undefined && before !== after;
        const severity = operation === "added" ? after : operation === "removed" ? before : after ?? before;
        // Canonical buff localization owns the name + severity phrase, including its order.
        const buffLabel: GameLogText = { text: p.buff(buff, changed ? before : severity), tone: "special" };
        if (changed) return phrase("gameLog.transition", {
            initial: buffLabel, final: { text: p.buffSeverity(after), tone: "special" },
        });
        return phrase("gameLog.buffOutcome", {
            buff: buffLabel,
            operation: { text: p.ui(`gameLog.${operation}`), tone: operation === "added" ? "success" : operation === "removed" ? "warning" : "special" }
        });
    };
    const buffRow = (outcome: BuffOutcome, grouped = false): GameLogRow => {
        const target = targets(outcome.participants.map(participant => participant.target), !grouped && outcome.participants.length > 1);
        const changes = outcome.participants.map(participant => buffChange(outcome.buff, participant));
        const shared = changes.every(change => change.text === changes[0]?.text);
        return {
            kind: "buff", target: target.text, targetParts: target.parts,
            values: shared ? changes.slice(0, 1) : changes.map((change, index) =>
                phrase("gameLog.participantChange", { target: name(outcome.participants[index]!.target), change })),
        };
    };
    const stanceRow = (change: StanceOutcome): GameLogRow => ({
        kind: "stance", target: p.entity(change.actor), targetParts: [name(change.actor)], values: [{
            text: change.initial
                ? transition(p.stance(change.initial), p.stance(change.final)) : p.stance(change.final)
        }],
    });
    const row = (outcome: LogOutcome, compactBinding = false): GameLogRow => {
        switch (outcome.kind) {
            case "bindingTick": {
                const visible = outcome.outcomes.filter(effect => {
                    if (effect.kind === "binding") return effect.change !== 0 || effect.blocked !== 0
                        || effect.initial?.value !== effect.final?.value;
                    if (effect.kind === "resource") return effect.change !== 0 || effect.initial !== effect.final;
                    return true;
                });
                const children = renderOutcomes(visible, undefined, true).filter(child => child.values.length || child.label || child.rows?.length);
                for (const child of children) {
                    if (child.target === p.entity(outcome.target) && child.targetParts?.length === 1) {
                        child.target = undefined;
                        child.targetParts = undefined;
                    }
                }
                return { kind: outcome.kind, target: p.entity(outcome.target),
                    label: p.ui("gameLog.bindingActivation", { binding: p.binding(outcome.binding), activated: p.ui("gameLog.activated") }),
                    values: [], rows: children };
            }
            case "damage": return {
                kind: outcome.kind, target: p.entity(outcome.target), values: outcome.hits.flatMap(hit => {
                    const values: GameLogValue[] = [];
                    if (hit.result !== "none") values.push({
                        text: hit.damage
                            ? p.ui("gameLog.hitDamage", { band: p.hitBand(hit.result), amount: hit.damage })
                            : p.hitBand(hit.result), tone: hit.result
                    });
                    else if (hit.damage) values.push({ text: p.ui("targeting.damageAmount", { amount: hit.damage }), tone: "hit" });
                    if (hit.healing) values.push({ text: p.ui("gameLog.healed", { amount: hit.healing }), tone: "success" });
                    if (hit.blocked) values.push({ text: p.ui("gameLog.blocked", { amount: hit.blocked }), tone: "muted" });
                    return values;
                }),
            };
            case "binding": {
                const value: GameLogValue = outcome.initial && outcome.final
                    ? phrase("gameLog.transition", {
                        initial: { text: compactBinding ? String(outcome.initial.value) : bindingValue(outcome.initial), tone: outcome.initial.level ? "binding-" + outcome.initial.level : undefined },
                        final: { text: compactBinding ? String(outcome.final.value) : bindingValue(outcome.final), tone: outcome.final.level ? "binding-" + outcome.final.level : undefined },
                    }) : { text: formatSignedNumber(outcome.change) };
                const change = phrase("gameLog.bindingOutcome", {
                    binding: { text: p.binding(outcome.binding, compactBinding ? "short" : "name"), tone: "label" }, value,
                });
                const blocked: GameLogValue = { text: p.ui("gameLog.blocked", { amount: outcome.blocked }), tone: "muted" };
                if (compactBinding) {
                    // Keep blocking attached to its zone when the sequence wraps.
                    if (outcome.blocked) {
                        change.parts!.push({ text: " (" + blocked.text + ")", tone: blocked.tone });
                        change.text = change.parts!.map(part => part.text).join("");
                    }
                    change.binding = true;
                }
                return { kind: outcome.kind, target: p.entity(outcome.target),
                    values: [change, ...(!compactBinding && outcome.blocked ? [blocked] : [])] };
            }
            case "buff": return buffRow(outcome);
            case "resource": {
                const endpoints = numeric(outcome.initial, outcome.final);
                const change = outcome.initial !== undefined && outcome.final !== undefined ? outcome.final - outcome.initial : outcome.change;
                return {
                    kind: outcome.kind, target: p.entity(outcome.target), label: p.data(outcome.resource),
                    values: [{
                        text: outcome.initial !== undefined && outcome.final !== undefined
                            ? endpoints! : formatSignedNumber(outcome.change), tone: change < 0 ? "warning" : change > 0 ? "success" : "muted"
                    }]
                };
            }
            case "stance": return stanceRow(outcome);
            case "trap": {
                const endpoints = numeric(outcome.initial, outcome.final);
                return {
                    kind: outcome.kind, label: p.trap(outcome.trap), values: [
                        ...(endpoints ? [{ text: endpoints }] : outcome.change !== undefined ? [{ text: formatSignedNumber(outcome.change) }] : []),
                        ...outcome.triggers.map(trigger => ({ text: p.ui(outcome.initial !== undefined && outcome.final !== undefined ? "gameLog.trapTriggeredActor" : "gameLog.trapTriggered", { actor: p.entity(trigger.actor), amount: trigger.amount }), tone: "warning" })),
                    ]
                };
            }
            case "character": return {
                kind: outcome.kind, target: p.entity(outcome.target),
                emphasis: outcome.operation,
                values: [{
                    text: p.ui(outcome.operation === "incapacitated" ? "gameLog.incapacitated" : "gameLog.rescued"),
                    tone: outcome.operation === "incapacitated" ? "incapacitated" : "success"
                }]
            };
            case "enemy": return {
                kind: outcome.kind, target: p.entity(outcome.target),
                emphasis: outcome.operation === "defeated" ? "defeat" : undefined,
                values: [{ text: p.ui(outcome.operation === "spawned" ? "gameLog.spawned" : "gameLog.defeated"), tone: "warning" }]
            };
            case "interrupt": return {
                kind: outcome.kind, target: p.entity(outcome.actor),
                values: [{ text: p.ui("gameLog.interrupted", { reason: p.failure(outcome.reason) }), tone: "warning" }]
            };
            case "refresh": return {
                kind: outcome.kind, target: p.entity(outcome.target),
                values: [{ text: p.ui("gameLog.refreshed"), tone: "success" }]
            };
            case "retarget": return {
                kind: outcome.kind, target: p.entity(outcome.target),
                values: [{ text: p.ui("gameLog.retargeted", { destination: p.entity(outcome.destination) }) }]
            };
            case "intention": return {
                kind: outcome.kind, target: p.entity(outcome.target),
                values: [{ text: p.ui(outcome.operation === "cancelled" ? "gameLog.cancelled" : "gameLog.weakened", { move: p.move(outcome.move) }) }]
            };
        }
    };
    const renderScope = (outcomes: LogOutcome[], actor?: string, compactBindings = false): GameLogRow[] => {
        // Group only independent, equivalent buff applications within this event. Linked
        // participants remain the single logical outcome supplied by Pass 1.
        const groups = new Map<string, BuffOutcome>();
        const grouped = new Set<BuffOutcome>();
        const buffGroups = new Map<BuffOutcome, BuffOutcome>();
        const skipped = new Set<LogOutcome>(outcomes.filter(outcome => "summarized" in outcome && outcome.summarized));
        for (const outcome of outcomes) {
            if (skipped.has(outcome) || outcome.kind !== "buff" || outcome.participants.length !== 1) continue;
            const participant = outcome.participants[0]!;
            if (participant.initial.details?.linkedEntity || participant.final.details?.linkedEntity) continue;
            const key = JSON.stringify([outcome.buff, buffOperation(participant), participant.initial.present, participant.final.present,
            participant.initial.details?.severity, participant.final.details?.severity]);
            const first = groups.get(key);
            if (first) {
                first.participants.push(participant);
                grouped.add(first);
                skipped.add(outcome);
            } else {
                const group = { ...outcome, participants: [...outcome.participants] };
                groups.set(key, group);
                buffGroups.set(outcome, group);
            }
        }
        const bindingCounts = new Map<string, number>();
        for (const outcome of outcomes) {
            if (outcome.kind === "binding") bindingCounts.set(outcome.target, (bindingCounts.get(outcome.target) ?? 0) + 1);
        }
        const rows = new Map<LogOutcome, GameLogRow>();
        for (const outcome of outcomes) {
            if (skipped.has(outcome)) continue;
            let formatted: GameLogRow;
            if (outcome.kind === "buff" && outcome.participants.length === 1) {
                const group = buffGroups.get(outcome);
                formatted = group ? buffRow(group, grouped.has(group)) : row(outcome);
            } else formatted = row(outcome, compactBindings || (outcome.kind === "binding" && bindingCounts.get(outcome.target)! > 1));
            if (formatted.target && !formatted.targetParts) {
                const id = "target" in outcome ? outcome.target : "actor" in outcome ? outcome.actor : undefined;
                if (id) formatted.targetParts = [name(id)];
            }
            if (outcome.kind === "damage" && outcome.hits.filter(hit => hit.result !== "none" || hit.damage !== 0).length > 1 && outcome.hits.some(hit => hit.damage !== 0)) {
                formatted.values.push({ text: p.ui("gameLog.damageTotal", { amount: outcome.hits.reduce((sum, hit) => sum + hit.damage, 0) }), tone: "total" });
            }
            rows.set(outcome, formatted);
        }
        // A target's zones share one row within this aggregation scope. Tick
        // boundaries have already separated independent activation consequences.
        const bindingRows = new Map<string, GameLogRow>();
        for (const outcome of outcomes) {
            if (outcome.kind !== "binding") continue;
            const formatted = rows.get(outcome);
            if (!formatted) continue;
            const first = bindingRows.get(outcome.target);
            if (first) { first.values.push(...formatted.values); rows.delete(outcome); }
            else bindingRows.set(outcome.target, formatted);
        }
        // Net binding changes can share all executed target bands. Buff attribution
        // remains restricted to a single hit, preserving shared-buff suppression.
        if (actor !== undefined) {
            for (const outcome of outcomes) {
                if (outcome.kind !== "damage" || !outcome.hits.some(hit => hit.result !== "none")) continue;
                const hitRow = rows.get(outcome);
                if (!hitRow) continue;
                for (const effect of outcomes) {
                    const effectRow = rows.get(effect);
                    if (!effectRow) continue;
                    const binding = effect.kind === "binding" && effect.target === outcome.target;
                    const buff = outcome.hits.length === 1 && outcome.hits[0]!.result !== "miss" && effect.kind === "buff" && effect.participants.some(participant => participant.target === outcome.target)
                        && effect.participants.every(participant => participant.target === outcome.target || participant.target === actor)
                        && effect.participants.filter(participant => outcomes.some(candidate =>
                            candidate.kind === "damage" && candidate.target === participant.target)).length === 1
                        && effectRow.values.length === 1
                        && !grouped.has(buffGroups.get(effect)!);
                    if (binding || buff) {
                        hitRow.values.push(...effectRow.values);
                        rows.delete(effect);
                    }
                }
            }
        }
        // Accuracy-only rows explain failed attacks, but shared buffs do not need
        // one roll per participant. HP effects (including recorded zeroes) and
        // binding sequences retain all executed bands and their damage totals.
        for (const outcome of outcomes) {
            if (outcome.kind !== "damage") continue;
            const formatted = rows.get(outcome);
            if (!formatted) continue;
            const hpEffect = outcome.hits.some(hit => hit.damage !== 0 || hit.healing !== 0 || hit.blocked !== 0 || hit.recordedZeroEffect);
            const related = outcomes.filter(effect => effect !== outcome && !("summarized" in effect && effect.summarized) && (
                ("target" in effect && effect.target === outcome.target)
                || (effect.kind === "buff" && effect.participants.some(participant => participant.target === outcome.target))
                || (effect.kind === "stance" && effect.actor === outcome.target)));
            const binding = related.some(effect => effect.kind === "binding");
            const significant = related.some(effect => effect.kind === "character" || effect.kind === "enemy");
            const inline = formatted.values.length > outcome.hits.filter(hit => hit.result !== "none").length;
            if (hpEffect || binding || significant || inline) continue;
            // Preserve a target's failed attack unless an effect on that target succeeded.
            formatted.values = related.length === 0 ? outcome.hits.filter(hit => hit.result === "miss")
                .map(hit => ({ text: p.hitBand(hit.result), tone: hit.result })) : [];
            if (!formatted.values.length) rows.delete(outcome);
        }
        return [...rows.values()];
    };
    const renderOutcomes = (outcomes: LogOutcome[], actor?: string, compactBindings = false): GameLogRow[] => {
        const rendered: GameLogRow[] = [];
        let start = 0;
        for (const [index, outcome] of outcomes.entries()) {
            if (outcome.kind !== "bindingTick") continue;
            rendered.push(...renderScope(outcomes.slice(start, index), actor, compactBindings), ...renderScope([outcome]));
            start = index + 1;
        }
        rendered.push(...renderScope(outcomes.slice(start), actor, compactBindings));
        return rendered;
    };
    return entries.map(entry => {
        const model: GameLogViewModelEntry = { kind: entry.kind, rows: renderOutcomes(entry.outcomes, entry.kind === "move" ? entry.actor : undefined) };
        switch (entry.kind) {
            case "move":
            case "escape":
                model.actorId = entry.actor;
                model.actor = p.entity(entry.actor);
                model.actorTone = playerTone(entry.actor);
                model.title = entry.kind === "move" ? p.move(entry.move) : p.ui("characterDetails.escape");
                if (entry.kind === "move" && entry.band) model.band = { text: p.hitBand(entry.band), tone: entry.band };
                if (entry.kind === "escape") {
                    model.target = p.entity(entry.target);
                    model.targetTone = playerTone(entry.target);
                }
                break;
            case "phase":
                model.phase = entry.phase;
                model.title = [entry.round !== undefined ? p.ui("battleOverview.round", { round: entry.round }) : undefined,
                p.ui("battleOverview.phase", { phase: p.phase(entry.phase) })].filter(Boolean).join(" · ");
                break;
            case "stance":
                model.rows.unshift(...entry.changes.map(stanceRow)); break;
            case "encounter":
            case "character":
                model.title = p.load(entry.kind === "encounter" ? "Encounter" : "Character", entry.id, entry.success);
                break;
        }
        return model;
    });
}
