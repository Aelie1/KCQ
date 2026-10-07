import type { JSX } from "solid-js";
import settingsIconUrl from "../assets/settings.svg";

export function EncounterHeader(props: { title: string; settingsLabel: string; picker?: boolean; onSettings?: () => void }): JSX.Element {
    return <>
        <header class="kcq-combat-header kcq-encounter-header">
            <h1 class="kcq-encounter-header__title" classList={{ "kcq-encounter-header__title--picker": props.picker }}>
                {props.title}
            </h1>
            <button class="kcq-combat-header__settings" type="button" aria-label={props.settingsLabel}
                disabled={!props.onSettings} onClick={props.onSettings}>
                <img src={settingsIconUrl} alt="" width="22" height="22" />
            </button>
        </header>
    </>;
}
