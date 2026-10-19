import { createEffect, createSignal, createUniqueId, For, on, Show, useContext, type JSX } from "solid-js";
import { COMBAT_SHORTCUTS } from "../keyboard";
import { ResponsiveLayoutContext } from "../responsiveScale";
import type { EncounterDetailsViewModel } from "../viewModels/encounters";
import { EffectPreview } from "./EffectPreview";
import { EncounterHeader } from "./EncounterHeader";
import { ScreenLayout } from "./ScreenLayout";
import { Shortcut } from "./Shortcut";
import { StatusChip } from "./StatusChip";

const narrativeTabs = ["description", "victory", "defeat"] as const;
type NarrativeTab = typeof narrativeTabs[number];

export function EncounterDetailsPanel(props: {
    onSettings?: () => void;
    onLibrary?: () => void;
    libraryLabel?: string;
    onNextLevel?: () => void;
    model: EncounterDetailsViewModel; onBack: () => void; onChooseDifficulty: () => void;
}): JSX.Element {
    const responsiveLayout = useContext(ResponsiveLayoutContext);
    const nonNarrow = () => (responsiveLayout?.().size ?? "narrow") !== "narrow";
    const hasInformation = () => props.model.enemies.length > 0 || props.model.effects.length > 0 || props.model.effectGroups.length > 0;
    const [selectedTab, setSelectedTab] = createSignal<NarrativeTab>("description");
    createEffect(on(() => props.model.id, () => setSelectedTab("description")));
    const activeTab = () => props.model.bestClear ? selectedTab() : "description";
    const tabId = createUniqueId();
    const tabButtons: Partial<Record<NarrativeTab, HTMLButtonElement>> = {};
    const tabKeydown = (event: KeyboardEvent, tab: NarrativeTab): void => {
        if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
        // Consume Space locally so the screen's Choose Difficulty shortcut cannot run.
        if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            if (!event.repeat) setSelectedTab(tab);
            return;
        }
        const enabledTabs = narrativeTabs.filter(tab => tab === "description" || props.model.bestClear);
        const index = enabledTabs.indexOf(tab);
        let next: NarrativeTab | undefined;
        switch (event.key) {
            case "ArrowRight": next = enabledTabs[(index + 1) % enabledTabs.length]; break;
            case "ArrowLeft": next = enabledTabs[(index + enabledTabs.length - 1) % enabledTabs.length]; break;
            case "Home": next = enabledTabs[0]; break;
            case "End": next = enabledTabs[enabledTabs.length - 1]; break;
        }
        if (next) {
            event.preventDefault();
            setSelectedTab(next);
            tabButtons[next]?.focus();
        }
    };

    return <ScreenLayout class={`kcq-encounter-screen kcq-encounter-details${nonNarrow() ? " kcq-encounter-details--non-narrow" : ""}`}
        header={
            <EncounterHeader title={props.model.name} settingsLabel={props.model.labels.settings} onSettings={props.onSettings}
                libraryLabel={props.libraryLabel} onLibrary={props.onLibrary} />
        }
        body={
            <div class="kcq-encounter-details__body">
                <Show when={props.model.stars > 0}>
                    <section class="kcq-encounter-card kcq-encounter-details__info">
                        <div>
                            <h2>{props.model.labels.challenge}</h2>
                            <p class="kcq-encounter-details__stars" aria-label={props.model.challengeLabel}>{props.model.starsText}</p>
                        </div>
                        <div>
                            <h2>{props.model.labels.bestClear}</h2>
                            <p class="kcq-encounter-details__best-clear">{props.model.bestClearLabel}</p>
                        </div>
                    </section>
                </Show>
                <div class="kcq-encounter-details__columns">
                    <section class="kcq-encounter-card kcq-encounter-details__description">
                        <Show when={props.model.stars > 0} fallback={
                            <div class="kcq-encounter-details__narrative" tabIndex={nonNarrow() ? 0 : undefined} aria-label={props.model.labels.description}>
                                <p>{props.model.description}</p>
                            </div>
                        }>
                            <div class="kcq-encounter-details__tabs" role="tablist" aria-label={props.model.labels.description}>
                                <For each={narrativeTabs}>{tab => <button
                                    ref={element => { tabButtons[tab] = element; }}
                                    id={`${tabId}-${tab}`} type="button" role="tab"
                                    class="kcq-encounter-details__tab"
                                    aria-selected={activeTab() === tab} aria-controls={`${tabId}-panel`}
                                    tabIndex={activeTab() === tab ? 0 : -1}
                                    disabled={tab !== "description" && !props.model.bestClear}
                                    onClick={() => setSelectedTab(tab)} onKeyDown={event => tabKeydown(event, tab)}
                                >{props.model.labels[tab]}</button>}</For>
                            </div>
                            <div class="kcq-encounter-details__narrative" id={`${tabId}-panel`} role="tabpanel" aria-labelledby={`${tabId}-${activeTab()}`} tabIndex={0}>
                                <p>{props.model[activeTab()] ?? props.model.labels.narrativeUnavailable}</p>
                            </div>
                        </Show>
                    </section>
                    <Show when={hasInformation()}>
                        <div class="kcq-encounter-details__information" tabIndex={nonNarrow() ? 0 : undefined}
                            role={nonNarrow() ? "region" : undefined}
                            aria-label={nonNarrow() ? [
                                props.model.enemies.length > 0 ? props.model.labels.enemies : undefined,
                                props.model.effects.length > 0 || props.model.effectGroups.length > 0 ? props.model.labels.specialRules : undefined,
                            ].filter(Boolean).join(", ") : undefined}>
                            <Show when={props.model.enemies.length > 0}>
                                <section class="kcq-encounter-card kcq-encounter-details__enemies">
                                    <h2 class="kcq-encounter-details__heading">{props.model.labels.enemies}</h2>
                                    <For each={props.model.enemies}>
                                        {(enemy) => <div class="kcq-encounter-details__enemy">
                                            <strong class="kcq-encounter-details__enemy-name">{enemy.name}</strong>
                                            <StatusChip tone={enemy.rankTone}>{enemy.rankLabel}</StatusChip>
                                            <strong class="kcq-encounter-details__hp">{enemy.hpLabel}</strong>
                                        </div>}
                                    </For>
                                </section>
                            </Show>
                            <Show when={props.model.effects.length > 0 || props.model.effectGroups.length > 0}>
                                <section class="kcq-encounter-card kcq-encounter-details__rules">
                                    <h2 class="kcq-encounter-details__heading">{props.model.labels.specialRules}</h2>
                                    <For each={props.model.effects}>{(effect) => <EffectPreview effect={effect} />}</For>
                                    <For each={props.model.effectGroups}>
                                        {(group) => <div class="kcq-encounter-details__effect-group">
                                            <h3>{group.name}</h3>
                                            <For each={group.effects}>{(effect) => <EffectPreview effect={effect} />}</For>
                                        </div>}
                                    </For>
                                </section>
                            </Show>
                        </div>
                    </Show>
                </div>
            </div>
        }
        footer={
            <footer class="kcq-screen-actions kcq-pregame-actions kcq-encounter-details__footer">
                <button class="kcq-targeting__back kcq-shortcut-host" data-kcq-shortcut={COMBAT_SHORTCUTS.back} type="button" onClick={props.onBack}>
                    <Shortcut shortcut={COMBAT_SHORTCUTS.back} />
                    <span aria-hidden="true">↶ </span>{props.model.labels.back}
                </button>
                <Show when={props.model.stars > 0}>
                    <button class="kcq-battle-overview__primary-action kcq-shortcut-host" data-kcq-shortcut="enter" type="button" onClick={props.onChooseDifficulty}>
                        <Shortcut shortcut="Enter" />
                        {props.model.labels.chooseDifficulty}
                    </button>
                </Show>
                <Show when={props.model.stars === 0 && props.model.nextEncounter && props.onNextLevel}>
                    <button class="kcq-battle-overview__primary-action kcq-shortcut-host" data-kcq-shortcut="enter" type="button" onClick={props.onNextLevel}>
                        <Shortcut shortcut="Enter" />
                        {props.model.labels.nextLevel}
                    </button>
                </Show>
            </footer>
        }
    />;
}
