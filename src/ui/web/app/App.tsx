import { onCleanup, onMount, type JSX } from "solid-js";
import { setupResponsiveScale } from "./responsiveScale";

export interface AppProps {
    children: JSX.Element;
}

export function App(props: AppProps): JSX.Element {
    let shell!: HTMLElement;
    onMount(() => onCleanup(setupResponsiveScale(shell)));
    return <main class="kcq-app" ref={shell}>{props.children}</main>;
}
