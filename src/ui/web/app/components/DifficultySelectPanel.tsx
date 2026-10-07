import { For, Show, type JSX } from "solid-js";
import type { DifficultyId } from "../../../../engine/public/types";
import type { DifficultySelectViewModel } from "../viewModels/difficulty";
import { EffectPreview } from "./EffectPreview";
import { EncounterHeader } from "./EncounterHeader";
import { ScreenLayout } from "./ScreenLayout";

export function DifficultySelectPanel(props: {
    model: DifficultySelectViewModel;
    onSelectDifficulty: (difficulty: DifficultyId) => void;
    onBack: () => void;
    onStart: () => void;
}): JSX.Element {
    return <ScreenLayout class="kcq-encounter-screen kcq-difficulty-select"
        header={<EncounterHeader title={props.model.encounterName} settingsLabel={props.model.labels.settings} />}
        body={
            <div class="kcq-difficulty-select__body">
                <section class="kcq-encounter-card kcq-difficulty-select__card">
                    <div class="kcq-difficulty-select__heading">
                        <h2>{props.model.labels.title}</h2>
                        <strong>{props.model.selectedDifficultyName}</strong>
                    </div>
                    <div class="kcq-difficulty-select__choices" role="group" aria-label={props.model.labels.title}>
                        <For each={props.model.choices}>
                            {(choice) => <button class="kcq-difficulty-select__choice" type="button"
                                classList={{ "is-selected": choice.selected }} aria-pressed={choice.selected}
                                onClick={() => props.onSelectDifficulty(choice.id)}>{choice.label}</button>}
                        </For>
                    </div>
                    <p class="kcq-difficulty-select__description">{props.model.description}</p>
                </section>
                <Show when={props.model.globalEffects}>
                    {(globalEffects) => <section class="kcq-encounter-card kcq-difficulty-select__global-effects">
                        <h2>{props.model.labels.globalEffects}</h2>
                        <h3>{globalEffects().recipientName}</h3>
                        <For each={globalEffects().effects}>{(effect) => <EffectPreview effect={effect} />}</For>
                    </section>}
                </Show>
                <Show when={props.model.specialRules}>
                    {(specialRules) => <section class="kcq-encounter-card kcq-difficulty-select__special-rules">
                        <h2>{props.model.labels.specialRules}</h2>
                        <table class="kcq-difficulty-select__rules-table">
                            <thead><tr>
                                <th scope="col">{props.model.labels.enemyColumn}</th>
                                <th scope="col">{props.model.labels.changeColumn}</th>
                            </tr></thead>
                            <tbody><For each={specialRules().rows}>
                                {(row) => <tr><th scope="row">{row.enemyName}</th><td>{row.description}</td></tr>}
                            </For></tbody>
                        </table>
                    </section>}
                </Show>
            </div>
        }
        footer={
            <footer class="kcq-screen-actions kcq-difficulty-select__footer">
                <button class="kcq-targeting__back" type="button" onClick={props.onBack}>
                    <span aria-hidden="true">↶ </span>{props.model.labels.back}
                </button>
                <button class="kcq-battle-overview__primary-action" type="button" onClick={props.onStart}>
                    {props.model.labels.start}
                </button>
            </footer>
        }
    />;
}
