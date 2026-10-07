import { For, Show, type JSX } from "solid-js";
import type { EncounterId } from "../../../../engine/public/types";
import type { EncounterDetailsViewModel } from "../viewModels/encounters";
import { EffectPreview } from "./EffectPreview";
import { EncounterHeader } from "./EncounterHeader";
import { StatusChip } from "./StatusChip";

export function EncounterDetailsPanel(props: {
    model: EncounterDetailsViewModel; onStart: (encounter: EncounterId) => void;
}): JSX.Element {
    return <section class="kcq-encounter-screen kcq-encounter-details">
        <EncounterHeader title={props.model.name} settingsLabel={props.model.labels.settings} />
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
        <Show when={props.model.effects.length > 0}>
            <section class="kcq-encounter-card kcq-encounter-details__rules">
                <h2 class="kcq-encounter-details__heading">{props.model.labels.specialRules}</h2>
                <For each={props.model.effects}>{(effect) => <EffectPreview effect={effect} />}</For>
            </section>
        </Show>
        <footer class="kcq-encounter-details__footer">
            <button class="kcq-battle-overview__primary-action" type="button" onClick={() => props.onStart(props.model.id)}>
                {props.model.labels.start}
            </button>
        </footer>
    </section>;
}
