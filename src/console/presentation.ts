import type {
    AccuracyProfile,
    BindingLevel,
    EntityId,
    GameEvent,
    LeafEvent,
    HitBand,
    Phase,
    PlayerAction,
} from "../engine/public/types";
import { eventEntries } from "./eventEntries";

export const PRESENTATION_TIMING = {
    highlightMs: 2000,
    enemyPhaseTargetMs: 3200,
    enemyActionMinMs: 250,
    enemyActionMaxMs: 750,
} as const;

export type SemanticStyle =
    | "actor-ko"
    | "actor-matsuko"
    | "actor-hinari"
    | "actor-enemy"
    | `intent-${Exclude<HitBand, "none">}`
    | `binding-${BindingLevel}`
    | "accuracy-good"
    | "accuracy-caution"
    | "accuracy-poor"
    | "accuracy-very-poor"
    | "encounter-separator"
    | "phase-separator"
    | "current-log-action"
    | "transient-highlight";

export interface StyleSpan {
    start: number;
    end: number;
    style: SemanticStyle;
}

export interface StyledText {
    text: string;
    spans: StyleSpan[];
}

export interface StyledLine {
    text: string;
    style?: SemanticStyle;
}

export type HighlightTarget =
    | { kind: "binding"; entity: EntityId; binding: string }
    | { kind: "buff"; entity: EntityId; buff: string }
    | { kind: "cooldown"; entity: EntityId; move: string }
    | { kind: "hp"; entity: EntityId }
    | { kind: "trap"; trap: string }
    | { kind: "stance"; entity: EntityId };

export interface ActionGroup {
    kind: "action" | "phase" | "system";
    actor?: EntityId;
    phase?: Phase;
    lines: StyledLine[];
    highlights: HighlightTarget[];
}

/** Assigns fixed party colors and a shared enemy color without putting ANSI in model text. */
export class ActorStyleRegistry {
    private readonly styles = new Map<EntityId, SemanticStyle>();

    constructor(actors: readonly EntityId[] = []) {
        actors.forEach((actor) => this.styleFor(actor));
    }

    styleFor(actor: EntityId): SemanticStyle {
        const existing = this.styles.get(actor);
        if (existing) return existing;
        const style: SemanticStyle = actor === "ko"
            ? "actor-ko"
            : actor === "matsuko"
                ? "actor-matsuko"
                : actor === "hinari"
                    ? "actor-hinari"
                    : "actor-enemy";
        this.styles.set(actor, style);
        return style;
    }

    snapshot(): Readonly<Record<EntityId, SemanticStyle>> {
        return Object.fromEntries(this.styles);
    }
}

export function intentOutcomeStyle(band: HitBand): SemanticStyle | undefined {
    return band === "none" ? undefined : `intent-${band}`;
}

export function bindingSeverityStyle(level: BindingLevel): SemanticStyle | undefined {
    return level === "none" ? undefined : `binding-${level}`;
}

export function accuracyQualityStyle(profile: AccuracyProfile | null): SemanticStyle | undefined {
    if (!profile) return undefined;
    const quality = (profile.hit ?? 0) + (profile.crit ?? 0);
    if (quality >= 65) return "accuracy-good";
    if (quality >= 50) return "accuracy-caution";
    if (quality >= 30) return "accuracy-poor";
    return "accuracy-very-poor";
}

export function enemyPlaybackDelay(actionCount: number): number {
    if (actionCount <= 0) return 0;
    return Math.max(
        PRESENTATION_TIMING.enemyActionMinMs,
        Math.min(
            PRESENTATION_TIMING.enemyActionMaxMs,
            Math.round(PRESENTATION_TIMING.enemyPhaseTargetMs / actionCount),
        ),
    );
}

export async function playActionGroups(
    groups: readonly ActionGroup[],
    delayMs: number,
    present: (group: ActionGroup, index: number) => void | Promise<void>,
    wait: (milliseconds: number) => Promise<void> = defaultDelay,
): Promise<void> {
    const hasEnemyAction = groups.some((group) =>
        group.kind === "action" && group.phase === "enemy");
    for (const [index, group] of groups.entries()) {
        await present(group, index);
        if (
            (group.kind === "phase" && group.phase === "enemy" && hasEnemyAction)
            || (group.kind === "action" && group.phase === "enemy")
        ) {
            await wait(delayMs);
        }
    }
}

export function phaseSeparator(phase: Phase, round = 1): StyledLine {
    return {
        text: `========== ${phase.toUpperCase()} PHASE - ${round} ==========`,
        style: "phase-separator",
    };
}

export function encounterSeparator(encounter: string): StyledLine {
    return {
        text: `############### Encounter: ${encounter} ###############`,
        style: "encounter-separator",
    };
}

export function formatActionGroups(
    action: PlayerAction | undefined,
    events: readonly GameEvent[],
    registry: ActorStyleRegistry = new ActorStyleRegistry(),
    startingRound = 1,
): ActionGroup[] {
    const groups: ActionGroup[] = [];
    let current: ActionGroup | undefined;
    let phase: Phase = "player";
    let round = startingRound;
    let sawMoveUsed = false;
    let syntheticInterruptedAction = false;
    const fallbackActor = action && "actor" in action ? action.actor : undefined;

    const flush = (): void => {
        if (current && current.lines.length > 0) groups.push(current);
        current = undefined;
    };
    const beginAction = (actor: EntityId, firstLine?: string): ActionGroup => {
        flush();
        const style = registry.styleFor(actor);
        current = {
            kind: "action",
            actor,
            phase,
            lines: firstLine ? [{ text: firstLine, style }] : [],
            highlights: [],
        };
        return current;
    };

    if (action?.type === "escape") {
        beginAction(action.actor, `${action.actor} tried to escape ${action.binding} on ${action.target}.`);
    }

    for (const event of eventEntries(events)) {
        if (event.type === "changePhase") {
            flush();
            if (event.phase === "player" && phase === "enemy") round += 1;
            phase = event.phase;
            groups.push({
                kind: "phase",
                phase,
                lines: [phaseSeparator(phase, round)],
                highlights: [],
            });
            continue;
        }

        if (event.type === "useMove") {
            sawMoveUsed = true;
            const interrupted = event.effects.some((effect) => effect.type === "actionInterrupted");
            const group = beginAction(event.actor, interrupted
                ? `${event.actor} attempted ${event.move}.`
                : formatEvent(event));
            if (event.targets.length > 1) {
                const style = registry.styleFor(event.actor);
                group.lines.push(...event.targets.map((target) => ({
                    text: `  -> ${target.target}: ${target.result.toUpperCase()}`,
                    style,
                })));
            }
            group.highlights.push({ kind: "cooldown", entity: event.actor, move: event.move });
            continue;
        }

        if (!current && fallbackActor) beginAction(fallbackActor);
        if (!current) {
            current = { kind: "system", phase, lines: [], highlights: [] };
        }
        if (event.type === "enemySpawned") registry.styleFor(event.target);

        if (
            event.type === "actionInterrupted"
            && action?.type === "move"
            && !sawMoveUsed
            && current.kind === "action"
            && !syntheticInterruptedAction
        ) {
            const style = registry.styleFor(action.actor);
            current.lines = [
                { text: `${action.actor} attempted ${action.move}.`, style },
                ...current.lines.map((existing) => ({
                    ...existing,
                    text: existing.text.startsWith("  ↳ ") ? existing.text : `  ↳ ${existing.text}`,
                })),
            ];
            syntheticInterruptedAction = true;
        }

        const line = formatEvent(event);
        if (line) {
            const style = current.actor ? registry.styleFor(current.actor) : undefined;
            const isConsequence = current.kind === "action" && current.lines.length > 0;
            current.lines.push({ text: `${isConsequence ? "  ↳ " : ""}${line}`, style });
        }
        if (!("effects" in event)) current.highlights.push(...deriveHighlightTargets([event]));
    }

    flush();
    return groups;
}

export function flattenGroups(groups: readonly ActionGroup[]): StyledLine[] {
    return groups.flatMap((group) => group.lines);
}

export function deriveHighlightTargets(events: readonly (GameEvent | LeafEvent)[]): HighlightTarget[] {
    const targets: HighlightTarget[] = [];
    for (const event of events.flatMap((entry) => "effects" in entry ? eventEntries([entry]) : [entry])) {
        switch (event.type) {
            case "useMove":
                targets.push({ kind: "cooldown", entity: event.actor, move: event.move });
                break;
            case "bondageAdded":
            case "bondageChanged":
            case "bondageRemoved":
            case "bondageBlocked":
                targets.push({ kind: "binding", entity: event.target, binding: event.binding });
                break;
            case "buffAdded":
            case "buffUpdated":
            case "buffRemoved":
                targets.push({ kind: "buff", entity: event.target, buff: event.buff });
                break;
            case "enemySpawned":
                targets.push({ kind: "hp", entity: event.target });
                break;
            case "enemyDefeated":
                break;
            case "enemyDamaged":
            case "enemyHealed":
            case "damageBlocked":
                targets.push({ kind: "hp", entity: event.target });
                break;
            case "cooldownChanged":
                targets.push({ kind: "cooldown", entity: event.target, move: event.move });
                break;
            case "trapAdded":
            case "trapRemoved":
            case "trapTriggered":
                targets.push({ kind: "trap", trap: event.trap });
                break;
            case "stanceSet":
                targets.push({ kind: "stance", entity: event.actor });
                break;
        }
    }
    return uniqueHighlights(targets);
}

export function formatEvent(event: GameEvent | LeafEvent): string {
    switch (event.type) {
        case "useMove":
            if (event.targets.length === 0) return `${event.actor} used ${event.move}.`;
            if (event.targets.length === 1) {
                const target = event.targets[0];
                return `${event.actor} used ${event.move} on ${target.target}: ${target.result.toUpperCase()}`;
            }
            return `${event.actor} used ${event.move}.`;
        case "enemyDamaged": return `${event.target} took ${event.amount} damage.`;
        case "enemyHealed": return `${event.target} healed ${event.amount} damage.`;
        case "damageBlocked": return `${event.target} blocked ${event.amount} damage.`;
        case "bondageAdded":
        case "bondageChanged":
            return event.amount >= 0
                ? `${event.target} gained ${event.amount} ${event.binding}.`
                : `${event.target} removed ${Math.abs(event.amount)} ${event.binding}.`;
        case "bondageBlocked": return `${event.target} blocked ${event.amount} ${event.binding}.`;
        case "bondageRemoved": return `${event.target} escaped ${event.binding} (${Math.abs(event.amount)} removed).`;
        case "changePhase": return phaseSeparator(event.phase).text;
        case "buffAdded": return `${event.target} gained ${event.buff}.`;
        case "buffRemoved": return `${event.buff} expired on ${event.target}.`;
        case "buffUpdated": return `${event.buff} refreshed on ${event.target}.`;
        case "enemySpawned": return `${event.target} appeared.`;
        case "enemyDefeated": return `${event.target} was defeated.`;
        case "stanceSet": return `${event.actor} changed stance to ${event.stance}.`;
        case "cooldownChanged": return `${event.target}'s ${event.move} cooldown changed to ${event.value}.`;
        case "loadEncounter": return event.success ? `Encounter ${event.id} began.` : `Could not load encounter ${event.id}.`;
        case "loadCharacter": return event.success ? `Character ${event.id} loaded.` : `Could not load character ${event.id}.`;
        case "trapAdded": return `${event.actor} created ${event.amount} ${plural(event.trap, event.amount)}.`;
        case "trapRemoved": return `${event.actor} removed ${event.amount} ${plural(event.trap, event.amount)}.`;
        case "trapTriggered": return `${event.actor} triggered ${event.amount} ${plural(event.trap, event.amount)}.`;
        case "actionInterrupted": return `${event.actor}'s action was interrupted due to ${event.reason}.`;
        case "actionRefreshed": return `${event.target}'s action was refreshed.`;
        case "intentionCancelled": return `${event.target}'s action was cancelled.`;
        case "intentionWeakened": return `${event.target}'s action was weakened.`;
        case "targetChanged": return `${event.target}'s action's target was changed to ${event.destination}.`;
        case "useEscape":
        case "changeStance": return "";
    }
}

function plural(value: string, amount: number): string {
    return `${value}${amount > 1 ? "s" : ""}`;
}

function uniqueHighlights(targets: HighlightTarget[]): HighlightTarget[] {
    const seen = new Set<string>();
    return targets.filter((target) => {
        const key = JSON.stringify(target);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function defaultDelay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
