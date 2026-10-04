import type { JSX } from "solid-js";

export interface PanelHeaderProps {
    eyebrow?: string;
    titleId?: string;
    title: string;
    description: string;
}

export function PanelHeader(props: PanelHeaderProps): JSX.Element {
    return (
        <header class="kcq-panel-header">
            {props.eyebrow && <p class="kcq-panel-eyebrow">{props.eyebrow}</p>}
            <h1 id={props.titleId} class="kcq-panel-title">{props.title}</h1>
            <p class="kcq-panel-description">{props.description}</p>
        </header>
    );
}
