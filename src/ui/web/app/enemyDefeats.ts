import { createEffect, createSignal } from "solid-js";
import type { EventFrame, GameState } from "../../../engine/public/types";
import type { GameLogPresentationEntry } from "../../presentation/gameLog";
import type { Presentation } from "../../presentation/presentation";
import type { ActiveReaction, createCombatReactions } from "./combatReactions";
import type { EnemyCardData } from "./components/EnemyCard";
import { createEnemyCardViewModel } from "./viewModels/enemyCard";

export interface EnemyPresentationSlot {
    enemy: EnemyCardData;
    defeat?: ActiveReaction;
    finished?: boolean;
}

/** Presentation data only. Expiry and cancellation belong to combat reactions.
 * Completed deaths leave an empty slot until the last retained card finishes. */
export function createEnemyDefeats(reactions: ReturnType<typeof createCombatReactions>) {
    const [retained, setRetained] = createSignal<readonly EnemyPresentationSlot[]>([]);
    const active = (slot: EnemyPresentationSlot) => reactions.cues().some(cue => cue.serial === slot.defeat?.serial);
    createEffect(() => {
        if (!retained().some(active)) setRetained(current => current.length ? [] : current);
    });
    return {
        active: () => retained().some(active),
        remaining: () => Math.max(0, ...retained().filter(active)
            .map(slot => slot.defeat!.started + slot.defeat!.duration - Date.now())),
        present(frames: readonly EventFrame[], before: GameState, presentation: Presentation,
            history: readonly GameLogPresentationEntry[]) {
            const deaths = reactions.cues().filter(cue => cue.kind === "defeat"
                && !retained().some(slot => slot.defeat?.serial === cue.serial));
            if (!deaths.length) return;
            // Preserve the visible order, including deaths from previous steps.
            const slots = [...retained()];
            for (const enemy of before.enemies) {
                if (!slots.some(slot => slot.enemy.id === enemy.id)) slots.push({
                    enemy: createEnemyCardViewModel(enemy, presentation, before.characters, history, before.enemies),
                });
            }
            for (const cue of deaths) {
                // A setup frame can spawn or update an enemy before its killing action.
                const last = [before, ...frames.map(frame => frame.state)].reverse().find(state =>
                    state.enemies.some(enemy => enemy.id === cue.entity));
                const enemy = last?.enemies.find(enemy => enemy.id === cue.entity);
                if (!last || !enemy) continue;
                const slot = { enemy: createEnemyCardViewModel(enemy, presentation, last.characters, history, last.enemies), defeat: cue };
                const index = slots.findIndex(slot => slot.enemy.id === cue.entity);
                if (index < 0) slots.push(slot);
                else slots[index] = slot;
            }
            setRetained(slots);
        },
        slots(live: readonly EnemyCardData[]): readonly EnemyPresentationSlot[] {
            const saved = retained();
            if (!saved.length) return live.map(enemy => ({ enemy }));
            const slots = saved.flatMap(slot => {
                if (slot.defeat) return [{ ...slot, finished: !active(slot) }];
                const enemy = live.find(enemy => enemy.id === slot.enemy.id);
                return enemy ? [{ enemy }] : [];
            });
            return [...slots, ...live.filter(enemy => !saved.some(slot => slot.enemy.id === enemy.id)).map(enemy => ({ enemy }))];
        },
    };
}
