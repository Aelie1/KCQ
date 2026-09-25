import type { GameEvent, LeafEvent } from "../engine/public/types";

/** Events in the order the engine resolved them, for console rendering. */
export function eventEntries(events: readonly GameEvent[]): Array<GameEvent | LeafEvent> {
    const entries: Array<GameEvent | LeafEvent> = [];
    for (const event of events) {
        entries.push(event);
        if (event.type === "useMove") {
            for (const target of event.targets) entries.push(...target.effects);
        }
        entries.push(...event.effects);
    }
    return entries;
}
