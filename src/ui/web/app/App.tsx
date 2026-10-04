import type { JSX } from "solid-js";

export interface AppProps {
    children: JSX.Element;
}

export function App(props: AppProps): JSX.Element {
    return <main class="kcq-app">{props.children}</main>;
}
