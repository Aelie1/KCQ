import { For, Show, type JSX } from "solid-js";
import type { StoryLogEntry as Entry } from "../viewModels/storyLog";

export function StoryLogEntry(props: { entry: Entry }): JSX.Element {
    return <article class={"kcq-game-log__entry kcq-game-log__entry--" + props.entry.kind}
        data-kind={props.entry.kind} data-actor={props.entry.actorId} data-phase={props.entry.phase}>
        <Show when={props.entry.title}>
            <div class="kcq-game-log__heading"><strong class="kcq-game-log__title">{props.entry.title}</strong></div>
        </Show>
        <For each={props.entry.paragraphs}>{text => <p class="kcq-game-log__story-text">{text}</p>}</For>
    </article>;
}
