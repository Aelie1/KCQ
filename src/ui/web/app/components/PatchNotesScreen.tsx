import { createUniqueId, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { setupResponsiveScale } from "../responsiveScale";
import type { PatchNotesViewModel } from "../viewModels/patchNotes";
import type { ViewPreferences } from "../viewPreferences";

export function PatchNotesScreen(props: {
    model: PatchNotesViewModel;
    onClose: () => void;
    viewPreferences?: ViewPreferences;
}): JSX.Element {
    const headingId = createUniqueId();
    let overlay!: HTMLDivElement;
    let viewport!: HTMLDivElement;
    let dialog!: HTMLElement;
    let heading!: HTMLHeadingElement;
    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Tab") {
            const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')];
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
                event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
                event.preventDefault(); first?.focus();
            }
            return;
        }
        if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopImmediatePropagation();
            props.onClose();
        }
    };
    onMount(() => {
        onCleanup(setupResponsiveScale(overlay, props.viewPreferences));
        heading.focus();
        document.addEventListener("keydown", onKeyDown, true);
        onCleanup(() => document.removeEventListener("keydown", onKeyDown, true));
    });
    return <Portal><div ref={overlay} class="kcq-battle-result__overlay kcq-patch-notes__overlay"
        onClick={event => {
            if (event.target === overlay || event.target === viewport) props.onClose();
        }}>
        <div ref={viewport} class="kcq-battle-result__viewport">
            <section ref={dialog} class="kcq-encounter-card kcq-battle-result kcq-patch-notes"
                role="dialog" aria-modal="true" aria-labelledby={headingId}>
                <header class="kcq-patch-notes__header">
                    <h1 ref={heading} id={headingId} tabIndex={-1} class="kcq-battle-settings__heading">{props.model.heading}</h1>
                </header>
                <div class="kcq-patch-notes__history" tabIndex={0} role="region" aria-label={props.model.heading}>
                    <For each={props.model.releases}>{release => <article class="kcq-patch-notes__release">
                        <h2>{release.version}<Show when={release.title}>{title => <>{" \u2014 "}{title()}</>}</Show></h2>
                        <For each={release.sections}>{section => <div class="kcq-patch-notes__section">
                            <Show when={section.heading}>{title => <h3>{title()}</h3>}</Show>
                            <ul><For each={section.bullets}>{bullet => <li>{bullet}</li>}</For></ul>
                        </div>}</For>
                    </article>}</For>
                </div>
                <div class="kcq-battle-result__actions kcq-patch-notes__footer">
                    <button type="button" class="kcq-battle-result__back" onClick={props.onClose}>{props.model.backLabel}</button>
                </div>
            </section>
        </div>
    </div></Portal>;
}
