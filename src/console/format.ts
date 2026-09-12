import type { Buff, Effect, GameEvent, Intention, ModifierId } from "../engine/types";

export function formatEffect(effect: Effect, includeTarget = false): string {
    const target = includeTarget ? `${effect.target} ` : "";

    switch (effect.type) {
        case "damage":
            return `${target}${effect.amount} damage`;
        case "binding":
            return `${target}${effect.binding} ${signed(effect.amount)}`;
        case "buff":
            return `${target}${effect.buff} added`;
        case "enemy":
            return `${target}${effect.target} spawned`;
        }
}

export function formatEffects(effects: Effect[], includeTarget = false): string[] {
    const groupedBindings = new Map<string, Extract<Effect, { type: "binding" }>[]>();
    const entries: ({ type: "binding"; key: string } | { type: "effect"; effect: Effect })[] = [];

    for (const effect of effects) {
        if (effect.type !== "binding") {
            entries.push({ type: "effect", effect });
            continue;
        }

        const key = `${effect.target}\0${effect.amount}`;
        const group = groupedBindings.get(key);
        if (group) {
            group.push(effect);
        } else {
            groupedBindings.set(key, [effect]);
            entries.push({ type: "binding", key });
        }
    }

    return entries.map((entry) => {
        if (entry.type === "effect") return formatEffect(entry.effect, includeTarget);

        const group = groupedBindings.get(entry.key)!;
        const first = group[0];
        const target = includeTarget ? `${first.target} ` : "";
        return `${target}${group.map((effect) => effect.binding).join(", ")} ${signed(first.amount)}`;
    });
}

export function formatBuff(buff: Buff): string {
    const details: string[] = [];

    if (!buff.active) details.push("pending");
    if (buff.duration !== undefined) {
        details.push(`${buff.duration} round${buff.duration === 1 ? "" : "s"}`);
    }
    if (buff.linkedEntity !== undefined) details.push(`linked: ${buff.linkedEntity}`);
    for (const status of buff.statuses ?? []) {
        details.push(status.value === 1
            ? titleCase(status.id)
            : `${titleCase(status.id)} ${status.value}`);
    }
    for (const [modifier, amount] of Object.entries(buff.modifiers ?? {})) {
        details.push(`${modifierLabel(modifier as ModifierId)} ${signed(amount)}`);
    }

    return `${displayName(buff.id)}${details.map((detail) => ` (${detail})`).join("")}`;
}

function titleCase(value: string): string {
    return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1).toLowerCase();
}

export function formatIntention(intention: Intention, width?: number): string[] {
    const lines = [`  Intent: ${intention.move}`];

    for (const target of intention.targets) {
        const effects = formatEffects(target.effects).join(", ");
        const prefix = `    ${target.target.padEnd(12)} ${target.band.toUpperCase().padEnd(6)}`;
        lines.push(...formatIntentionLine(`${prefix} `, effects, width));
    }

    for (const effect of formatEffects(intention.effects, true)) {
        lines.push(...formatIntentionLine("    + ", effect, width));
    }

    return lines;
}

function formatIntentionLine(prefix: string, value: string, width?: number): string[] {
    if (!value) return [prefix.slice(0, -1)];
    if (width === undefined || prefix.length + value.length <= width) return [`${prefix}${value}`];

    const continuation = " ".repeat(prefix.length);
    const lines: string[] = [];
    let remaining = value;

    while (remaining.length > 0) {
        const linePrefix = lines.length === 0 ? prefix : continuation;
        const available = Math.max(1, width - linePrefix.length);
        if (remaining.length <= available) {
            lines.push(`${linePrefix}${remaining}`);
            break;
        }

        const comma = remaining.lastIndexOf(", ", available - 1);
        const space = remaining.lastIndexOf(" ", available);
        const split = comma >= 0 ? comma + 1 : space > 0 ? space : available;
        lines.push(`${linePrefix}${remaining.slice(0, split).trimEnd()}`);
        remaining = remaining.slice(split).trimStart();
    }

    return lines;
}

export function formatEvents(events: GameEvent[]): string[] {
    return events.flatMap((event) => {
        switch (event.type) {
            case "moveUsed": {
                if (event.targets.length === 0) {
                    return [`${event.actor} used ${event.move}.`];
                }
                if (event.targets.length === 1) {
                    const target = event.targets[0];
                    return [
                        `${event.actor} used ${event.move} on ${target.target}: ${target.result.toUpperCase()}`,
                    ];
                }
                return [
                    `${event.actor} used ${event.move}.`,
                    ...event.targets.map(
                        (target) => `  -> ${target.target}: ${target.result.toUpperCase()}`,
                    ),
                ];
            }
            case "enemyDamaged":
                return [`${event.target} took ${event.amount} damage.`];
            case "bondageAdded":
            case "bondageChanged":
                return event.amount >= 0
                    ? [`${event.target} gained ${event.amount} ${event.binding}.`]
                    : [`${event.target} removed ${Math.abs(event.amount)} ${event.binding}.`];
            case "bondageRemoved":
                return [
                    `${event.target} escaped ${event.binding} (${Math.abs(event.amount)} removed).`,
                ];
            case "phaseChanged":
                return [event.phase === "enemy" ? "Enemy phase." : "Player phase."];
            case "buffAdded":
                return [`${event.target} gained ${event.buff}.`];
            case "buffRemoved":
                return [`${event.buff} expired on ${event.target}.`];
            case "buffUpdated":
                return [`${event.buff} refreshed on ${event.target}.`];
            case "enemySpawned":
                return [`${event.target} appeared.`];
            case "enemyDefeated":
                return [`${event.target} was defeated.`];
            case "stanceChanged":
                return [`${event.actor} changed stance to ${event.stance}.`];
            case "cooldownChanged":
                return [`${event.target}'s ${event.move} cooldown changed to ${event.value}.`];
            case "encounterLoad":
                return [event.success
                    ? `Encounter ${event.id} began.`
                    : `Could not load encounter ${event.id}.`];
        }
    });
}

function signed(value: number): string {
    return value >= 0 ? `+${value}` : String(value);
}

function displayName(value: string): string {
    const spaced = value
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[-_]+/g, " ");
    return spaced.length === 0 ? spaced : spaced[0].toUpperCase() + spaced.slice(1);
}

function modifierLabel(modifier: ModifierId): string {
    const labels: Record<ModifierId, string> = {
        hitarms: "Arms Hit",
        hitmouth: "Mouth Hit",
        hitlegs: "Legs Hit",
        hit: "Hit",
        defense: "Def",
        escape: "Escape",
        effect: "Effect",
        potency: "Potency",
        traps: "Traps",
        willpower: "Willpower",
        spread: "Spread",
    };
    return labels[modifier];
}
