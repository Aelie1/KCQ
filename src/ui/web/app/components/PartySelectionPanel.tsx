import { For, createUniqueId, type JSX } from "solid-js";
import type { KCQCharacter } from "../../../../content";
import libraryIconUrl from "../assets/library.svg";
import { COMBAT_SHORTCUTS, combatShortcut } from "../keyboard";
import type { PartySelectionViewModel } from "../viewModels/partySelection";
import { ScreenLayout } from "./ScreenLayout";
import { Shortcut } from "./Shortcut";

export function PartySelectionPanel(props: {
    model: PartySelectionViewModel;
    canContinue: boolean;
    onToggle: (id: KCQCharacter) => void;
    onLibrary: (id: KCQCharacter) => void;
    onBack: () => void;
    onContinue: () => void;
}): JSX.Element {
    const instructionsId = createUniqueId();
    return <ScreenLayout class="kcq-encounter-screen kcq-party-selection" ariaLabel={props.model.title}
        header={<header class="kcq-party-selection__header">
            <h1>{props.model.title}</h1>
            <p id={instructionsId}>{props.model.instructions}</p>
            <p role="status" aria-live="polite">{props.model.countLabel}</p>
        </header>}
        body={<div class="kcq-party-selection__characters" role="group" aria-label={props.model.title} aria-describedby={instructionsId}>
            <For each={props.model.characters}>{(character, index) => {
                const nameId = createUniqueId();
                const descriptionId = createUniqueId();
                return <div class="kcq-encounter-card kcq-party-selection__card"
                    classList={{ "is-selected": character.selected, "is-disabled": character.disabled }}>
                    <button type="button" class="kcq-party-selection__toggle kcq-shortcut-host"
                        data-character-id={character.id} data-kcq-shortcut={combatShortcut(index())}
                        data-kcq-native-activation
                        aria-pressed={character.selected} aria-labelledby={nameId} aria-describedby={descriptionId}
                        disabled={character.disabled} onClick={() => props.onToggle(character.id)}>
                        <Shortcut shortcut={combatShortcut(index())} />
                        <span class="kcq-party-selection__identity">
                            <strong id={nameId}>{character.name}</strong>
                        </span>
                        <span id={descriptionId} class="kcq-party-selection__description">
                            <span class="kcq-party-selection__role">{character.role}</span>
                            <span role="list" class="kcq-party-selection__points">
                                <For each={character.points}>{point => <span role="listitem">{point}</span>}</For>
                            </span>
                        </span>
                    </button>
                    <button type="button" class="kcq-combat-header__library kcq-party-selection__library"
                        data-kcq-native-activation aria-label={character.libraryLabel} title={character.libraryLabel}
                        onClick={() => props.onLibrary(character.id)}>
                        <img src={libraryIconUrl} alt="" width="22" height="22" />
                    </button>
                </div>;
            }}</For>
        </div>}
        footer={<footer class="kcq-screen-actions kcq-pregame-actions kcq-encounter-details__footer">
            <button class="kcq-targeting__back kcq-shortcut-host" type="button" data-kcq-shortcut={COMBAT_SHORTCUTS.back} onClick={props.onBack}>
                <Shortcut shortcut={COMBAT_SHORTCUTS.back} /><span aria-hidden="true">↶ </span>{props.model.backLabel}
            </button>
            <button class="kcq-battle-overview__primary-action kcq-party-selection__continue kcq-shortcut-host" type="button"
                data-kcq-shortcut="enter" disabled={!props.canContinue} onClick={props.onContinue}>
                <Shortcut shortcut="Enter" />{props.model.continueLabel}
            </button>
        </footer>}
    />;
}
