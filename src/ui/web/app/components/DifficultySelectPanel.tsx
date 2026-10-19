import { For, Show, useContext, type JSX } from "solid-js";
import type { DifficultyId } from "../../../../engine/public/types";
import { COMBAT_SHORTCUTS } from "../keyboard";
import { ResponsiveLayoutContext } from "../responsiveScale";
import type { DifficultySelectViewModel } from "../viewModels/difficulty";
import { EffectPreview } from "./EffectPreview";
import { EncounterHeader } from "./EncounterHeader";
import { ScreenLayout } from "./ScreenLayout";
import { Shortcut } from "./Shortcut";

export function DifficultySelectPanel(props: {
    onSettings?: () => void;
    onLibrary?: () => void;
    libraryLabel?: string;
    model: DifficultySelectViewModel;
    onSelectDifficulty: (difficulty: DifficultyId) => void;
    onBack: () => void;
    onStart: () => void;
}): JSX.Element {
    const responsiveLayout = useContext(ResponsiveLayoutContext);
    const desktop = () => (responsiveLayout?.().size ?? "narrow") !== "narrow";
    return <ScreenLayout class={`kcq-encounter-screen kcq-difficulty-select${desktop() ? " kcq-difficulty-select--desktop" : ""}`}
        header={<EncounterHeader title={props.model.encounterName} settingsLabel={props.model.labels.settings} onSettings={props.onSettings}
            libraryLabel={props.libraryLabel} onLibrary={props.onLibrary} />}
        body={
            <div class="kcq-difficulty-select__body">
                <section class="kcq-encounter-card kcq-difficulty-select__card">
                    <div class="kcq-difficulty-select__heading">
                        <h2>{props.model.labels.title}</h2>
                        <Show when={!desktop()}><strong>{props.model.selectedDifficultyName}</strong></Show>
                    </div>
                    <div class="kcq-difficulty-select__choices" role="group" aria-label={props.model.labels.title}>
                        <For each={props.model.choices}>
                            {(choice) => <button class="kcq-difficulty-select__choice" type="button"
                                classList={{ "is-selected": choice.selected }} aria-pressed={choice.selected}
                                onClick={() => props.onSelectDifficulty(choice.id)}>{choice.label}</button>}
                        </For>
                    </div>
                    <Show when={!desktop()}><p class="kcq-difficulty-select__description">{props.model.description}</p></Show>
                </section>
                <div class="kcq-difficulty-select__information" tabIndex={desktop() ? 0 : undefined}
                    role={desktop() ? "region" : undefined} aria-label={desktop() ? props.model.selectedDifficultyName : undefined}>
                    <Show when={desktop()}>
                        <section class="kcq-encounter-card kcq-difficulty-select__summary">
                            <h2>{props.model.selectedDifficultyName}</h2>
                            <p class="kcq-difficulty-select__description">{props.model.description}</p>
                        </section>
                    </Show>
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
            </div>
        }
        footer={
            <footer class="kcq-screen-actions kcq-pregame-actions kcq-difficulty-select__footer">
                <button class="kcq-targeting__back kcq-shortcut-host" data-kcq-shortcut={COMBAT_SHORTCUTS.back} type="button" onClick={props.onBack}>
                    <Shortcut shortcut={COMBAT_SHORTCUTS.back} />
                    <span aria-hidden="true">↶ </span>{props.model.labels.back}
                </button>
                <button class="kcq-battle-overview__primary-action kcq-shortcut-host" data-kcq-shortcut="enter" type="button" onClick={props.onStart}>
                    <Shortcut shortcut="Enter" />
                    {props.model.labels.start}
                </button>
            </footer>
        }
    />;
}
