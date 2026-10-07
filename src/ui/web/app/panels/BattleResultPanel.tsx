import { For, Show, type JSX } from "solid-js";
import { ScreenLayout } from "../components/ScreenLayout";
import type { BattleResultViewModel } from "../viewModels/battleResult";

export function BattleResultPanel(props: {
    model: BattleResultViewModel;
    onRetry?: () => void;
    onBackToLevelSelect?: () => void;
}): JSX.Element {
    return <ScreenLayout class={"kcq-battle-result kcq-battle-result--" + props.model.outcome}
        ariaLabel={props.model.heading}
        header={<header class="kcq-battle-result__heading" aria-live="polite">
            <h1>{props.model.heading}</h1>
            <p class="kcq-battle-result__encounter">{props.model.encounter} · {props.model.difficulty}</p>
            <Show when={props.model.progress}>{progress => <strong class="kcq-battle-result__progress">{progress()}</strong>}</Show>
            <p class="kcq-battle-result__summary">{props.model.summary}</p>
        </header>}
        body={<dl class="kcq-encounter-card kcq-battle-result__stats">
            <For each={props.model.rows}>{row => <div class="kcq-battle-result__row">
                <dt>{row.label}</dt>
                <dd><strong>{row.value}</strong><Show when={row.detail}>{detail => <span>{detail()}</span>}</Show></dd>
            </div>}</For>
        </dl>}
        footer={<div class="kcq-battle-result__actions">
            <button type="button" class="kcq-battle-result__retry" onClick={props.onRetry}>{props.model.retryLabel}</button>
            <button type="button" class="kcq-battle-result__back" onClick={props.onBackToLevelSelect}>{props.model.backLabel}</button>
        </div>} />;
}
