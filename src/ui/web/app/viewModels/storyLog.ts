import type { GameLogPresentationEntry, LogHit, LogOutcome } from "../../../presentation/gameLog";
import type { Presentation } from "../../../presentation/presentation";
import { formatGameLogTargets } from "./gameLogTargets";

export interface StoryLogEntry {
    kind: GameLogPresentationEntry["kind"];
    actorId?: string;
    phase?: string;
    title?: string;
    paragraphs: string[];
}
type Args = Record<string, string | number>;
type Unit = { order: number } & (
    { kind: "hit"; target: string; hit: LogHit } | { kind: "effect"; outcome: LogOutcome }
);

/** Independent semantic presentation. Never consumes mechanical log text or rows. */
export function createStoryLogViewModel(entries: readonly GameLogPresentationEntry[], p: Presentation, party?: readonly string[]): StoryLogEntry[] {
    const event = (kind: string, args: Args = {}) => p.narrative([`narrative.event.${kind}`], args)!;
    const names = (ids: readonly string[]) => formatGameLogTargets(ids, p, [], [], false, false).text;
    const hp = (target: string, hit: LogHit): string[] => [
        ...(hit.damage ? [event("damage", { target: p.entity(target), damage: hit.damage })] : []),
        ...(hit.healing ? [event("healing", { target: p.entity(target), healing: hit.healing })] : []),
        ...(hit.blocked ? [event("blocked", { target: p.entity(target), blocked: hit.blocked })] : []),
    ];
    const effects = (outcome: LogOutcome): string[] => {
        if ("summarized" in outcome && outcome.summarized) return [];
        const target = "target" in outcome ? p.entity(outcome.target) : "";
        switch (outcome.kind) {
            case "damage": return outcome.hits.flatMap(hit => hp(outcome.target, hit));
            case "bindingTick": return [event("bindingTick", { target, binding: p.binding(outcome.binding) }), ...scope(outcome.outcomes)];
            case "binding": return [
                ...(outcome.change ? [event("binding", { target, binding: p.binding(outcome.binding), change: outcome.change })] : []),
                ...(outcome.blocked ? [event("bindingBlocked", { target, binding: p.binding(outcome.binding), blocked: outcome.blocked })] : []),
            ];
            case "buff": return outcome.participants.map(({ target, initial, final }) => {
                const operation = !initial.present && final.present ? "added" : initial.present && !final.present ? "removed" : "changed";
                const severity = (final.details ?? initial.details)?.severity;
                const base = `narrative.buff.${outcome.buff}.${operation}`;
                const side = party === undefined ? undefined : party.includes(target) ? "characters" : "enemies";
                return p.narrative([
                    ...(side ? [
                        ...(severity !== undefined ? [`${base}.${side}.${severity}`] : []),
                        `${base}.${side}`,
                    ] : []),
                    ...(severity !== undefined ? [`${base}.${severity}`] : []),
                    base, `narrative.event.buff.${operation}`,
                ], { target: p.entity(target), buff: p.buff(outcome.buff, severity) })!;
            });
            case "stance": return [event("stance", { actor: p.entity(outcome.actor), stance: p.stance(outcome.final) })];
            case "resource": return outcome.change ? [event("resource", { target, resource: p.data(outcome.resource), change: outcome.change })] : [];
            case "trap": return [
                ...outcome.triggers.map(trigger => event("trapTriggered", { actor: p.entity(trigger.actor), trap: p.trap(outcome.trap), amount: trigger.amount })),
                ...(outcome.change ? [event("trap", { trap: p.trap(outcome.trap), change: outcome.change })] : []),
            ];
            case "character":
            case "enemy": return [event(`${outcome.kind}.${outcome.operation}`, { target })];
            case "interrupt": return [event("interrupt", { actor: p.entity(outcome.actor), reason: p.failure(outcome.reason) })];
            case "refresh": return [event("refresh", { target })];
            case "retarget": return [event("retarget", { target, destination: p.entity(outcome.destination) })];
            case "intention": return [event(`intention.${outcome.operation}`, { target, move: p.move(outcome.move) })];
            case "bonus": return [event("bonus", { target, amount: outcome.amount })];
        }
    };
    function scope(outcomes: readonly LogOutcome[], action?: { actor: string; move: string }): string[] {
        // New histories retain cross-target hit order; older saves use their stable
        // aggregated order. Tick scopes and significant transitions are hard boundaries.
        const units: Unit[] = outcomes.flatMap<Unit>((outcome, index) => outcome.kind === "damage" && action
            ? outcome.hits.map((hit, hitIndex) => ({ kind: "hit", target: outcome.target, hit, order: hit.order ?? index + hitIndex / (outcome.hits.length + 1) }))
            : [{ kind: "effect", outcome, order: outcome.order ?? index }]);
        units.sort((a, b) => a.order - b.order);
        const groups = new Map<Unit, Extract<Unit, { kind: "hit" }>[]>();
        const consumed = new Set<Unit>();
        let group: Extract<Unit, { kind: "hit" }>[] | undefined;
        for (const unit of units) {
            if (unit.kind === "effect") {
                // These consequences cannot move across another attack sentence.
                if (!["binding", "buff", "resource"].includes(unit.outcome.kind)) group = undefined;
                continue;
            }
            if (unit.hit.result === "none") { group = undefined; continue; }
            if (group && group[0]!.hit.result === unit.hit.result && !group.some(hit => hit.target === unit.target)) {
                group.push(unit);
                consumed.add(unit);
            } else {
                group = [unit];
                groups.set(unit, group);
            }
        }
        return units.flatMap(unit => {
            if (unit.kind === "effect") return effects(unit.outcome);
            if (consumed.has(unit)) return hp(unit.target, unit.hit);
            if (unit.hit.result === "none") return hp(unit.target, unit.hit);
            const hits = groups.get(unit)!;
            const band = unit.hit.result;
            const category = band === "miss" ? "miss" : "hit";
            const base = `narrative.move.${action!.move}`;
            const targets = names(hits.map(hit => hit.target));
            const text = p.narrative([
                ...(hits.length > 1 ? [`${base}.${band}.plural`] : []),
                `${base}.${band}`, `${base}.${category}`, `narrative.generic.${category}`,
            ], { actor: p.entity(action!.actor), move: p.move(action!.move), target: targets, targets,
                damage: hits.reduce((sum, hit) => sum + hit.hit.damage, 0), band: p.hitBand(band) })!;
            return [text, ...hp(unit.target, unit.hit)];
        });
    }
    return entries.map(entry => {
        const model: StoryLogEntry = { kind: entry.kind, paragraphs: [] };
        if (entry.kind === "move") {
            model.actorId = entry.actor;
            // An unrolled action gets its own extensible event key, never a hit claim.
            if (!entry.outcomes.some(outcome => outcome.kind === "damage" && outcome.hits.some(hit => hit.result !== "none"))) {
                model.paragraphs.push(p.narrative([`narrative.move.${entry.move}.action`, "narrative.event.move"], {
                    actor: p.entity(entry.actor), move: p.move(entry.move),
                })!);
            }
            model.paragraphs.push(...scope(entry.outcomes, entry));
        } else {
            switch (entry.kind) {
                case "phase":
                    model.phase = entry.phase;
                    model.title = [entry.round !== undefined ? p.ui("battleOverview.round", { round: entry.round }) : undefined,
                        p.ui("battleOverview.phase", { phase: p.phase(entry.phase) })].filter(Boolean).join(" · ");
                    model.paragraphs.push(event("phase", { phase: p.phase(entry.phase) }));
                    break;
                case "escape":
                    model.actorId = entry.actor;
                    model.paragraphs.push(event(entry.actor === entry.target ? "escape" : "assist", {
                        actor: p.entity(entry.actor), target: p.entity(entry.target),
                    }));
                    break;
                case "stance": model.paragraphs.push(...entry.changes.flatMap(effects)); break;
                case "encounter":
                case "character": model.paragraphs.push(event(`${entry.kind}.${entry.success ? "loaded" : "failed"}`, {
                    target: entry.success ? entry.kind === "encounter" ? p.encounter(entry.id) : p.entity(entry.id) : entry.id,
                })); break;
            }
            model.paragraphs.push(...scope(entry.outcomes));
        }
        return model;
    });
}
