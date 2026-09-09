import type { Effect, GameEvent, Intention } from "../engine/types";

export function formatEffect(effect: Effect, includeTarget = false): string {
    const target = includeTarget ? `${effect.target} ` : "";

    switch (effect.type) {
        case "damage":
            return `${target}${effect.amount} damage`;
        case "binding":
            return `${target}${effect.binding} ${signed(effect.amount)}`;
        case "buff":
            return `${target}${effect.buff} added`;
    }
}

export function formatIntention(intention: Intention): string[] {
    const lines = [`  Intent: ${intention.move}`];

    for (const target of intention.targets) {
        const effects = target.effects.map((effect) => formatEffect(effect)).join(", ");
        lines.push(
            `    ${target.target.padEnd(12)} ${target.result.toUpperCase().padEnd(6)}`
            + (effects ? ` ${effects}` : ""),
        );
    }

    for (const effect of intention.effects) {
        lines.push(`    + ${formatEffect(effect, true)}`);
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
            case "damage":
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
            case "enemySpawned":
                return [`${event.target} appeared.`];
            case "enemyDefeated":
                return [`${event.target} was defeated.`];
            case "stanceChanged":
                return [`${event.actor} changed stance to ${event.stance}.`];
            case "encounter":
                return [event.success
                    ? `Encounter ${event.id} began.`
                    : `Could not load encounter ${event.id}.`];
        }
    });
}

function signed(value: number): string {
    return value >= 0 ? `+${value}` : String(value);
}
