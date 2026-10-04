import { For, Show, type JSX } from "solid-js";
import type { EnemyCardEnemy, EnemyCardIntentions } from "./componentTypes";
import { IntentRow } from "./IntentRow";

export type { EnemyCardEnemy, EnemyCardIntentions } from "./componentTypes";

export interface EnemyCardProps {
    enemy: EnemyCardEnemy;
    intentions: EnemyCardIntentions;
    name: string;
}

export function EnemyCard(props: EnemyCardProps): JSX.Element {
    return (
        <article class="kcq-enemy-card" aria-label={props.name}>
            <header class="kcq-enemy-card__header">
                <h3 class="kcq-enemy-card__name" title={props.name}>{props.name}</h3>
                <p class="kcq-enemy-card__hp">
                    {props.enemy.currHp} / {props.enemy.maxHp}
                </p>
            </header>
            <For each={props.intentions}>
                {(intent) => <IntentRow intent={intent} />}
            </For>
            <Show when={props.intentions.length === 1}>
                <div class="kcq-enemy-card__empty-intent" aria-hidden="true" />
            </Show>
        </article>
    );
}
