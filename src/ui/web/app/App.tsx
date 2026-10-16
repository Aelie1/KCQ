import { onCleanup, onMount, useContext, type JSX } from "solid-js";
import { setupResponsiveScale } from "./responsiveScale";
import { createViewPreferences, ViewPreferencesContext } from "./viewPreferences";

export interface AppProps {
    children: JSX.Element;
}

export function App(props: AppProps): JSX.Element {
    const preferences = useContext(ViewPreferencesContext) ?? createViewPreferences();
    let shell!: HTMLElement;
    onMount(() => onCleanup(setupResponsiveScale(shell, preferences)));
    return <ViewPreferencesContext.Provider value={preferences}>
        <main class="kcq-app" ref={shell}>{props.children}</main>
    </ViewPreferencesContext.Provider>;
}
