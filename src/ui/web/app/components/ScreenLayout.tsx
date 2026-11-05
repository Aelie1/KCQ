import { Show, type JSX } from "solid-js";

export interface ScreenLayoutProps {
    header?: JSX.Element;
    body?: JSX.Element;
    footer?: JSX.Element;
    class?: string;
    ariaLabel?: string;
}

/** A viewport-sized screen with a constrained middle row for scrollable content. */
export function ScreenLayout(props: ScreenLayoutProps): JSX.Element {
    // Reuse each Show value: reading a JSX prop again can construct a second tree
    // with detached components and duplicate effects (including log observers).
    return (
        <section class={`kcq-screen-layout${props.class ? ` ${props.class}` : ""}`} aria-label={props.ariaLabel}>
            <Show when={props.header}>
                {header => <div class="kcq-screen-layout__header">{header()}</div>}
            </Show>
            <Show when={props.body}>
                {body => <div class="kcq-screen-layout__body">
                    <div class="kcq-screen-layout__content">{body()}</div>
                </div>}
            </Show>
            <Show when={props.footer}>
                {footer => <div class="kcq-screen-layout__footer">{footer()}</div>}
            </Show>
        </section>
    );
}
