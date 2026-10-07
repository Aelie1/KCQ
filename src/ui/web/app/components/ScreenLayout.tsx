import { Show, type JSX } from "solid-js";

export interface ScreenLayoutProps {
    header: JSX.Element;
    body: JSX.Element;
    footer?: JSX.Element;
    class?: string;
    ariaLabel?: string;
}

/** A viewport-sized screen whose middle row owns all content scrolling. */
export function ScreenLayout(props: ScreenLayoutProps): JSX.Element {
    return (
        <section class={`kcq-screen-layout${props.class ? ` ${props.class}` : ""}`} aria-label={props.ariaLabel}>
            <div class="kcq-screen-layout__header">{props.header}</div>
            <div class="kcq-screen-layout__body">{props.body}</div>
            <Show when={props.footer}>
                <div class="kcq-screen-layout__footer">{props.footer}</div>
            </Show>
        </section>
    );
}
