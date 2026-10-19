import { For, type JSX } from "solid-js";
import libraryIconUrl from "../assets/library.svg";
import settingsIconUrl from "../assets/settings.svg";

export interface LibrarySettingsControlsProps {
    libraryLabel?: string;
    settingsLabel: string;
    onLibrary?: () => void;
    onSettings?: () => void;
    libraryFirst?: boolean;
}

export function LibrarySettingsControls(props: LibrarySettingsControlsProps): JSX.Element {
    return <div class="kcq-header-controls">
        <For each={props.libraryFirst ? ["library", "settings"] as const : ["settings", "library"] as const}>{control =>
            <button class={`kcq-combat-header__${control}`} type="button"
                aria-label={control === "library" ? props.libraryLabel ?? "Library" : props.settingsLabel}
                disabled={control === "library" ? !props.onLibrary : !props.onSettings}
                onClick={() => (control === "library" ? props.onLibrary : props.onSettings)?.()}>
                <img src={control === "library" ? libraryIconUrl : settingsIconUrl} alt="" width="22" height="22" />
            </button>
        }</For>
    </div>;
}
