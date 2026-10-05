import { Show, type JSX } from "solid-js";
import settingsIconUrl from "../assets/settings.svg";

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
    difficultyLabel: string;
    onSettings?: () => void;
    settingsLabel: string;
    trap?: CombatHeaderTrap;
    variant: "overview";
}

interface CombatHeaderSubscreenProps extends CombatHeaderBaseProps {
    backLabel: string;
    characterLabel?: string;
    contextLabel: string;
    onBack?: () => void;
    variant: "subscreen";
}

export type CombatHeaderProps = CombatHeaderOverviewProps | CombatHeaderSubscreenProps;

export function CombatHeader(props: CombatHeaderProps): JSX.Element {
    return (
        <div class="kcq-combat-header-sticky">
            <header
                class="kcq-combat-header"
                classList={{
                    "kcq-combat-header--overview": props.variant === "overview",
                    "kcq-combat-header--subscreen": props.variant === "subscreen",
                }}
            >
                {props.variant === "subscreen" && (
                    <button
                        class="kcq-combat-header__back"
                        type="button"
                        aria-label={props.backLabel}
                        onClick={() => props.onBack?.()}
                    >
                        <span aria-hidden="true">{"\u2190"}</span>
                    </button>
                )}

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
                    <button
                        class="kcq-combat-header__settings"
                        type="button"
                        aria-label={props.settingsLabel}
                        onClick={() => props.onSettings?.()}
                    >
                        <img src={settingsIconUrl} alt="" width="22" height="22" />
                    </button>
                )}
            </header>
        </div>
    );
}
