import { Show, type JSX } from "solid-js";
import libraryIconUrl from "../assets/library.svg";
import settingsIconUrl from "../assets/settings.svg";

export function EncounterHeader(props: {
    title: string; settingsLabel: string; picker?: boolean; onSettings?: () => void;
    libraryLabel?: string; onLibrary?: () => void;
}): JSX.Element {
    const settingsButton = () => <button class="kcq-combat-header__settings" type="button" aria-label={props.settingsLabel}
        disabled={!props.onSettings} onClick={props.onSettings}>
        <img src={settingsIconUrl} alt="" width="22" height="22" />
    </button>;
    return <>
        <header class="kcq-combat-header kcq-encounter-header">
            <h1 class="kcq-encounter-header__title" classList={{ "kcq-encounter-header__title--picker": props.picker }}>
                {props.title}
            </h1>
            <Show when={props.picker} fallback={settingsButton()}>
                <div class="kcq-encounter-header__controls">
                    <button class="kcq-encounter-header__library" type="button" aria-label={props.libraryLabel ?? "Library"}
                        disabled={!props.onLibrary} onClick={props.onLibrary}>
                        <img src={libraryIconUrl} alt="" width="22" height="22" />
                    </button>
                    {settingsButton()}
                </div>
            </Show>
        </header>
    </>;
}
