import { For, Show, type JSX } from "solid-js";
import type { HitBand } from "../../../../engine/public/types";
import type { TargetPreviewViewModel } from "../viewModels/targeting";
import { reactionRef } from "../combatReactions";
import { StatusChip } from "./StatusChip";
import { LinkedEntityChip } from "./LinkedEntityChip";

export interface TargetHeaderProps {
    target: TargetPreviewViewModel;
    outcome?: { band: Exclude<HitBand, "none">; label: string };
}

export function TargetHeader(props: TargetHeaderProps): JSX.Element {
    const name = () => (
        <strong
            ref={reactionRef("actor", () => props.target.target)}
            class="kcq-target-header__name"
            classList={{ [`kcq-player-identity--${props.target.tone}`]: true }}
            title={props.target.name}
        >
            {props.target.name}
        </strong>
    );

    return (
        <div class="kcq-target-header">
            <Show when={props.outcome} keyed fallback={name()}>
                {outcome => (
                    <span class="kcq-target-header__identity">
                        {name()}
                        <StatusChip size="compact" tone={`outcome-${outcome.band}`}>{outcome.label}</StatusChip>
                    </span>
                )}
            </Show>
            <For each={props.target.linkedEntities}>
                {(link) => <LinkedEntityChip link={link} iconOnly />}
            </For>
            <Show when={props.target.health} keyed>
                {(health) => (
                    <>
                        <span ref={reactionRef("hp", () => props.target.target)} class="kcq-target-header__meter" aria-hidden="true">
                            <span style={{ width: `${health.fillPercent}%` }} />
                        </span>
                        <span ref={reactionRef("hp", () => props.target.target)} class="kcq-target-header__value">{health.currentLabel}</span>
                    </>
                )}
            </Show>
            <Show when={props.target.characterSummary}>
                <span class="kcq-target-header__character-state">
                    {props.target.characterSummary}
                </span>
            </Show>
        </div>
    );
}
