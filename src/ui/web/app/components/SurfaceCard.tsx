import type { JSX } from "solid-js";

export interface SurfaceCardProps {
    title: string;
    children: JSX.Element;
}

export function SurfaceCard(props: SurfaceCardProps): JSX.Element {
    return (
        <section class="kcq-card">
            <h2 class="kcq-card-title">{props.title}</h2>
            {props.children}
        </section>
    );
}
