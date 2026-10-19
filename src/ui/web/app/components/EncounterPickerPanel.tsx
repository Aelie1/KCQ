import { createMemo, For, Show, useContext, type JSX } from "solid-js";
import type { EncounterId } from "../../../../engine/public/types";
import { COMBAT_SHORTCUTS, combatShortcut } from "../keyboard";
import { ResponsiveLayoutContext } from "../responsiveScale";
import type { EncounterPickerSectionViewModel, EncounterPickerViewModel } from "../viewModels/encounters";
import { EncounterHeader } from "./EncounterHeader";
import { ScreenLayout } from "./ScreenLayout";
import { Shortcut } from "./Shortcut";

export function EncounterPickerPanel(props: {
    onBack?: () => void;
    onChangeParty?: () => void;
    onLibrary?: () => void;
    libraryLabel?: string;
    onSettings?: () => void;
    onShowAllChange?: (showAll: boolean) => void;
    model: EncounterPickerViewModel; onSelect: (encounter: EncounterId) => void;
}): JSX.Element {
    const responsiveLayout = useContext(ResponsiveLayoutContext);
    const organized = () => (responsiveLayout?.().size ?? "narrow") !== "narrow" && !!props.model.layout?.length;
    const sectionColumns = createMemo(() => Math.max(1, ...(props.model.layout?.map(row => row.length) ?? [])));
    const shortcuts = createMemo(() => new Map(props.model.encounters.map((encounter, index) => [encounter.id, combatShortcut(index)])));
    const flatSections = createMemo(() => {
        if (!props.model.layout?.length) return [];
        const sectionsById = new Map(props.model.layout.flatMap(row => row.flatMap(section =>
            section.encounters.map(encounter => [encounter.id, section] as const))));
        const groups: { section: EncounterPickerSectionViewModel | undefined; encounters: EncounterPickerViewModel["encounters"][number][] }[] = [];
        for (const encounter of props.model.encounters) {
            const section = sectionsById.get(encounter.id);
            const previous = groups[groups.length - 1];
            if (previous && previous.section === section) previous.encounters.push(encounter);
            else groups.push({ section, encounters: [encounter] });
        }
        return groups;
    });
    const encounterCard = (encounter: EncounterPickerViewModel["encounters"][number]): JSX.Element => {
        const card = <button class="kcq-encounter-card kcq-encounter-picker__row kcq-shortcut-host" type="button"
            data-kcq-shortcut={shortcuts().get(encounter.id)}
            disabled={encounter.locked}
            onClick={() => props.onSelect(encounter.id)}>
            <Shortcut shortcut={shortcuts().get(encounter.id)} />
            <strong class="kcq-encounter-picker__name">{encounter.name}</strong>
            <Show when={!encounter.locked && encounter.stars > 0}>
                <span class="kcq-encounter-picker__stars" aria-label={encounter.challengeLabel}>{encounter.starsText}</span>
                <span class="kcq-encounter-picker__best-clear">{encounter.bestClearLabel}</span>
            </Show>
        </button>;
        return organized() ? <div class="kcq-encounter-picker__card-container">{card}</div> : card;
    };
    return <ScreenLayout class={`kcq-encounter-screen kcq-encounter-picker${organized() ? " kcq-encounter-picker--overview" : ""}${organized() && responsiveLayout?.().size === "wide" ? " kcq-encounter-picker--wide" : ""}`}
        header={
            <EncounterHeader title={props.model.title} settingsLabel={props.model.settingsLabel} onSettings={props.onSettings}
                libraryLabel={props.libraryLabel} onLibrary={props.onLibrary} picker
                pickerControls={<label class="kcq-encounter-picker__show-all">
                    <input type="checkbox" checked={props.model.showAll}
                        onChange={event => props.onShowAllChange?.(event.currentTarget.checked)} />
                    <span>{props.model.showAllLabel}</span>
                </label>} />
        }
        body={<Show when={organized()} fallback={
            <Show when={props.model.layout?.length} fallback={<For each={props.model.encounters}>{encounterCard}</For>}>
                <For each={flatSections()}>{group =>
                    <section class="kcq-encounter-picker__section" aria-label={group.section?.name ?? props.model.additionalEncountersLabel}>
                        <h2>{group.section?.name ?? props.model.additionalEncountersLabel}</h2>
                        <For each={group.encounters}>{encounterCard}</For>
                    </section>
                }</For>
            </Show>
        }>
            <div class="kcq-encounter-picker__campaign" style={{ "--kcq-campaign-columns": sectionColumns() }}>
                <For each={props.model.layout}>{row =>
                    <div class="kcq-encounter-picker__campaign-row" style={{ "grid-template-columns": `repeat(${row.length || 1}, minmax(0, 1fr))` }}>
                        <For each={row}>{section =>
                            <section class="kcq-encounter-picker__section" aria-label={section.name}>
                                <h2>{section.name}</h2>
                                <For each={section.encounters}>{encounterCard}</For>
                            </section>
                        }</For>
                    </div>
                }</For>
            </div>
            <Show when={props.model.additionalEncounters.length > 0}>
                <section class="kcq-encounter-picker__section kcq-encounter-picker__additional" aria-label={props.model.additionalEncountersLabel}>
                    <h2>{props.model.additionalEncountersLabel}</h2>
                    <div class="kcq-encounter-picker__additional-list">
                        <For each={props.model.additionalEncounters}>{encounterCard}</For>
                    </div>
                </section>
            </Show>
        </Show>
        }
        footer={
            (props.onBack || props.onChangeParty) && <footer class="kcq-screen-actions kcq-pregame-actions kcq-encounter-details__footer">
                <Show when={props.onBack}><button class="kcq-targeting__back kcq-shortcut-host" data-kcq-shortcut={COMBAT_SHORTCUTS.back} type="button" onClick={props.onBack}>
                    <Shortcut shortcut={COMBAT_SHORTCUTS.back} />
                    <span aria-hidden="true">↶ </span>{props.model.backLabel}
                </button></Show>
                <Show when={props.onChangeParty}>
                    <button class="kcq-targeting__back kcq-encounter-picker__change-party" type="button" onClick={props.onChangeParty}>{props.model.changePartyLabel}</button>
                </Show>
            </footer>
        }
    />;
}
