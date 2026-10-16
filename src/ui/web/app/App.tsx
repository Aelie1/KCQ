import { createSignal, onCleanup, onMount, useContext, type JSX } from "solid-js";
import { ResponsiveLayoutContext, setupResponsiveScale, type ResponsiveLayout } from "./responsiveScale";
import { createViewPreferences, ViewPreferencesContext } from "./viewPreferences";

export interface AppProps {
    children: JSX.Element;
}

export function App(props: AppProps): JSX.Element {
    const preferences = useContext(ViewPreferencesContext) ?? createViewPreferences();
    const [layout, setLayout] = createSignal<ResponsiveLayout>({ columns: 1, zoom: 1 });
    let shell!: HTMLElement;
    onMount(() => onCleanup(setupResponsiveScale(shell, preferences, setLayout)));
    return <ViewPreferencesContext.Provider value={preferences}>
        <ResponsiveLayoutContext.Provider value={layout}>
            <main class="kcq-app" ref={shell}>{props.children}</main>
        </ResponsiveLayoutContext.Provider>
    </ViewPreferencesContext.Provider>;
}
