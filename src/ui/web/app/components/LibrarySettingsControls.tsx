import type { JSX } from "solid-js";
import libraryIconUrl from "../assets/library.svg";
import settingsIconUrl from "../assets/settings.svg";

export interface LibrarySettingsControlsProps {
    libraryLabel?: string;
    settingsLabel: string;
    onLibrary?: () => void;
    onSettings?: () => void;
}

export function LibrarySettingsControls(props: LibrarySettingsControlsProps): JSX.Element {
    return <div class="kcq-header-controls">
        <button class="kcq-combat-header__settings" type="button" aria-label={props.settingsLabel}
            disabled={!props.onSettings} onClick={props.onSettings}>
            <img src={settingsIconUrl} alt="" width="22" height="22" />
        </button>
        <button class="kcq-combat-header__library" type="button" aria-label={props.libraryLabel ?? "Library"}
            disabled={!props.onLibrary} onClick={props.onLibrary}>
            <img src={libraryIconUrl} alt="" width="22" height="22" />
        </button>
    </div>;
}
