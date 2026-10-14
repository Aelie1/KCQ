import { For, Show, type JSX } from "solid-js";
import type { EncounterId } from "../../../../engine/public/types";
import { COMBAT_SHORTCUTS, combatShortcut } from "../keyboard";
import type { EncounterPickerViewModel } from "../viewModels/encounters";
import { EncounterHeader } from "./EncounterHeader";
import { ScreenLayout } from "./ScreenLayout";
import { Shortcut } from "./Shortcut";

export function EncounterPickerPanel(props: {
    onBack?: () => void;
    onLibrary?: () => void;
    libraryLabel?: string;
    onSettings?: () => void;
    model: EncounterPickerViewModel; onSelect: (encounter: EncounterId) => void;
}): JSX.Element {
    return <ScreenLayout class="kcq-encounter-screen kcq-encounter-picker"
        header={
            <EncounterHeader title={props.model.title} settingsLabel={props.model.settingsLabel} onSettings={props.onSettings}
                libraryLabel={props.libraryLabel} onLibrary={props.onLibrary} picker />
        }
        body={<>
            <For each={props.model.encounters}>
                {(encounter, index) => <button class="kcq-encounter-card kcq-encounter-picker__row kcq-shortcut-host" type="button"
                    data-kcq-shortcut={combatShortcut(index())}
                    onClick={() => props.onSelect(encounter.id)}>
                    <Shortcut shortcut={combatShortcut(index())} />
                    <strong class="kcq-encounter-picker__name">{encounter.name}</strong>
                    <Show when={encounter.stars > 0}>
                        <span class="kcq-encounter-picker__stars" aria-label={encounter.challengeLabel}>{encounter.starsText}</span>
                        <span class="kcq-encounter-picker__best-clear">{encounter.bestClearLabel}</span>
                    </Show>
                </button>}
            </For>
        </>
        }
        footer={
            props.onBack && <footer class="kcq-screen-actions kcq-encounter-details__footer">
                <button class="kcq-targeting__back kcq-shortcut-host" data-kcq-shortcut={COMBAT_SHORTCUTS.back} type="button" onClick={props.onBack}>
                    <Shortcut shortcut={COMBAT_SHORTCUTS.back} />
                    <span aria-hidden="true">↶ </span>{props.model.backLabel}
                </button>
            </footer>
        }
    />;
}
