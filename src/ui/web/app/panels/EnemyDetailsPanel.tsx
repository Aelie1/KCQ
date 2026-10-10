import { createMemo, For, Show, type JSX } from "solid-js";
import type { ActionView, EntityId, GameState, ThresholdInfo } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { CombatHeader } from "../components/CombatHeader";
import { EffectDetails } from "../components/EffectDetails";
import { EffectPreview } from "../components/EffectPreview";
import { ModifierMeter } from "../components/ModifierMeter";
import { ScreenLayout } from "../components/ScreenLayout";
import { SelectedCommandSummary } from "../components/SelectedCommandSummary";
import { TargetCard } from "../components/TargetCard";
import { TargetHeader } from "../components/TargetHeader";
import { COMBAT_SHORTCUTS } from "../keyboard";
import { createEnemyDetailsViewModel } from "../viewModels/enemyDetails";

export interface EnemyDetailsPanelProps {
    actions: readonly ActionView[];
    enemyId: EntityId;
    presentation: Presentation;
    state: GameState;
    thresholds: ThresholdInfo;
    onBack?: () => void;
}

export function EnemyDetailsPanel(props: EnemyDetailsPanelProps): JSX.Element {
    const model = createMemo(() => createEnemyDetailsViewModel(
        props.state, props.actions, props.enemyId, props.thresholds, props.presentation,
    ));

    return (
        <ScreenLayout class="kcq-enemy-details kcq-character-details" ariaLabel={model().identity.name}
            header={
                <CombatHeader variant="subscreen"
                    encounterLabel={model().header.encounterLabel}
                    contextLabel={model().labels.context}
                    characterLabel={model().identity.name}
                    roundLabel={model().header.roundLabel}
                    phaseLabel={model().header.phaseLabel}
                    backLabel={model().labels.back}
                    backShortcut={COMBAT_SHORTCUTS.back}
                    onBack={props.onBack}
                />
            }
            body={<>
                <section class="kcq-focused-character kcq-enemy-details__identity" aria-label={model().identity.name}>
                    <span class="kcq-focused-character__avatar" aria-hidden="true">{model().initial}</span>
                    <TargetHeader target={model().identity} />
                </section>
                <Show when={model().modifiers.length > 0}>
                    <section class="kcq-character-section" aria-labelledby="enemy-status-heading">
                        <h2 id="enemy-status-heading">{model().labels.status}</h2>
                        <div class="kcq-character-capabilities__list">
                            <For each={model().modifiers}>{metric => <ModifierMeter metric={metric} />}</For>
                        </div>
                    </section>
                </Show>
                <Show when={model().effects.length > 0}>
                    <section class="kcq-character-section kcq-character-effects" aria-labelledby="enemy-effects-heading">
                        <h2 id="enemy-effects-heading">{model().labels.effects}</h2>
                        <EffectDetails entityId={props.enemyId} effects={model().effects} />
                    </section>
                </Show>
                <section class="kcq-character-section kcq-enemy-details__intentions" aria-labelledby="enemy-intentions-heading">
                    <h2 id="enemy-intentions-heading">{model().labels.intentions}</h2>
                    <For each={model().intentions} fallback={<p class="kcq-enemy-details__empty">{model().labels.noIntentions}</p>}>
                        {intention => (
                            <section class="kcq-enemy-details__intention" aria-label={intention.name}>
                                <SelectedCommandSummary name={intention.name} tags={[]} />
                                <div class="kcq-targeting__targets">
                                    <For each={intention.targets}>
                                        {target => <TargetCard mode="predetermined" selected={false} showLinkedEntities={false}
                                            target={target.preview} outcome={target.outcome} />}
                                    </For>
                                    <For each={intention.effectTargets}>
                                        {target => <TargetCard mode="predetermined" selected={false} target={target} showLinkedEntities={false} />}
                                    </For>
                                </div>
                                <For each={intention.effects}>{effect => <EffectPreview effect={effect} showLinkedEntities={false} />}</For>
                            </section>
                        )}
                    </For>
                </section>
            </>}
        />
    );
}
