import { For, Show, type JSX } from "solid-js";
import type { CharacterDetailsViewModel } from "../viewModels/characterDetails";
import { BindingMeter } from "./BindingMeter";
import { ModifierMeter } from "./ModifierMeter";
import { StatusChip } from "./StatusChip";

type CharacterStatusProps = { model: CharacterDetailsViewModel; headingPrefix?: string; floatingNumbers?: boolean };

export function CharacterCapabilities(props: CharacterStatusProps): JSX.Element {
    return (
        <Show when={props.model.focused.modifiers.length > 0}>
            <section class="kcq-character-section kcq-character-capabilities" aria-labelledby={`${props.headingPrefix ?? "character"}-status-heading`}>
                <h2 id={`${props.headingPrefix ?? "character"}-status-heading`}>{props.model.labels.statusHeading}</h2>
                <div class="kcq-character-capabilities__list">
                    <For each={props.model.focused.modifiers}>
                        {(metric) => <ModifierMeter metric={metric} />}
                    </For>
                </div>
            </section>
        </Show>
    );
}

export function CharacterBindings(props: CharacterStatusProps): JSX.Element {
    return (
        <Show when={props.model.focused.bindings.length > 0}>
            <section class="kcq-character-section kcq-character-bindings" aria-labelledby={`${props.headingPrefix ?? "character"}-bindings-heading`}>
                <h2 id={`${props.headingPrefix ?? "character"}-bindings-heading`}>{props.model.labels.bindingsHeading}</h2>
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
                                        floatingNumbers={props.floatingNumbers}
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
    );
}
