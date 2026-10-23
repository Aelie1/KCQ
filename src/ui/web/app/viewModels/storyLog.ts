
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

type MoveEntry = Extract<GameLogPresentationEntry, { kind: "move" }>;
type HitResult = { target: string; hit: LogHit; order: number };

/** Render only explicitly authored move and buff narration. */
export function createStoryLogViewModel(entries: readonly GameLogPresentationEntry[], p: Presentation, party?: readonly string[]): StoryLogEntry[] {
    const names = (ids: readonly string[]) => formatGameLogTargets([...new Set(ids)], p, [], [], false, false).text;

    const effects = (outcome: LogOutcome): string[] => {
        if ("summarized" in outcome && outcome.summarized) return [];

        if (outcome.kind === "bindingTick") {
            return outcome.outcomes.flatMap(effects);
        }
        if (outcome.kind !== "buff") return [];

        return outcome.participants.flatMap(({ target, initial, final }) => {
            const operation = !initial.present && final.present ? "added"
                : initial.present && !final.present ? "removed" : "changed";
            const severity = (final.details ?? initial.details)?.severity;
            const base = `buff.${outcome.buff}.narrative.${operation}`;
            const side = party === undefined ? undefined : party.includes(target) ? "characters" : "enemies";
            const keys = [
                ...(side ? [
                    ...(severity !== undefined ? [`${base}.${side}.${severity}`] : []),
                    `${base}.${side}`,
                ] : []),
                ...(severity !== undefined ? [`${base}.${severity}`] : []),
                base,
            ];
            const text = p.narrative(keys, { target: p.entity(target), buff: p.buff(outcome.buff, severity) });
            return text ? [text] : [];
        });
    };

    const moveNarrative = (entry: MoveEntry): string | undefined => {
        const results: HitResult[] = [];
        entry.outcomes.forEach((outcome, index) => {
            if (outcome.kind !== "damage") return;
            outcome.hits.forEach((hit, hitIndex) => {
                if (hit.result === "none") return;
                results.push({
                    target: outcome.target,
                    hit,
                    order: hit.order ?? outcome.order ?? index + hitIndex / (outcome.hits.length + 1),
                });
            });
        });
        results.sort((a, b) => a.order - b.order);

        const base = `move.${entry.move}.narrative`;
        const actor = p.entity(entry.actor);
        const move = p.move(entry.move);
        if (results.length === 0) {
            return p.narrative([`${base}.action`], { actor, move });
        }

        const hits = results.filter(result => result.hit.result !== "miss");
        const misses = results.filter(result => result.hit.result === "miss");
        const category = hits.length === 0 ? "miss" : misses.length === 0 ? "hit" : "mixed";
        const firstBand = results[0]?.hit.result;
        const exactBand = results.every(result => result.hit.result === firstBand) ? firstBand : undefined;
        const plural = new Set(results.map(result => result.target)).size > 1;

        const keys: string[] = [];
        if (exactBand) {
            if (plural) keys.push(`${base}.${exactBand}.plural`);
            keys.push(`${base}.${exactBand}`);
        }
        if (category !== exactBand) {
            if (plural) keys.push(`${base}.${category}.plural`);
            keys.push(`${base}.${category}`);
        }

        const targetNames = names(results.map(result => result.target));
        return p.narrative(keys, {
            actor,
            move,
            target: targetNames,
            targets: targetNames,
            hits: names(hits.map(result => result.target)),
            misses: names(misses.map(result => result.target)),
            damage: results.reduce((total, result) => total + result.hit.damage, 0),
            band: p.hitBand(exactBand ?? (category === "miss" ? "miss" : "hit")),
        });
    };

    return entries.flatMap(entry => {
        const paragraphs: string[] = [];
        if (entry.kind === "move") {
            const text = moveNarrative(entry);
            if (text) paragraphs.push(text);
        }
        paragraphs.push(...entry.outcomes.flatMap(effects));
        if (paragraphs.length === 0) return [];

        return [{
            kind: entry.kind,
            ...(entry.kind === "move" || entry.kind === "escape" ? { actorId: entry.actor } : {}),
            paragraphs,
        }];
    });
}
