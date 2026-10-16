import { Show, type JSX } from "solid-js";
import { Shortcut } from "./Shortcut";
import { LibrarySettingsControls } from "./LibrarySettingsControls";

export interface CombatHeaderTrap {
    amount: number;
    fillPercent: number;
    label: string;
    max: number;
    valueLabel: string;
}

interface CombatHeaderBaseProps {
    encounterLabel: string;
    phaseLabel: string;
    roundLabel: string;
}

interface CombatHeaderOverviewProps extends CombatHeaderBaseProps {
    navigation?: {
        backLabel: string;
        backShortcut?: string;
        onBack?: () => void;
    };
    action?: JSX.Element;
    difficultyLabel: string;
    onSettings?: () => void;
    settingsLabel: string;
    onLibrary?: () => void;
    libraryLabel?: string;
    trap?: CombatHeaderTrap;
    variant: "overview";
}

interface CombatHeaderSubscreenProps extends CombatHeaderBaseProps {
    backLabel: string;
    backShortcut?: string;
    characterLabel?: string;
    contextLabel: string;
    onBack?: () => void;
    variant: "subscreen";
}

export type CombatHeaderProps = CombatHeaderOverviewProps | CombatHeaderSubscreenProps;

export function CombatHeader(props: CombatHeaderProps): JSX.Element {
    const navigation = () => props.variant === "subscreen" ? props : props.navigation;
    return (
        <header
            class="kcq-combat-header"
            classList={{
                "kcq-combat-header--overview": props.variant === "overview",
                "kcq-combat-header--subscreen": props.variant === "subscreen",
                "kcq-combat-header--with-action": props.variant === "overview" && !!props.action,
            }}
        >
            <Show when={navigation()}>{nav => (
                <button
                    class="kcq-combat-header__back"
                    classList={{ "kcq-shortcut-host": !!nav().backShortcut }}
                    data-kcq-shortcut={nav().onBack ? nav().backShortcut : undefined}
                    type="button"
                    aria-label={nav().backLabel}
                    onClick={() => nav().onBack?.()}
                >
                    <Shortcut shortcut={nav().backShortcut} />
                    <span aria-hidden="true">{"\u2190"}</span>
                </button>
            )}</Show>

            <div class="kcq-combat-header__encounter">
                <h1 class="kcq-combat-header__title">{props.encounterLabel}</h1>
                {props.variant === "overview"
                    ? (
                        <Show when={props.trap}>
                            {(trap) => (
                                <div class="kcq-combat-header__trap">
                                    <div class="kcq-combat-header__trap-summary">
                                        <span class="kcq-combat-header__trap-name">{trap().label}</span>
                                        <span class="kcq-combat-header__trap-value">{trap().valueLabel}</span>
                                    </div>
                                    <div
                                        class="kcq-combat-header__trap-meter"
                                        role="meter"
                                        aria-label={trap().label}
                                        aria-valuemin="0"
                                        aria-valuemax={trap().max}
                                        aria-valuenow={trap().amount}
                                    >
                                        <span style={{ width: `${trap().fillPercent}%` }} />
                                    </div>
                                </div>
                            )}
                        </Show>
                    )
                    : (
                        <p class="kcq-combat-header__breadcrumb">
                            {props.contextLabel}
                            <Show when={props.characterLabel} keyed>
                                {(character) => <> / {character}</>}
                            </Show>
                        </p>
                    )}
            </div>

            <div class="kcq-combat-header__metadata">
                {props.variant === "overview" && (
                    <p class="kcq-combat-header__difficulty">{props.difficultyLabel}</p>
                )}
                <p class="kcq-combat-header__round">{props.roundLabel}</p>
                <p class="kcq-combat-header__phase">{props.phaseLabel}</p>
            </div>

            {props.variant === "overview" && (
                <LibrarySettingsControls libraryLabel={props.libraryLabel} settingsLabel={props.settingsLabel}
                    onLibrary={props.onLibrary} onSettings={props.onSettings} />
            )}
            {props.variant === "overview" && props.action}
        </header>
    );
}
