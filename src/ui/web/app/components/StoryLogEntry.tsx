import { For, Show, type JSX } from "solid-js";
import type { StoryLogEntry as Entry } from "../viewModels/storyLog";

export function StoryLogEntry(props: { entry: Entry; hidden?: boolean }): JSX.Element {
    return <article class={"kcq-game-log__entry kcq-game-log__entry--" + props.entry.kind}
        aria-hidden={props.hidden ? true : undefined} data-kind={props.entry.kind} data-actor={props.entry.actorId} data-phase={props.entry.phase}>
        <Show when={props.entry.title}>
            <div class="kcq-game-log__heading"><strong class="kcq-game-log__title">{props.entry.title}</strong></div>
        </Show>
        <For each={props.entry.paragraphs}>
            {paragraph =>
                <p class="kcq-game-log__story-text"
                    classList={{
                        "kcq-game-log__story-text--success": paragraph.tone === "success",
                        "kcq-game-log__story-text--warning": paragraph.tone === "warning",
                        "kcq-game-log__story-text--danger": paragraph.tone === "danger",
                    }}>
                    <Show when={paragraph.parts} fallback={paragraph.text}>
                        {parts => <For each={parts()}>{part => <Show when={part.glow} fallback={part.text}>
                            {tone => <span class="kcq-game-log__one-shot"
                                style={{ "--kcq-story-glow": tone() === "neutral" ? "var(--kcq-text-primary)" : `var(--kcq-name-${tone()})` }}>
                                {part.text}
                            </span>}
                        </Show>}</For>}
                    </Show>
                </p>
            }
        </For>
    </article>;
}
