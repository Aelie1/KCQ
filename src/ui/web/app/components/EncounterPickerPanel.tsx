import { For, type JSX } from "solid-js";
import type { EncounterId } from "../../../../engine/public/types";
import type { EncounterPickerViewModel } from "../viewModels/encounters";
import { ScreenLayout } from "./ScreenLayout";
import { EncounterHeader } from "./EncounterHeader";

export function EncounterPickerPanel(props: {
    model: EncounterPickerViewModel; onSelect: (encounter: EncounterId) => void;
}): JSX.Element {
    return <ScreenLayout class="kcq-encounter-screen kcq-encounter-picker"
        header={
            <EncounterHeader title={props.model.title} settingsLabel={props.model.settingsLabel} picker />
        }
        body={<>
            <For each={props.model.encounters}>
                {(encounter) => <button class="kcq-encounter-card kcq-encounter-picker__row" type="button"
                    onClick={() => props.onSelect(encounter.id)}>
                    <strong class="kcq-encounter-picker__name">{encounter.name}</strong>
                    <span class="kcq-encounter-picker__stars" aria-label={encounter.challengeLabel}>{encounter.stars}</span>
                    <span class="kcq-encounter-picker__best-clear">{encounter.bestClearLabel}</span>
                </button>}
            </For>
        </>}
    />;
}
