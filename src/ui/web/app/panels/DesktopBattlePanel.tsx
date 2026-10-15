import { createMemo, For, Show, type JSX } from "solid-js";
import type { ActionView, EntityId, GameState, ThresholdInfo } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { reactionRef } from "../combatReactions";
import { CharacterBindings, CharacterCapabilities } from "../components/CharacterStatus";
import { CharacterCommands } from "../components/CharacterCommands";
import { CombatHeader } from "../components/CombatHeader";
import { EffectDetails } from "../components/EffectDetails";
import { Shortcut } from "../components/Shortcut";
import { StatusChip } from "../components/StatusChip";
import { COMBAT_SHORTCUTS } from "../keyboard";
import type { BattleOverviewViewModel } from "../viewModels/battleOverview";
import { createCharacterDetailsViewModel, type CharacterDetailsViewModel } from "../viewModels/characterDetails";

export function DesktopBattleHeader(props: {
    model: BattleOverviewViewModel;
    presentation: Presentation;
    onSettings?: () => void;
    onLibrary?: () => void;
}): JSX.Element {
    return <div class="kcq-desktop-battle__header">
        <CombatHeader variant="overview" {...props.model.header}
            settingsLabel={props.model.controls.settingsLabel} onSettings={props.onSettings}
            libraryLabel={props.presentation.ui("library.title")} onLibrary={props.onLibrary} />
    </div>;
}

export function DesktopBattleParty(props: {
    state: GameState;
    actions: readonly ActionView[];
    thresholds: ThresholdInfo;
    presentation: Presentation;
    selectedActorId?: EntityId;
    shortcuts: boolean;
    onSelectCharacter: (id: EntityId) => void;
}): JSX.Element {
    return <section class="kcq-desktop-battle__party" aria-label={props.presentation.ui("battleOverview.party")}>
        <For each={props.state.characters.map(character => character.id)}>{(id, index) => {
            const model = createMemo(() => createCharacterDetailsViewModel(
                props.state, props.actions, id, props.thresholds, props.presentation, true));
            return <article class="kcq-desktop-character" data-actor-id={id}
                classList={{ "is-selected": props.selectedActorId === id }} aria-label={model().focused.name}>
                <div class="kcq-desktop-character__overview">
                    <button ref={reactionRef("actor", () => id)} type="button"
                        class="kcq-desktop-character__identity kcq-shortcut-host"
                        aria-pressed={props.selectedActorId === id}
                        data-kcq-shortcut={props.shortcuts ? String(index() + 1) : undefined}
                        onClick={() => props.onSelectCharacter(id)}>
                        <Shortcut shortcut={props.shortcuts ? String(index() + 1) : undefined} />
                        <strong class={`kcq-player-identity--${model().focused.tone}`}>{model().focused.name}</strong>
                        <StatusChip tone={model().focused.actionState.tone}>{model().focused.actionState.label}</StatusChip>
                        <StatusChip tone={model().focused.stanceState.tone}>{model().focused.stanceState.label}</StatusChip>
                    </button>
                    <section class="kcq-character-section kcq-character-effects" aria-label={model().labels.buffsHeading}>
                        <h2>{model().labels.buffsHeading}</h2>
                        <EffectDetails entityId={id} effects={model().focused.effects} />
                    </section>
                </div>
                <CharacterCapabilities model={model()} headingPrefix={`desktop-${id}`} />
                <CharacterBindings model={model()} headingPrefix={`desktop-${id}`} floatingNumbers />
            </article>;
        }}</For>
    </section>;
}

export function DesktopBattleActions(props: {
    model?: CharacterDetailsViewModel;
    overview: BattleOverviewViewModel;
    presentation: Presentation;
    shortcuts: boolean;
    blocked: boolean;
    onSelectCommand: (actor: EntityId, command: string) => void;
    onEndTurn: () => void;
}): JSX.Element {
    const endTurn = () => <button class="kcq-battle-overview__primary-action kcq-shortcut-host" type="button"
        classList={{ "is-dimmed": props.overview.controls.endTurnDimmed }} disabled={props.blocked}
        onClick={props.onEndTurn}>
        <Shortcut shortcut={COMBAT_SHORTCUTS.endTurn} /> {props.overview.controls.endTurnLabel}
    </button>;
    return <section class="kcq-desktop-battle__actions">
        <div class="kcq-desktop-battle__commands">
            <Show when={props.model} fallback={<div class="kcq-character-commands__grid">{endTurn()}</div>}>
                {model => <CharacterCommands model={model()} presentation={props.presentation}
                    headingId="desktop-character-commands-heading" shortcuts={props.shortcuts}
                    gridAction={endTurn()}
                    onSelectCommand={command => props.onSelectCommand(model().focused.id, command)} />}
            </Show>
        </div>
    </section>;
}
