import { For, Show, type JSX } from "solid-js";
import type { EnemyCardData } from "./componentTypes";
import { IntentRow } from "./IntentRow";
import { LinkedEntityChip } from "./LinkedEntityChip";
import { StatusChip } from "./StatusChip";

export type { EnemyCardData } from "./componentTypes";

export interface EnemyCardProps {
    enemy: EnemyCardData;
}

export function EnemyCard(props: EnemyCardProps): JSX.Element {
    return (
        <article class="kcq-enemy-card" aria-label={props.enemy.name}>
            <header class="kcq-enemy-card__header">
                <h3 class="kcq-enemy-card__name" title={props.enemy.name}>{props.enemy.name}</h3>
                <p class="kcq-enemy-card__hp">
                    {props.enemy.currentHp} / {props.enemy.maxHp}
                </p>
            </header>
            <Show when={props.enemy.linkedEntities.length > 0}>
                <div class="kcq-enemy-card__links">
                    <For each={props.enemy.linkedEntities}>
                        {(link) => <LinkedEntityChip link={link} />}
                    </For>
                </div>
            </Show>
            <div class="kcq-enemy-card__intentions">
                <For each={props.enemy.visibleIntentions}>
                    {(intent, index) => (
                        <div class="kcq-enemy-card__intent-slot">
                            <IntentRow intent={intent} />
                            <Show when={index() === props.enemy.visibleIntentions.length - 1 && props.enemy.overflowCount > 0}>
                                <span
                                    class="kcq-enemy-card__overflow"
                                    aria-label={props.enemy.overflowAriaLabel}
                                >
                                    <StatusChip tone="neutral" size="compact">
                                        {props.enemy.overflowLabel}
                                    </StatusChip>
                                </span>
                            </Show>
                        </div>
                    )}
                </For>
            </div>
        </article>
    );
}
