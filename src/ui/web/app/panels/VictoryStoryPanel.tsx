import { createUniqueId, onCleanup, onMount, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { setupResponsiveScale } from "../responsiveScale";
import type { VictoryStoryViewModel } from "../viewModels/victoryStory";

export function VictoryStoryPanel(props: {
    model: VictoryStoryViewModel;
    onContinue: () => void;
}): JSX.Element {
    const headingId = createUniqueId();
    const narrativeId = createUniqueId();
    let overlay!: HTMLDivElement;
    let narrative!: HTMLParagraphElement;
    let continueButton!: HTMLButtonElement;
    onMount(() => {
        onCleanup(setupResponsiveScale(overlay));
        const previousFocus = document.activeElement;
        continueButton.focus();
        onCleanup(() => {
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        });
    });

    const keepFocusInDialog = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
        } else if (event.key === "Tab") {
            if (event.shiftKey && event.target === narrative) {
                event.preventDefault();
                continueButton.focus();
            } else if (!event.shiftKey && event.target === continueButton) {
                event.preventDefault();
                narrative.focus();
            }
        }
    };

    return <Portal><div ref={overlay} class="kcq-battle-result__overlay kcq-outcome__overlay">
        <div class="kcq-battle-result__viewport">
            <section class={"kcq-encounter-card kcq-battle-result kcq-victory-story kcq-battle-result--" + props.model.outcome}
                role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={narrativeId}
                onKeyDown={keepFocusInDialog}>
                <header class="kcq-battle-result__heading">
                    <h1 id={headingId}>{props.model.heading}</h1>
                    <p class="kcq-battle-result__encounter">{props.model.encounter}</p>
                </header>
                <p ref={narrative} id={narrativeId} class="kcq-victory-story__narrative" tabIndex={0}>{props.model.narrative}</p>
                <footer class="kcq-battle-result__actions">
                    <button ref={continueButton} type="button" class="kcq-battle-result__retry kcq-victory-story__continue"
                        onClick={props.onContinue}>{props.model.continueLabel}</button>
                </footer>
            </section>
        </div>
    </div></Portal>;
}
