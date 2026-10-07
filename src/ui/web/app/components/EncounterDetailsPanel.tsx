import { For, Show, type JSX } from "solid-js";
import type { EncounterDetailsViewModel } from "../viewModels/encounters";
import { EffectPreview } from "./EffectPreview";
import { ScreenLayout } from "./ScreenLayout";
import { EncounterHeader } from "./EncounterHeader";
import { StatusChip } from "./StatusChip";

export function EncounterDetailsPanel(props: {
    model: EncounterDetailsViewModel; onBack: () => void; onChooseDifficulty: () => void;
}): JSX.Element {
    return <ScreenLayout class="kcq-encounter-screen kcq-encounter-details"
        header={
            <EncounterHeader title={props.model.name} settingsLabel={props.model.labels.settings} />
        }
        body={
            <div class="kcq-encounter-details__body">
                <section class="kcq-encounter-card kcq-encounter-details__info">
                    <div>
                        <h2>{props.model.labels.challenge}</h2>
                        <p class="kcq-encounter-details__stars" aria-label={props.model.challengeLabel}>{props.model.stars}</p>
                    </div>
                    <div>
                        <h2>{props.model.labels.bestClear}</h2>
                        <p class="kcq-encounter-details__best-clear">{props.model.bestClearLabel}</p>
                    </div>
                </section>
                <section class="kcq-encounter-card kcq-encounter-details__description">
                    <h2 class="kcq-encounter-details__heading">{props.model.labels.description}</h2>
                    <p>{props.model.description}</p>
                </section>
                <section class="kcq-encounter-card kcq-encounter-details__enemies">
                    <h2 class="kcq-encounter-details__heading">{props.model.labels.enemies}</h2>
                    <For each={props.model.enemies}>
                        {(enemy) => <div class="kcq-encounter-details__enemy">
                            <strong class="kcq-encounter-details__enemy-name">{enemy.name}</strong>
                            <StatusChip tone={enemy.rankTone}>{enemy.rankLabel}</StatusChip>
                            <strong class="kcq-encounter-details__hp">{enemy.hpLabel}</strong>
                        </div>}
                    </For>
                </section>
                <Show when={props.model.effects.length > 0 || props.model.effectGroups.length > 0}>
                    <section class="kcq-encounter-card kcq-encounter-details__rules">
                        <h2 class="kcq-encounter-details__heading">{props.model.labels.specialRules}</h2>
                        <For each={props.model.effects}>{(effect) => <EffectPreview effect={effect} />}</For>
                        <For each={props.model.effectGroups}>
                            {(group) => <div class="kcq-encounter-details__effect-group">
                                <h3>{group.name}</h3>
                                <For each={group.effects}>{(effect) => <EffectPreview effect={effect} />}</For>
                            </div>}
                        </For>
                    </section>
                </Show>
            </div>
        }
        footer={
            <footer class="kcq-screen-actions kcq-encounter-details__footer">
                <button class="kcq-targeting__back" type="button" onClick={props.onBack}>
                    <span aria-hidden="true">↶ </span>{props.model.labels.back}
                </button>
                <button class="kcq-battle-overview__primary-action" type="button" onClick={props.onChooseDifficulty}>
                    {props.model.labels.chooseDifficulty}
                </button>
            </footer>
        }
    />;
}
