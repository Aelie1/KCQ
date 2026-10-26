import type { ContentLibrary } from "../../../../engine/public/library";
import type { GameLogPresentationEntry, LogHit, LogOutcome } from "../../../presentation/gameLog";
import type { Presentation, ResolvedNarrative } from "../../../presentation/presentation";
import { playerTone, type PlayerTone } from "./linkedEntities";

type StoryTone = "success" | "warning" | "danger";

export interface StoryLogText {
    text: string;
    glow?: PlayerTone;
}

export interface StoryLogParagraph {
    text: string;
    tone?: StoryTone;
    /** Inline parts keep skill highlighting separate from consequences in the same paragraph. */
    parts?: StoryLogText[];
}

export interface StoryLogEntry {
    kind: GameLogPresentationEntry["kind"];
    actorId?: string;
    phase?: string;
    title?: string;
    paragraphs: StoryLogParagraph[];
}

type StoryNarrative = ResolvedNarrative & {
    tone?: StoryTone;
    glow?: PlayerTone;
};

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
    library?: Pick<ContentLibrary, "moves">,
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
        outcome.kind === "bindingTick" || outcome.kind === "trapActivation" ? flatten(outcome.outcomes) : [outcome]);

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

    const targetSummary = (ids: readonly string[], enemies: readonly string[] = []): string => {
        const unique = [...new Set(ids)];

        if (unique.length === 0) {
            return p.ui("storyLog.targets.none");
        }

        if (unique.length === 1) {
            return p.entity(unique[0]!);
        }

        if (enemies.length > 1 && unique.length === enemies.length && enemies.every(id => unique.includes(id))) {
            return p.ui("storyLog.targets.allEnemies");
        }

        return p.ui("storyLog.targets.count", {
            count: unique.length,
            number: p.ui(`storyLog.number.${unique.length}`),
        });
    };

    const moveNarrative = (entry: MoveEntry, outcomes: readonly LogOutcome[]): ResolvedNarrative | undefined => {
        if (flatten(entry.outcomes).some(outcome => outcome.kind === "interrupt" && outcome.actor === entry.actor)) {
            return undefined;
        }
        const results: HitResult[] = [];
        outcomes.forEach(outcome => {
            if (outcome.kind !== "damage") return;
            outcome.hits.forEach(hit => {
                if (hit.result !== "none") results.push({
                    target: outcome.target,
                    hit,
                });
            });
        });
        const base = `move.${entry.move}.narrative`;
        const actor = p.entity(entry.actor);
        const move = p.move(entry.move);
        const hits = results.filter(result => result.hit.result !== "miss");
        const misses = results.filter(result => result.hit.result === "miss");
        const target = names(entry.targetIds);
        const targetCount = targetSummary(results.length ? hits.map(result => result.target) : entry.targetIds, entry.livingEnemies,);
        const targetSide = entry.targetIds.some(id => party?.includes(id)) ? "characters" : "enemies";
        if (!results.length) {
            if (entry.result && entry.result !== "none") {
                return p.resolveNarrative([`${base}.${entry.result}`], { actor, move, band: p.hitBand(entry.result) });
            }
            return p.resolveNarrative([`${base}.action.${targetSide}`, `${base}.action`], { actor, move, target, targetCount });
        }

        const category = !hits.length ? "miss" : "hit";
        const firstBand = results[0]?.hit.result;
        const exactBand = firstBand && results.every(result => result.hit.result === firstBand) ? firstBand : undefined;
        const plural = new Set(results.map(result => result.target)).size > 1;
        const keys: string[] = [];
        if (exactBand && hits.length > 0) {
            keys.push(`${base}.${exactBand}.${hits.length}`);
        }
        if (hits.length > 0 && category !== exactBand) {
            keys.push(`${base}.${category}.${hits.length}`);
        }
        if (exactBand) {
            if (plural) keys.push(`${base}.${exactBand}.plural`);
            keys.push(`${base}.${exactBand}`);
        }
        if (category !== exactBand) {
            if (plural) keys.push(`${base}.${category}.plural`);
            keys.push(`${base}.${category}`);
        }
        keys.push(`${base}.action`);

        const bindings = [...new Set(outcomes.flatMap(outcome =>
            outcome.kind === "binding" && outcome.change > 0
                ? [outcome.binding] : []))];
        const hitLocation = bindings.length === 1 ? p.ui("storyLog.hitLocation.single", { binding: p.binding(bindings[0]!, "short").toLowerCase() })
            : bindings.length === 2 ? p.ui("storyLog.hitLocation.two")
                : bindings.length === 3 ? p.ui("storyLog.hitLocation.three")
                    : bindings.length >= 4 ? p.ui("storyLog.hitLocation.many")
                        : "";
        return p.resolveNarrative(keys, {
            actor,
            move,
            target,
            targetCount,
            hits: names(hits.map(result => result.target)),
            misses: names(misses.map(result => result.target)),
            grazes: names(results.filter(result => result.hit.result === "graze").map(result => result.target)),
            crits: names(results.filter(result => result.hit.result === "crit").map(result => result.target)),
            damage: results.reduce((sum, result) => sum + result.hit.damage, 0),
            band: p.hitBand(exactBand ?? (category === "miss" ? "miss" : "hit")),
            hitLocation,
        });
    };

    const escapeNarrative = (entry: Extract<GameLogPresentationEntry, { kind: "escape" }>, outcomes: readonly LogOutcome[],): ResolvedNarrative | undefined => {
        const progress = outcomes.filter(
            (outcome): outcome is Extract<LogOutcome, { kind: "binding" }> =>
                outcome.kind === "binding" && outcome.target === entry.target && outcome.change < 0
        );

        const hasSpecificTransition = progress.some(outcome => {
            const initial = outcome.initial?.level;
            const final = outcome.final?.level;

            if (!initial || !final || initial === final) {
                return false;
            }

            const base = `binding.${outcome.binding}.narrative.decreased`;

            return p.narrative([
                `${base}.${initial}.${final}`,
                `${base}.${final}`,
                base,
            ]) !== undefined;
        });

        if (hasSpecificTransition) {
            return undefined;
        }

        const assisting = entry.actor !== entry.target;
        const base = assisting ? "assist" : "escape";

        return p.resolveNarrative([`ui.storyLog.${base}`], {
            actor: p.entity(entry.actor),
            target: p.entity(entry.target),
            amount: progress.reduce((sum, outcome) => sum - outcome.change, 0),
            binding: list(progress.map(outcome =>
                p.binding(outcome.binding, "short").toLowerCase())),
        });
    };

    const tickNarrative = (
        outcome: Extract<LogOutcome, { kind: "bindingTick" }>,
    ): ResolvedNarrative | undefined => {
        const base = `binding.${outcome.binding}.narrative.tick`;

        return p.resolveNarrative([
            ...(outcome.level ? [`${base}.${outcome.level}`] : []),
            base,
        ], {
            target: p.entity(outcome.target),
            binding: p.binding(outcome.binding),
            ...(outcome.level ? { level: p.bindingLevel(outcome.level) } : {}),
        });
    };

    const effects = (entry: GameLogPresentationEntry, outcomes: readonly LogOutcome[], causalOrder = false): StoryNarrative[] => {
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

        const spawned = outcomes.filter(
            (outcome): outcome is Extract<LogOutcome, { kind: "enemy" }> =>
                outcome.kind === "enemy" && outcome.operation === "spawned"
        );

        const spawnedTargets = names(spawned.map(outcome => outcome.target));

        const emitted = new Set<string>();
        const narratives: StoryNarrative[] = [];

        const spawnNarrative = (): ResolvedNarrative | undefined => {
            if (!spawned.length) return undefined;
            const plural = spawned.length > 1;

            return p.resolveNarrative([
                ...(plural ? ["enemy.narrative.spawned.plural"] : []),
                "enemy.narrative.spawned",
            ], {
                target: spawnedTargets,
            });
        };
        let emittedSpawn = false;
        if (!causalOrder) {
            const spawn = spawnNarrative();
            if (spawn) narratives.push(spawn);
            emittedSpawn = true;
        }

        for (const outcome of outcomes) {
            if ("summarized" in outcome && outcome.summarized) continue;
            let text: ResolvedNarrative | undefined;
            let tone: StoryTone | undefined;
            switch (outcome.kind) {
                case "buff": {
                    for (const change of buffChanges(outcome)) {
                        const { id } = buffGroupKey(change);
                        if (emitted.has(id)) continue;
                        emitted.add(id);
                        const group = grouped.get(id);
                        if (!group) continue;
                        const targetIds = [...new Set(group.changes.map(item => item.target))];
                        const target = names(targetIds);
                        const severity = change.severity;
                        const plural = targetIds.length > 1;

                        const keys = plural
                            ? group.keys.flatMap(key => [`${key}.plural`, key])
                            : group.keys;

                        const line = p.resolveNarrative(keys, {
                            target,
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
                    if (outcome.operation === "spawned") {
                        if (!emittedSpawn) {
                            const spawn = spawnNarrative();
                            if (spawn) narratives.push(spawn);
                            emittedSpawn = true;
                        }
                        break;
                    }
                    if (outcome.kind === "character" && outcome.operation === "incapacitated") {
                        tone = "danger";
                    }
                    if (outcome.kind === "character" && outcome.operation === "rescued") {
                        tone = "success";
                    }
                    if (outcome.kind === "enemy" && outcome.operation === "defeated") {
                        tone = "warning";
                    }
                    text = p.entityNarrative(
                        outcome.target,
                        outcome.operation,
                        { target: p.entity(outcome.target) },
                    ) ?? p.resolveNarrative([
                        `${outcome.kind}.narrative.${outcome.operation}`,
                    ], {
                        target: p.entity(outcome.target),
                    });
                    break;
                case "trap": {
                    if (!outcome.triggers.length) break;

                    const actors = names(outcome.triggers.map(trigger => trigger.actor));
                    const severity = outcome.triggers[0]?.severity;

                    text = p.resolveNarrative([
                        ...(severity !== undefined
                            ? [`trap.${outcome.trap}.narrative.triggered.${severity}`]
                            : []),
                        `trap.${outcome.trap}.narrative.triggered`,
                    ], {
                        actor: actors,
                        target: actors,
                        trap: p.trap(outcome.trap),
                        amount: outcome.triggers.reduce((sum, trigger) => sum + trigger.amount, 0),
                    });
                    break;
                }
                case "interrupt": {
                    text = p.resolveNarrative(["ui.gameLog.interrupted"], {
                        reason: p.failure(outcome.reason),
                    });
                    tone = "warning";
                    break;
                }
                case "trapActivation": {
                    narratives.push(...effects(entry, outcome.outcomes, true));
                    break;
                }
                case "bindingTick": {
                    const tick = tickNarrative(outcome);

                    if (tick) {
                        narratives.push(tick);

                        // The authored tick summarizes its ordinary binding changes,
                        // but important secondary state changes still get narrated.
                        narratives.push(...effects(
                            entry,
                            outcome.outcomes.filter(child => child.kind !== "binding"),
                            causalOrder,
                        ));
                    } else {
                        narratives.push(...effects(entry, outcome.outcomes, causalOrder));
                    }

                    break;
                }
            }
            if (text) narratives.push({ ...text, tone });
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

    const unsuppressed = (narratives: StoryNarrative[]): StoryNarrative[] => {
        // Apply every active directive once, including those on suppressed narratives.
        const patterns = narratives.flatMap(narrative => narrative.suppress);
        return narratives.filter(narrative => !patterns.some(pattern => matchesPattern(narrative.key, pattern)));
    };

    const result: StoryLogEntry[] = [];
    let pendingPhase: StoryLogEntry | undefined;

    for (const entry of entries) {
        const outcomes = flatten(entry.outcomes);
        const narratives: StoryNarrative[] = [];
        const trapGroups: LogOutcome[][] = [];
        const moveOutcomes: LogOutcome[] = [];
        for (const outcome of entry.outcomes) {
            if ((entry.kind === "move" || entry.kind === "escape")
                && (outcome.kind === "trapActivation" || outcome.kind === "trap" && outcome.triggers.length > 0)) {
                // Older events lack end markers: keep the trigger visible without
                // claiming unrelated move consequences as part of that trap.
                trapGroups.push(outcome.kind === "trapActivation" ? outcome.outcomes : [outcome]);
            } else moveOutcomes.push(outcome);
        }
        const trapNarratives = trapGroups.map(group => unsuppressed(effects(entry, group, true)));

        if (entry.kind === "move") {
            const text = moveNarrative(entry, moveOutcomes);
            if (text) narratives.push({
                ...text,
                ...(library?.moves[entry.move]?.traits?.includes("onetime")
                    ? { glow: playerTone(entry.actor) } : {}),
            });
        } else if (entry.kind === "escape") {
            const text = outcomes.some(outcome => outcome.kind === "interrupt" && outcome.actor === entry.actor)
                ? undefined : escapeNarrative(entry, flatten(moveOutcomes));
            if (text) narratives.push(text);
        }

        narratives.push(...effects(entry, moveOutcomes));
        const activeNarratives = unsuppressed(narratives);

        // Phase entries must be handled before the empty-paragraph check.
        // Most phases have no narrative of their own and are held until the next
        // visible story entry.
        if (entry.kind === "phase") {
            const title = [
                entry.round === undefined
                    ? undefined
                    : p.ui("battleOverview.round", { round: entry.round }),
                p.ui("battleOverview.phase", { phase: p.phase(entry.phase) }),
            ].filter(Boolean).join(" · ");

            const phase: StoryLogEntry = {
                kind: "phase",
                phase: entry.phase,
                title,
                paragraphs: activeNarratives.map(narrative => ({
                    text: narrative.text,
                    tone: narrative.tone,
                })),
            };

            if (phase.paragraphs.length) {
                result.push(phase);
                pendingPhase = undefined;
            } else {
                pendingPhase = phase;
            }

            continue;
        }

        const paragraphs: StoryLogParagraph[] = [];
        for (const group of trapNarratives) {
            if (!group.length) continue;
            paragraphs.push({
                text: group.map(narrative => narrative.text).join(" "),
                tone: (["danger", "warning", "success"] as const)
                    .find(tone => group.some(narrative => narrative.tone === tone)),
            });
        }
        let normal = "";
        let parts: StoryLogText[] = [];
        const flushNormal = () => {
            if (normal) paragraphs.push({
                text: normal,
                ...(parts.some(part => part.glow) ? { parts } : {}),
            });
            normal = "";
            parts = [];
        };

        for (const narrative of activeNarratives) {
            if (narrative.tone) {
                flushNormal();

                paragraphs.push({
                    text: narrative.text,
                    tone: narrative.tone,
                });
            } else {
                parts.push({
                    text: normal ? ` ${narrative.text}` : narrative.text,
                    ...(narrative.glow ? { glow: narrative.glow } : {}),
                });
                normal = normal
                    ? `${normal} ${narrative.text}`
                    : narrative.text;
            }
        }

        flushNormal();

        if (!paragraphs.length) continue;

        if (pendingPhase) {
            result.push(pendingPhase);
            pendingPhase = undefined;
        }

        result.push({
            kind: entry.kind,
            ...(entry.kind === "move" || entry.kind === "escape"
                ? { actorId: entry.actor }
                : {}),
            paragraphs,
        });
    }

    return result;
}
