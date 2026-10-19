import { createMemo, createUniqueId, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { setupResponsiveScale } from "../responsiveScale";
import type { BattleResultStatId, BattleResultViewModel } from "../viewModels/battleResult";

const headlineIds: readonly BattleResultStatId[] = ["bindings", "hits", "escapes"];

export function BattleResultPanel(props: {
    model: BattleResultViewModel;
    onRetry?: () => void;
    onNextLevel?: () => void;
    onGameLog?: () => void;
    focusGameLog?: boolean;
    onBackToLevelSelect?: () => void;
    onBackToTitle?: () => void;
}): JSX.Element {
    const headingId = createUniqueId();
    let overlay!: HTMLDivElement;
    let dialog!: HTMLElement;
    let stats!: HTMLDivElement;
    let gameLog: HTMLButtonElement | undefined;
    const headlines = createMemo(() => headlineIds.flatMap(id => props.model.rows.filter(row => row.id === id)));
    const details = createMemo(() => props.model.rows.flatMap(row => headlineIds.includes(row.id)
        ? row.detail ? [{ ...row, value: row.detail, detail: undefined }] : []
        : [row]));
    const controls = (): HTMLElement[] => [...dialog.querySelectorAll<HTMLElement>('[tabindex="0"], button:not(:disabled)')];
    onMount(() => {
        onCleanup(setupResponsiveScale(overlay));
        const previousFocus = document.activeElement;
        const primary = dialog.querySelector<HTMLElement>(".kcq-battle-result__primary");
        (props.focusGameLog && gameLog ? gameLog : primary ?? gameLog ?? stats).focus();
        onCleanup(() => {
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        });
    });

    const keepFocusInDialog = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
        } else if (event.key === "Tab") {
            const items = controls();
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && event.target === first) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && event.target === last) {
                event.preventDefault();
                first?.focus();
            }
        }
    };

    return <Portal><div ref={overlay} class="kcq-battle-result__overlay kcq-outcome__overlay kcq-battle-result-summary__overlay">
        <div class="kcq-battle-result__viewport">
            <section ref={dialog} class={"kcq-encounter-card kcq-battle-result kcq-battle-result-panel kcq-battle-result--" + props.model.outcome}
                role="dialog" aria-modal="true" aria-labelledby={headingId} onKeyDown={keepFocusInDialog}>
                <header class="kcq-battle-result__heading">
                    <h1 id={headingId}>{props.model.heading}</h1>
                    <p class="kcq-battle-result__encounter">{props.model.encounter} · {props.model.difficulty}</p>
                    <Show when={props.model.progress}>{progress => <strong class="kcq-battle-result__progress">{progress()}</strong>}</Show>
                    <p class="kcq-battle-result__summary">{props.model.summary}</p>
                </header>
                <div ref={stats} class="kcq-battle-result__stats" tabIndex={0}>
                    <dl class="kcq-battle-result__headlines">
                        <For each={headlines()}>{row => <div class="kcq-battle-result__stat" data-stat-id={row.id}>
                            <dt>{row.label}</dt><dd>{row.value}</dd>
                        </div>}</For>
                    </dl>
                    <Show when={details().length > 0}>
                        <dl class="kcq-battle-result__details">
                            <For each={details()}>{row => <div class="kcq-battle-result__detail-row">
                                <span class="kcq-battle-result__detail-label">{row.label}</span>
                                <span class="kcq-battle-result__detail-value">
                                    {row.detail ?? row.value}
                                </span>
                            </div>}</For>
                        </dl>
                    </Show>
                </div>
                <footer class="kcq-battle-result__actions">
                    <Show when={props.model.outcome === "victory" && props.model.nextEncounter && props.onNextLevel}>
                        <button type="button" class="kcq-battle-result__next kcq-battle-result__primary" onClick={props.onNextLevel}>{props.model.nextLevelLabel}</button>
                    </Show>
                    <Show when={props.model.outcome === "defeat"}>
                        <button type="button" class="kcq-battle-result__retry kcq-battle-result__primary" onClick={props.onRetry}>{props.model.retryLabel}</button>
                    </Show>
                    <Show when={props.onGameLog}><button ref={gameLog} type="button" class="kcq-battle-result__log" onClick={props.onGameLog}>{props.model.gameLogLabel}</button></Show>
                    <button type="button" class="kcq-battle-result__back" onClick={props.onBackToLevelSelect}>{props.model.backLabel}</button>
                    <button type="button" class="kcq-battle-result__title" onClick={props.onBackToTitle}>{props.model.backToTitleLabel}</button>
                </footer>
            </section>
        </div>
    </div></Portal>;
}
