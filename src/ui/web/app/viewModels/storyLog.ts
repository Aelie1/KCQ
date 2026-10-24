import type { GameLogPresentationEntry, LogHit, LogOutcome } from "../../../presentation/gameLog";
import type { Presentation, ResolvedNarrative } from "../../../presentation/presentation";

export interface StoryLogEntry {
    kind: GameLogPresentationEntry["kind"];
    actorId?: string;
    phase?: string;
    title?: string;
    paragraphs: string[];
}

type MoveEntry = Extract<GameLogPresentationEntry, { kind: "move" }>;
type HitResult = { target: string; hit: LogHit; };
type BuffOutcome = Extract<LogOutcome, { kind: "buff" }>;
type BuffOperation = "added" | "removed" | "changed";
type Side = "characters" | "enemies";

type BuffChange = {
    buff: string;
    operation: BuffOperation;
    severity?: number;
    target: string;
    side?: Side;
};

type BuffGroup = {
    changes: BuffChange[];
    keys: string[];
};

/** A narrative describes authored story moments, not every mechanical consequence. */
export function createStoryLogViewModel(
    entries: readonly GameLogPresentationEntry[],
    p: Presentation,
    party?: readonly string[],
): StoryLogEntry[] {
    const list = (values: readonly string[]): string => {
        const unique = [...new Set(values)];
        if (unique.length < 2) return unique[0] ?? "";
        const args = {
            first: unique.slice(0, -1).join(", "),
            second: unique[unique.length - 1] ?? "",
        };
        return p.narrative(["ui.storyLog.targetListFinal"], args) ?? p.ui("gameLog.targetList", args);
    };
    const names = (ids: readonly string[]): string => list(ids.map(id => p.entity(id)));

    const flatten = (outcomes: readonly LogOutcome[]): LogOutcome[] => outcomes.flatMap(outcome =>
        outcome.kind === "bindingTick" ? flatten(outcome.outcomes) : [outcome]);

    const buffChanges = (outcome: BuffOutcome): BuffChange[] => {
        if (outcome.summarized) return [];
        return outcome.participants.flatMap(({ target, initial, final }) => {
            if (!initial.present && !final.present) return [];
            const operation: BuffOperation = !initial.present ? "added" : !final.present ? "removed" : "changed";
            return [{
                buff: outcome.buff,
                operation,
                severity: (final.details ?? initial.details)?.severity,
                target,
                side: party === undefined ? undefined : party.includes(target) ? "characters" : "enemies",
            }];
        });
    };

    // Group a buff consequence across all recipients of the same action. A side-specific
    // authored passage can split the group; otherwise linked buffs share one passage.
    const buffGroupKey = (change: BuffChange): { id: string; keys: string[] } => {
        const base = `buff.${change.buff}.narrative.${change.operation}`;
        const sideKeys = change.side === undefined ? [] : [
            ...(change.severity === undefined ? [] : [`${base}.${change.side}.${change.severity}`]),
            `${base}.${change.side}`,
        ];
        const hasSideText = sideKeys.length > 0 && p.narrative(sideKeys) !== undefined;
        const keys = [
            ...(hasSideText ? sideKeys : []),
            ...(change.severity === undefined ? [] : [`${base}.${change.severity}`]),
            base,
        ];
        return {
            id: JSON.stringify([change.buff, change.operation, change.severity ?? null, hasSideText ? change.side : null]),
            keys,
        };
    };

    const moveNarrative = (entry: MoveEntry): ResolvedNarrative | undefined => {
        const results: HitResult[] = [];
        entry.outcomes.forEach((outcome, index) => {
            if (outcome.kind !== "damage") return;
            outcome.hits.forEach((hit, hitIndex) => {
                if (hit.result !== "none") results.push({
                    target: outcome.target,
                    hit,
                });
            });
        });
        const base = `move.${entry.move}.narrative`;
        const actor = p.entity(entry.actor);
        const move = p.move(entry.move);
        if (!results.length) {
            if (entry.result && entry.result !== "none") {
                return p.resolveNarrative([`${base}.${entry.result}`], { actor, move, band: p.hitBand(entry.result) });
            }
            return p.resolveNarrative([`${base}.action`], { actor, move });
        }

        const hits = results.filter(result => result.hit.result !== "miss");
        const misses = results.filter(result => result.hit.result === "miss");
        const category = !hits.length ? "miss" : "hit";
        const firstBand = results[0]?.hit.result;
        const exactBand = firstBand && results.every(result => result.hit.result === firstBand) ? firstBand : undefined;
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

        const allTargets = names(results.map(result => result.target));
        const bindings = [...new Set(entry.outcomes.flatMap(outcome =>
            outcome.kind === "binding" && outcome.change > 0
                ? [outcome.binding] : []))];
        const hitLocation = bindings.length === 1
            ? p.ui("storyLog.hitLocation.single", { binding: p.binding(bindings[0]!, "short").toLowerCase() })
            : bindings.length === 2
                ? p.ui("storyLog.hitLocation.two")
                : bindings.length === 3
                    ? p.ui("storyLog.hitLocation.three")
                    : bindings.length >= 4
                        ? p.ui("storyLog.hitLocation.many")
                        : "";
        return p.resolveNarrative(keys, {
            actor,
            move,
            target: allTargets,
            targets: allTargets,
            hits: names(hits.map(result => result.target)),
            misses: names(misses.map(result => result.target)),
            grazes: names(results.filter(result => result.hit.result === "graze").map(result => result.target)),
            crits: names(results.filter(result => result.hit.result === "crit").map(result => result.target)),
            damage: results.reduce((sum, result) => sum + result.hit.damage, 0),
            band: p.hitBand(exactBand ?? (category === "miss" ? "miss" : "hit")),
            hitLocation,
        });
    };

    const escapeNarrative = (entry: Extract<GameLogPresentationEntry, { kind: "escape" }>, outcomes: readonly LogOutcome[]): ResolvedNarrative | undefined => {
        const progress = outcomes.filter((outcome): outcome is Extract<LogOutcome, { kind: "binding" }> =>
            outcome.kind === "binding" && outcome.target === entry.target && outcome.change < 0);
        const assisting = entry.actor !== entry.target;
        const base = assisting ? "assist" : "escape";
        const result = progress.length ? "progress" : "failed";
        return p.resolveNarrative([`${base}.narrative.${result}`], {
            actor: p.entity(entry.actor),
            target: p.entity(entry.target),
            amount: progress.reduce((sum, outcome) => sum - outcome.change, 0),
            bindings: list(progress.map(outcome => p.binding(outcome.binding))),
        });
    };

    const effects = (entry: GameLogPresentationEntry, outcomes: readonly LogOutcome[]): ResolvedNarrative[] => {
        const grouped = new Map<string, BuffGroup>();
        for (const outcome of outcomes) {
            if (outcome.kind !== "buff") continue;
            for (const change of buffChanges(outcome)) {
                const { id, keys } = buffGroupKey(change);
                const group = grouped.get(id);
                if (group) group.changes.push(change);
                else grouped.set(id, { changes: [change], keys });
            }
        }

        const emitted = new Set<string>();
        const narratives: ResolvedNarrative[] = [];
        for (const outcome of outcomes) {
            if ("summarized" in outcome && outcome.summarized) continue;
            let text: ResolvedNarrative | undefined;
            switch (outcome.kind) {
                case "buff": {
                    for (const change of buffChanges(outcome)) {
                        const { id } = buffGroupKey(change);
                        if (emitted.has(id)) continue;
                        emitted.add(id);
                        const group = grouped.get(id);
                        if (!group) continue;
                        const targets = names(group.changes.map(item => item.target));
                        const severity = change.severity;
                        const line = p.resolveNarrative(group.keys, {
                            target: targets,
                            targets,
                            buff: p.buff(change.buff, severity),
                            ...(entry.kind === "move" || entry.kind === "escape" ? { actor: p.entity(entry.actor) } : {}),
                        });
                        if (line) narratives.push(line);
                    }
                    break;
                }
                case "binding": {
                    if (!outcome.initial?.level || !outcome.final?.level || outcome.initial.level === outcome.final.level) break;
                    const direction = outcome.change > 0 ? "increased" : outcome.change < 0 ? "decreased" : undefined;
                    if (!direction) break;
                    const base = `binding.${outcome.binding}.narrative.${direction}`;
                    const target = p.entity(outcome.target);
                    const targetPossessive = entry.kind === "escape" && entry.actor === outcome.target
                        ? "her"
                        : `${target}'s`;
                    text = p.resolveNarrative([
                        `${base}.${outcome.initial.level}.${outcome.final.level}`,
                        `${base}.${outcome.final.level}`,
                        base,
                    ], {
                        ...(entry.kind === "escape" ? { actor: p.entity(entry.actor) } : {}),
                        target,
                        targetPossessive,
                        binding: p.binding(outcome.binding),
                        level: p.bindingLevel(outcome.final.level),
                        previous: p.bindingLevel(outcome.initial.level),
                    });
                    break;
                }
                case "character":
                case "enemy":
                    text = p.resolveNarrative([
                        `entity.${outcome.target}.narrative.${outcome.operation}`,
                        `${outcome.kind}.narrative.${outcome.operation}`,
                    ], { target: p.entity(outcome.target) });
                    break;
                case "trap": {
                    if (!outcome.triggers.length) break;
                    const actors = names(outcome.triggers.map(trigger => trigger.actor));
                    text = p.resolveNarrative([`trap.${outcome.trap}.narrative.triggered`], {
                        actor: actors,
                        targets: actors,
                        trap: p.trap(outcome.trap),
                        amount: outcome.triggers.reduce((sum, trigger) => sum + trigger.amount, 0),
                    });
                    break;
                }
            }
            if (text) narratives.push(text);
        }
        return narratives;
    };

    const matchesPattern = (key: string, pattern: string): boolean => {
        const escaped = pattern
            .split("*")
            .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join(".*");

        return new RegExp(`^${escaped}$`).test(key);
    };

    const result: StoryLogEntry[] = [];
    let pendingPhase: StoryLogEntry | undefined;
    for (const entry of entries) {
        const outcomes = flatten(entry.outcomes);
        const narratives: ResolvedNarrative[] = [];
        if (entry.kind === "move") {
            const text = moveNarrative(entry);
            if (text) narratives.push(text);
        } else if (entry.kind === "escape") {
            const text = escapeNarrative(entry, outcomes);
            if (text) narratives.push(text);
        }
        narratives.push(...effects(entry, outcomes));

        // Apply every active directive once, including those on suppressed narratives.
        const patterns = narratives.flatMap(narrative => narrative.suppress);
        const paragraphs = narratives
            .filter(narrative => !patterns.some(pattern => matchesPattern(narrative.key, pattern)))
            .map(narrative => narrative.text);

        if (entry.kind === "phase") {
            const title = [
                entry.round === undefined ? undefined : p.ui("battleOverview.round", { round: entry.round }),
                p.ui("battleOverview.phase", { phase: p.phase(entry.phase) }),
            ].filter(Boolean).join(" · ");
            const phase: StoryLogEntry = { kind: "phase", phase: entry.phase, title, paragraphs };
            if (paragraphs.length) {
                result.push(phase);
                pendingPhase = undefined;
            } else {
                pendingPhase = phase;
            }
            continue;
        }
        if (!paragraphs.length) continue;
        if (pendingPhase) {
            result.push(pendingPhase);
            pendingPhase = undefined;
        }
        result.push({
            kind: entry.kind,
            ...(entry.kind === "move" || entry.kind === "escape" ? { actorId: entry.actor } : {}),
            paragraphs,
        });
    }
    return result;
}
