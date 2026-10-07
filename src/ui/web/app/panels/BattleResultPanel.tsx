import { createUniqueId, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import type { BattleResultViewModel } from "../viewModels/battleResult";

export function BattleResultPanel(props: {
    model: BattleResultViewModel;
    onRetry?: () => void;
    onBackToLevelSelect?: () => void;
}): JSX.Element {
    const headingId = createUniqueId();
    let stats!: HTMLDListElement;
    let retry!: HTMLButtonElement;
    let back!: HTMLButtonElement;
    onMount(() => {
        const previousFocus = document.activeElement;
        retry.focus();
        onCleanup(() => {
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        });
    });

    const keepFocusInDialog = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
        } else if (event.key === "Tab") {
            if (event.shiftKey && event.target === stats) {
                event.preventDefault();
                back.focus();
            } else if (!event.shiftKey && event.target === back) {
                event.preventDefault();
                stats.focus();
            }
        }
    };

    return <div class="kcq-battle-result__overlay">
        <section class={"kcq-encounter-card kcq-battle-result kcq-battle-result--" + props.model.outcome}
            role="dialog" aria-modal="true" aria-labelledby={headingId} onKeyDown={keepFocusInDialog}>
            <header class="kcq-battle-result__heading">
                <h1 id={headingId}>{props.model.heading}</h1>
                <p class="kcq-battle-result__encounter">{props.model.encounter} · {props.model.difficulty}</p>
                <Show when={props.model.progress}>{progress => <strong class="kcq-battle-result__progress">{progress()}</strong>}</Show>
                <p class="kcq-battle-result__summary">{props.model.summary}</p>
            </header>
            <dl ref={stats} class="kcq-battle-result__stats" tabIndex={0}>
                <For each={props.model.rows}>{row => <div class="kcq-battle-result__row">
                    <dt>{row.label}</dt>
                    <dd><strong>{row.value}</strong><Show when={row.detail}>{detail => <span>{detail()}</span>}</Show></dd>
                </div>}</For>
            </dl>
            <footer class="kcq-battle-result__actions">
                <button ref={retry} type="button" class="kcq-battle-result__retry" onClick={props.onRetry}>{props.model.retryLabel}</button>
                <button ref={back} type="button" class="kcq-battle-result__back" onClick={props.onBackToLevelSelect}>{props.model.backLabel}</button>
            </footer>
        </section>
    </div>;
}
