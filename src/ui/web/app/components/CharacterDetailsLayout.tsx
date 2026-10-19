import { createUniqueId, For, Show, type JSX } from "solid-js";
import type { EntityId } from "../../../../engine/public/types";
import { reactionRef } from "../combatReactions";
import type { CharacterDetailsViewModel } from "../viewModels/characterDetails";
import { BindingMeter } from "./BindingMeter";
import { CombatHeader } from "./CombatHeader";
import { EffectDetails } from "./EffectDetails";
import { ModifierMeter } from "./ModifierMeter";
import { ScreenLayout } from "./ScreenLayout";
import { StatusChip } from "./StatusChip";

export interface CharacterDetailsLayoutProps {
    workspaceOnly?: boolean;
    expanded?: { wide: boolean; header: JSX.Element; gameLog: () => JSX.Element; workspaceHeading: string; workspaceHeadingExtra?: JSX.Element; };
    actionRegion: JSX.Element;
    footer?: JSX.Element;
    contextLabel: string;
    model: CharacterDetailsViewModel;
    onHeaderBack?: () => void;
    onSelectCharacter?: (id: EntityId) => void;
}

export function CharacterDetailsLayout(props: CharacterDetailsLayoutProps): JSX.Element {
    // Embedded panels keep their actions and footer without another character shell.
    if (props.workspaceOnly) return (
        <ScreenLayout class="kcq-character-workspace" body={props.actionRegion} footer={props.footer} />
    );
    const characterHeadingId = createUniqueId();
    const workspaceHeadingId = createUniqueId();
    const Roster = () => (
        <nav class="kcq-character-roster" aria-label={props.model.labels.rosterLabel}>
            <For each={props.model.roster.map(character => character.id)}>
                {id => {
                    const character = () => props.model.roster.find(character => character.id === id)!;
                    return (
                        <button
                            ref={reactionRef("actor", () => id)}
                            class="kcq-character-roster__card"
                            classList={{
                                "kcq-character-roster__card--focused": character().focused,
                                "kcq-character-roster__card--disabled": character().actionState.kind === "incapacitated",
                            }}
                            type="button"
                            aria-pressed={character().focused}
                            onClick={() => props.onSelectCharacter?.(character().id)}
                        >
                            <span
                                ref={reactionRef("actor", () => id)}
                                class="kcq-character-roster__name"
                                classList={{ [`kcq-player-identity--${character().tone}`]: true }}
                            >
                                {character().name}
                            </span>
                            <span class="kcq-character-roster__state" aria-label={character().summary}>
                                <span
                                    class="kcq-character-roster__action"
                                    classList={{ [`kcq-character-roster__action--${character().actionState.tone}`]: true }}
                                >
                                    {character().actionState.compactLabel}
                                </span>
                                <span class="kcq-character-roster__state-separator" aria-hidden="true">{" \u00b7 "}</span>
                                <span
                                    class="kcq-character-roster__condition"
                                    classList={{ [`kcq-character-roster__condition--${character().stanceState.tone}`]: true }}
                                >
                                    {character().stanceState.compactLabel}
                                </span>
                            </span>
                        </button>
                    );
                }}
            </For>
        </nav>
    );
    const Information = () => <>
        <Show when={props.model.focused.modifiers.length > 0}>
            <section class="kcq-character-section kcq-character-capabilities" aria-labelledby="character-status-heading">
                <h2 id="character-status-heading">{props.model.labels.statusHeading}</h2>
                <div class="kcq-character-capabilities__list">
                    <For each={props.model.focused.modifiers}>
                        {(metric) => <ModifierMeter metric={metric} />}
                    </For>
                </div>
            </section>
        </Show>

        <Show when={props.model.focused.bindings.length > 0}>
            <section class="kcq-character-section kcq-character-bindings" aria-labelledby="character-bindings-heading">
                <div class="kcq-character-bindings__header">
                    <span id="character-bindings-heading">{props.model.labels.bindingsHeading}</span>
                    <Show when={props.model.focused.thrillseeker} keyed>
                        {(thrillseeker) => (
                            <div class="kcq-character-bindings__resource">
                                <span>
                                    {thrillseeker.binding} Binding → Hit +{thrillseeker.hit}
                                </span>
                            </div>
                        )}
                    </Show>
                </div>
                <div class="kcq-character-bindings__list">
                    <For each={props.model.focused.bindings.map(binding => binding.id)}>
                        {id => {
                            const binding = () => props.model.focused.bindings.find(binding => binding.id === id)!;
                            return (
                                <div class="kcq-character-binding">
                                    <div class="kcq-character-binding__summary">
                                        <span class="kcq-character-binding__name">{binding().name}</span>
                                        <span class="kcq-character-binding__statuses">
                                            <For each={binding().statusLabels}>
                                                {(status) => <StatusChip size="compact">{status}</StatusChip>}
                                            </For>
                                        </span>
                                        <span
                                            class="kcq-character-binding__level"
                                            classList={{ [`kcq-character-binding__level--${binding().level}`]: true }}
                                        >
                                            {binding().levelLabel}
                                        </span>
                                        <span class="kcq-character-binding__value">{binding().valueLabel}</span>
                                    </div>
                                    <BindingMeter entityId={props.model.focused.id} bindingId={id}
                                        value={binding().value}
                                        peak={binding().peak}
                                        max={binding().max}
                                        level={binding().level}
                                        size="compact"
                                        ariaLabel={binding().name}
                                    />
                                </div>
                            );
                        }}
                    </For>
                </div>
            </section>
        </Show>

        <Show when={props.model.focused.effects.length > 0}>
            <section class="kcq-character-section kcq-character-effects" aria-labelledby="character-effects-heading">
                <h2 id="character-effects-heading">{props.model.labels.buffsHeading}</h2>
                <EffectDetails entityId={props.model.focused.id} effects={props.model.focused.effects} />
            </section>
        </Show>
    </>;
    if (props.expanded) return (
        <section class="kcq-character-details kcq-character-details-expanded"
            classList={{ "kcq-character-details-wide": props.expanded.wide, "kcq-character-details-medium": !props.expanded.wide }}
            aria-label={props.model.focused.name}>
            <div class="kcq-character-details-expanded__header">{props.expanded.header}</div>
            <section class="kcq-battle-section kcq-character-details-expanded__column kcq-character-details-expanded__information"
                aria-labelledby={characterHeadingId}>
                <header class="kcq-battle-section__heading">
                    <h2 id={characterHeadingId}>{props.contextLabel} / {props.model.focused.name}</h2>
                </header>
                <ScreenLayout class="kcq-character-information" header={<Roster />} body={<Information />} />
            </section>
            <section class="kcq-battle-section kcq-character-details-expanded__column kcq-character-details-expanded__workspace"
                aria-labelledby={workspaceHeadingId}>
                <Show when={!props.expanded.wide}>{props.expanded.gameLog()}</Show>
                <header class="kcq-battle-section__heading">
                    <h2 id={workspaceHeadingId}>{props.expanded.workspaceHeading}</h2>
                    {props.expanded.workspaceHeadingExtra}
                </header>
                {props.actionRegion}
            </section>
            <Show when={props.expanded.wide}>
                <div class="kcq-character-details-expanded__log">{props.expanded.gameLog()}</div>
            </Show>
        </section>
    );
    return (
        <ScreenLayout class="kcq-character-details" ariaLabel={props.model.focused.name}
            header={
                <div class="kcq-character-details__header">
                    <CombatHeader
                        variant="subscreen"
                        encounterLabel={props.model.header.encounterLabel}
                        contextLabel={props.contextLabel}
                        characterLabel={props.model.header.characterLabel}
                        roundLabel={props.model.header.roundLabel}
                        phaseLabel={props.model.header.phaseLabel}
                        backLabel={props.model.controls.backLabel}
                        onBack={props.onHeaderBack}
                    />

                    <Roster />
                </div>
            }
            body={<>
                <Information />

                {props.actionRegion}
            </>}
            footer={props.footer}
        />
    );
}
