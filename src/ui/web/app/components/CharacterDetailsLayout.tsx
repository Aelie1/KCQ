import { For, Show, type JSX } from "solid-js";
import type { EntityId } from "../../../../engine/public/types";
import type { CharacterDetailsViewModel } from "../viewModels/characterDetails";
import { reactionRef } from "../combatReactions";
import { CharacterBindings, CharacterCapabilities } from "./CharacterStatus";
import { CombatHeader } from "./CombatHeader";
import { EffectDetails } from "./EffectDetails";
import { ScreenLayout } from "./ScreenLayout";

export interface CharacterDetailsLayoutProps {
    actionRegion: JSX.Element;
    footer: JSX.Element;
    contextLabel: string;
    model: CharacterDetailsViewModel;
    onHeaderBack?: () => void;
    onSelectCharacter?: (id: EntityId) => void;
}

export function CharacterDetailsLayout(props: CharacterDetailsLayoutProps): JSX.Element {
    return (
        <ScreenLayout class="kcq-character-details" ariaLabel={props.model.focused.name}
            header={
                <div class="kcq-character-details__header">
                    <CombatHeader
                        variant="subscreen"
                        encounterLabel={props.model.header.encounterLabel}
                        contextLabel={props.contextLabel}
                        characterLabel={props.model.header.characterLabel}
                        roundLabel={props.model.header.roundLabel}
                        phaseLabel={props.model.header.phaseLabel}
                        backLabel={props.model.controls.backLabel}
                        onBack={props.onHeaderBack}
                    />

                    <nav class="kcq-character-roster" aria-label={props.model.labels.rosterLabel}>
                        <For each={props.model.roster.map(character => character.id)}>
                            {id => {
                                const character = () => props.model.roster.find(character => character.id === id)!;
                                return (
                                    <button
                                        ref={reactionRef("actor", () => id)}
                                        class="kcq-character-roster__card"
                                        classList={{
                                            "kcq-character-roster__card--focused": character().focused,
                                            "kcq-character-roster__card--disabled": character().actionState.kind === "incapacitated",
                                        }}
                                        type="button"
                                        aria-pressed={character().focused}
                                        onClick={() => props.onSelectCharacter?.(character().id)}
                                    >
                                        <span
                                            ref={reactionRef("actor", () => id)}
                                            class="kcq-character-roster__name"
                                            classList={{ [`kcq-player-identity--${character().tone}`]: true }}
                                        >
                                            {character().name}
                                        </span>
                                        <span class="kcq-character-roster__state" aria-label={character().summary}>
                                            <span
                                                class="kcq-character-roster__action"
                                                classList={{ [`kcq-character-roster__action--${character().actionState.tone}`]: true }}
                                            >
                                                {character().actionState.compactLabel}
                                            </span>
                                            <span class="kcq-character-roster__state-separator" aria-hidden="true">{" \u00b7 "}</span>
                                            <span
                                                class="kcq-character-roster__condition"
                                                classList={{ [`kcq-character-roster__condition--${character().stanceState.tone}`]: true }}
                                            >
                                                {character().stanceState.compactLabel}
                                            </span>
                                        </span>
                                    </button>
                                );
                            }}
                        </For>
                    </nav>
                </div>
            }
            body={<>
                <CharacterCapabilities model={props.model} />
                <CharacterBindings model={props.model} />

                <Show when={props.model.focused.effects.length > 0}>
                    <section class="kcq-character-section kcq-character-effects" aria-labelledby="character-effects-heading">
                        <h2 id="character-effects-heading">{props.model.labels.buffsHeading}</h2>
                        <EffectDetails entityId={props.model.focused.id} effects={props.model.focused.effects} />
                    </section>
                </Show>

                {props.actionRegion}
            </>}
            footer={props.footer}
        />
    );
}
