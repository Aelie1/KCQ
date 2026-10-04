import type { JSX } from "solid-js";
import { PanelHeader } from "../components/PanelHeader";

export interface PlaceholderPanelProps {
    title: string;
}

export function PlaceholderPanel(props: PlaceholderPanelProps): JSX.Element {
    return (
        <section class="kcq-panel">
            <PanelHeader
                eyebrow="Gallery placeholder"
                title={props.title}
                description="This panel is reserved for a later UI implementation card."
            />
            <p class="kcq-placeholder-note">
                The development switcher is working. No game behavior is connected here yet.
            </p>
        </section>
    );
}
