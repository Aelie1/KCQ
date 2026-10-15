import { createEffect, createMemo, For, Show, type JSX } from "solid-js";
import type { EntityId } from "../../../../engine/public/types";
import type { createEnemyDefeats, EnemyPresentationSlot } from "../enemyDefeats";
import type { EnemyCardData } from "./componentTypes";
import { combatShortcut } from "../keyboard";
import { EnemyCard } from "./EnemyCard";

export function BattleEnemyList(props: {
    enemies: readonly EnemyCardData[];
    enemyDefeats?: ReturnType<typeof createEnemyDefeats>;
    shortcuts?: boolean;
    expandedEnemyId?: EntityId;
    renderDetails?: (id: EntityId) => JSX.Element;
    onSelectEnemy?: (id: EntityId) => void;
}): JSX.Element {
    const slots = createMemo<readonly EnemyPresentationSlot[]>(() => props.enemyDefeats?.slots(props.enemies)
        ?? props.enemies.map(enemy => ({ enemy })));
    return (
        <div class="kcq-battle-overview__enemies">
            <For each={slots().map(slot => slot.enemy.id)}>
                {(id, index) => {
                    const slot = () => slots().find(slot => slot.enemy.id === id)!;
                    let element!: HTMLDivElement;
                    createEffect(() => {
                        if (!slot().defeat) return;
                        // Keep the measured grid cell after its card is removed,
                        // so another death cannot move while it is fading.
                        const height = element.offsetHeight;
                        if (height) element.style.height = `${height}px`;
                    });
                    return <div ref={element} class="kcq-enemy-presentation-slot" data-defeated={slot().defeat ? "true" : undefined}>
                        <Show when={!slot().finished}>
                            <EnemyCard enemy={slot().enemy} defeat={slot().defeat}
                                expanded={props.renderDetails ? props.expandedEnemyId === id : undefined}
                                shortcut={props.shortcuts === false ? undefined : combatShortcut(index() + 3)}
                                onSelect={!slot().defeat && props.onSelectEnemy ? () => props.onSelectEnemy?.(id) : undefined} />
                        </Show>
                        <Show when={props.expandedEnemyId === id}>{props.renderDetails?.(id)}</Show>
                    </div>;
                }}
            </For>
        </div>
    );
}
