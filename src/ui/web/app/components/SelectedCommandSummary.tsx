import { For, type JSX } from "solid-js";
import type { CommandTagViewModel } from "../viewModels/characterDetails";
import { CommandTag } from "./CommandTag";

export interface SelectedCommandSummaryProps {
    name: string;
    tags: readonly CommandTagViewModel[];
}

export function SelectedCommandSummary(props: SelectedCommandSummaryProps): JSX.Element {
    return (
        <div class="kcq-selected-command">
            <h2>{props.name}</h2>
            <div class="kcq-selected-command__tags">
                <For each={props.tags}>{(tag) => <CommandTag tag={tag} />}</For>
            </div>
        </div>
    );
}
