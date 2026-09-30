/** Ordered view of a GameEvent and its owned LeafEvents for behavior assertions. */
import type { ActionResult, EventFrame, GameEvent } from "../../src/engine/public/types";
import { eventEntries } from "../../src/ui/console/eventEntries";

export function resolvedEvents(events: readonly (GameEvent | EventFrame)[]) {
    return eventEntries(events.map((entry) => "event" in entry ? entry.event : entry));
}

/** Readable projections for behavior assertions against the public result. */
export function resultDetails(result: ActionResult) {
    return {
        ...result,
        eventSequence: result.success ? result.frames.map((frame) => frame.event) : undefined,
        finalState: result.success ? result.frames.at(-1)?.state : undefined,
    };
}
