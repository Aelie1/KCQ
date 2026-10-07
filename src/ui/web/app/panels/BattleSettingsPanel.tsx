import { createUniqueId, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import type { Presentation } from "../../../presentation/presentation";
import type { LanguageSelection } from "../language";
import { setupResponsiveScale } from "../responsiveScale";

export function BattleSettingsPanel(props: {
    presentation: Presentation;
    language?: LanguageSelection;
    returnFocus?: Element | null;
    onResume: () => void;
    showBattleActions?: boolean;
    onRetry?: () => void;
    onBackToLevelSelect?: () => void;
}): JSX.Element {
    const headingId = createUniqueId();
    let overlay!: HTMLDivElement;
    let viewport!: HTMLDivElement;
    let dialog!: HTMLElement;
    let resume!: HTMLButtonElement;

    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            props.onResume();
        } else if (event.key === "Tab") {
            const controls = dialog.querySelectorAll<HTMLElement>("button, select");
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        }
    };

    onMount(() => {
        onCleanup(setupResponsiveScale(overlay));
        const previousFocus = props.returnFocus ?? document.activeElement;
        resume.focus();
        document.addEventListener("keydown", onKeyDown, true);
        onCleanup(() => {
            document.removeEventListener("keydown", onKeyDown, true);
            queueMicrotask(() => {
                if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
            });
        });
    });

    return <Portal><div ref={overlay} class="kcq-battle-result__overlay kcq-battle-settings__overlay"
        onClick={event => {
            if (event.target === overlay || event.target === viewport) props.onResume();
        }}>
        <div ref={viewport} class="kcq-battle-result__viewport">
            <section ref={dialog} class="kcq-encounter-card kcq-battle-result kcq-battle-settings"
                role="dialog" aria-modal="true" aria-labelledby={headingId}>
                <h1 id={headingId} class="kcq-battle-settings__heading">{props.presentation.ui("battleOverview.settings")}</h1>
                <div class="kcq-battle-result__actions">
                    <button ref={resume} type="button" class="kcq-battle-result__retry"
                        onClick={props.onResume}>{props.presentation.ui("battleSettings.resume")}</button>
                </div>
                <label class="kcq-battle-settings__language">
                    <span>{props.presentation.ui("battleSettings.language")}</span>
                    <select value={props.language?.value ?? "en"}
                        onChange={event => props.language?.onChange(event.currentTarget.value)}>
                        <For each={props.language?.options ?? [{ id: "en", label: "English" }]}>
                            {option => <option value={option.id}>{option.label}</option>}
                        </For>
                    </select>
                </label>
                <Show when={props.showBattleActions !== false}>
                    <hr class="kcq-battle-settings__divider" />
                    <div class="kcq-battle-result__actions">
                        <button type="button" class="kcq-battle-result__back"
                            onClick={props.onRetry}>{props.presentation.ui("battleSettings.retry")}</button>
                        <button type="button" class="kcq-battle-result__back"
                            onClick={props.onBackToLevelSelect}>{props.presentation.ui("battleResult.back")}</button>
                    </div>
                </Show>
            </section>
        </div>
    </div></Portal>;
}
