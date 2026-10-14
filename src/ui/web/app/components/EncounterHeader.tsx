import type { JSX } from "solid-js";
import { LibrarySettingsControls } from "./LibrarySettingsControls";

export function EncounterHeader(props: {
    title: string; settingsLabel: string; picker?: boolean; onSettings?: () => void;
    libraryLabel?: string; onLibrary?: () => void;
}): JSX.Element {
    return <>
        <header class="kcq-combat-header kcq-encounter-header">
            <h1 class="kcq-encounter-header__title" classList={{ "kcq-encounter-header__title--picker": props.picker }}>
                {props.title}
            </h1>
            <LibrarySettingsControls libraryLabel={props.libraryLabel} settingsLabel={props.settingsLabel}
                onLibrary={props.onLibrary} onSettings={props.onSettings} />
        </header>
    </>;
}
