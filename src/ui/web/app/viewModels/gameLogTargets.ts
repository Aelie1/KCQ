import type { Presentation } from "../../../presentation/presentation";
import type { GameLogValue } from "./gameLog";
import { playerTone } from "./linkedEntities";

/** Shared localized recipient list, including semantic colors and optional side labels. */
export function formatGameLogTargets(
    ids: readonly string[], p: Presentation, party: readonly string[] = [], enemies: readonly string[] = [],
    linked = false, collapseSide = true,
): GameLogValue {
    if (collapseSide && !linked && ids.length > 1) {
        const side = [
            { ids: party, label: "gameLog.allies" },
            { ids: enemies, label: "gameLog.enemies" },
        ].find(side => ids.length === side.ids.length && side.ids.every(id => ids.includes(id)));
        if (side) {
            const text = p.ui(side.label);
            return { text, parts: [{ text, tone: "muted" }] };
        }
    }
    return ids.map(id => {
        const name = { text: p.entity(id), tone: "entity-" + playerTone(id) };
        return { ...name, parts: [name] };
    }).reduce<GameLogValue>((first, second) => {
        if (!first.text) return second;
        const slots: Record<string, GameLogValue> = { first, second };
        const parts = p.ui(linked ? "gameLog.linkedTargets" : "gameLog.targetList", {
            first: "\uE000first\uE001", second: "\uE000second\uE001",
        }).split(/(\uE000[^\uE001]+\uE001)/).filter(Boolean).flatMap(text => {
            const slot = slots[text.slice(1, -1)];
            return text.startsWith("\uE000") && slot ? slot.parts ?? [slot] : [{ text, tone: "muted" }];
        });
        return { text: parts.map(part => part.text).join(""), parts };
    }, { text: "" });
}
