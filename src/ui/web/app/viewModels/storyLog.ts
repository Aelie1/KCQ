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
    const names = (ids: readonly string[]) => formatGameLogTargets(ids, p, [], [], false, false).text;
    const effects = (outcome: LogOutcome): string[] => {
        if ("summarized" in outcome && outcome.summarized) return [];
        const target = "target" in outcome ? p.entity(outcome.target) : "";
        switch (outcome.kind) {
            case "buff": return outcome.participants.map(({ target, initial, final }) => {
                const operation = !initial.present && final.present ? "added" : initial.present && !final.present ? "removed" : "changed";
                const severity = (final.details ?? initial.details)?.severity;
                const base = `buff.${outcome.buff}.narrative.${operation}`;
                const side = party === undefined ? undefined : party.includes(target) ? "characters" : "enemies";
                return p.narrative([
                    ...(side ? [
                        ...(severity !== undefined ? [`${base}.${side}.${severity}`] : []),
                        `${base}.${side}`,
                    ] : []),
                    ...(severity !== undefined ? [`${base}.${severity}`] : []),
                    base,
                ], { target: p.entity(target), buff: p.buff(outcome.buff, severity) })!;
            });
            default:
                return [];
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
            const hits = groups.get(unit)!;
            const band = unit.hit.result;
            const category = band === "miss" ? "miss" : "hit";
            const base = `move.${action!.move}.narrative.`;
            const targets = names(hits.map(hit => hit.target));
            const text = p.narrative([
                ...(hits.length > 1 ? [`${base}.${band}.plural`] : []),
                `${base}.${band}`, `${base}.${category}`,
            ], {
                actor: p.entity(action!.actor), move: p.move(action!.move), target: targets, targets,
                damage: hits.reduce((sum, hit) => sum + hit.hit.damage, 0), band: p.hitBand(band)
            })!;
            return [text];
        });
    }
    return entries.map(entry => {
        const model: StoryLogEntry = { kind: entry.kind, paragraphs: [] };
        if (entry.kind === "move") {
            model.actorId = entry.actor;
            // An unrolled action gets its own extensible event key, never a hit claim.
            if (!entry.outcomes.some(outcome => outcome.kind === "damage" && outcome.hits.some(hit => hit.result !== "none"))) {
                model.paragraphs.push(p.narrative([`move.${entry.move}.narrative.action`, "narrative.event.move"], {
                    actor: p.entity(entry.actor), move: p.move(entry.move),
                })!);
            }
            model.paragraphs.push(...scope(entry.outcomes, entry));
        }
        return model;
    });
}
