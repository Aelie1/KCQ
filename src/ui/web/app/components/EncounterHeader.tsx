import { useContext, type JSX } from "solid-js";
import { ResponsiveLayoutContext } from "../responsiveScale";
import { LibrarySettingsControls } from "./LibrarySettingsControls";

export function EncounterHeader(props: {
    title: string; settingsLabel: string; picker?: boolean; onSettings?: () => void;
    libraryLabel?: string; onLibrary?: () => void;
    pickerControls?: JSX.Element;
}): JSX.Element {
    const layout = useContext(ResponsiveLayoutContext);
    const compact = () => (layout?.().size ?? "narrow") !== "narrow";
    return <>
        <header class="kcq-combat-header kcq-encounter-header" classList={{ "kcq-encounter-header--picker": props.picker, "kcq-encounter-header--compact": compact() }}>
            <h1 class="kcq-encounter-header__title" classList={{ "kcq-encounter-header__title--picker": props.picker }}>
                {props.title}
            </h1>
            {props.picker && props.pickerControls}
            <LibrarySettingsControls libraryLabel={props.libraryLabel} settingsLabel={props.settingsLabel}
                onLibrary={props.onLibrary} onSettings={props.onSettings} libraryFirst={compact()} />
        </header>
    </>;
}
