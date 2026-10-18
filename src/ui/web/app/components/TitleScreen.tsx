import { createSignal, For, Show, type JSX } from "solid-js";
import type { KCQCampaign } from "../../../../content";
import type { LanguageSelection } from "../language";
import type { SaveReadResult } from "../savePersistence";
import type { TitleViewModel } from "../viewModels/title";
import { ScreenLayout } from "./ScreenLayout";

export function TitleScreen(props: {
    model: TitleViewModel;
    language: LanguageSelection;
    onSelect: (campaign: KCQCampaign) => void;
    onChangeParty?: () => void;
    saveStatus?: SaveReadResult["status"];
    onContinue?: () => void;
    onDelete?: () => boolean;
}): JSX.Element {
    const [confirming, setConfirming] = createSignal(false);
    const [deleteFailed, setDeleteFailed] = createSignal(false);
    let deleteButton: HTMLButtonElement | undefined;
    let cancelButton: HTMLButtonElement | undefined;
    let campaignsHeading: HTMLHeadingElement | undefined;
    const cancelDelete = () => {
        setConfirming(false);
        setDeleteFailed(false);
        deleteButton?.focus();
    };
    const toggleDelete = () => {
        if (confirming()) cancelDelete();
        else { setConfirming(true); cancelButton?.focus(); }
    };
    const confirmDelete = () => {
        if (props.onDelete?.()) {
            setConfirming(false);
            setDeleteFailed(false);
            campaignsHeading?.focus();
        } else setDeleteFailed(true);
    };
    const saveMessage = () => {
        const status = props.saveStatus;
        return status === "incompatible" || status === "corrupted" || status === "inaccessible"
            ? props.model.saveMessages[status] : undefined;
    };
    return <ScreenLayout class="kcq-title-screen"
        header={<h1 class="kcq-title-screen__title">{props.model.title}</h1>}
        body={<div class="kcq-title-screen__campaigns">
            <Show when={props.saveStatus && props.saveStatus !== "missing"}>
                <h2>{props.model.resumeHeading}</h2>
                <section class="kcq-encounter-card kcq-title-screen__resume" aria-label={props.model.resumeHeading}>
                    <Show when={props.saveStatus === "loaded" && props.model.resume}>
                        {resume => <div class="kcq-title-screen__resume-content">
                            <div class="kcq-title-screen__resume-details">
                                <strong>{resume().campaign}</strong>
                                <p>
                                    {resume().summary}
                                    {resume().progress && ` · ${resume().progress}`}
                                </p>
                            </div>
                            <div class="kcq-title-screen__resume-buttons" >
                                <button ref={deleteButton} class="kcq-title-screen__save-action" type="button"
                                    aria-expanded={confirming()} onClick={toggleDelete}>{props.model.deleteLabel}</button>

                                <button class="kcq-battle-overview__primary-action kcq-title-screen__continue" type="button"
                                    onClick={() => props.onContinue?.()}>{props.model.continueLabel}</button>
                            </div>
                        </div>}
                    </Show>
                    <Show when={saveMessage()}>{message => <p class="kcq-title-screen__save-message" role="status">{message()}</p>}</Show>
                    <Show when={saveMessage()}>
                        <button ref={deleteButton} class="kcq-title-screen__save-action" type="button"
                            aria-expanded={confirming()} onClick={toggleDelete}>{props.model.deleteLabel}</button>
                    </Show>
                    <Show when={confirming()}>
                        <div class="kcq-title-screen__delete-confirmation" role="group" aria-label={props.model.deletePrompt}
                            onKeyDown={event => {
                                if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelDelete(); }
                            }}>
                            <p>{props.model.deletePrompt}</p>
                            <button ref={cancelButton} class="kcq-title-screen__save-action" type="button"
                                onClick={cancelDelete}>{props.model.deleteCancelLabel}</button>
                            <button class="kcq-title-screen__save-action" type="button"
                                onClick={confirmDelete}>{props.model.deleteConfirmLabel}</button>
                            <Show when={deleteFailed()}><p role="alert">{props.model.deleteError}</p></Show>
                        </div>
                    </Show>
                </section>
            </Show>
            <h2 ref={campaignsHeading} tabIndex={-1}>{props.model.campaignsHeading}</h2>
            <For each={props.model.campaigns}>
                {campaign => <button class="kcq-encounter-card kcq-title-screen__campaign" type="button"
                    onClick={() => props.onSelect(campaign.id)}>
                    <strong>{campaign.name}</strong>
                    <span>{campaign.description}</span>
                </button>}
            </For>
            <Show when={props.onChangeParty}>
                <div class="kcq-encounter-card kcq-title-screen__party">
                    <p>{props.model.partySummary}</p>
                    <button class="kcq-targeting__back" type="button" onClick={props.onChangeParty}>{props.model.changePartyLabel}</button>
                </div>
            </Show>
        </div>}
        footer={<div class="kcq-title-screen__bottom">
            <label class="kcq-title-screen__language">
                <span class="kcq-title-screen__language-label">{props.model.languageLabel}</span>
                <span class="kcq-title-screen__language-control">
                    <select value={props.language.value}
                        onChange={event => props.language.onChange(event.currentTarget.value)}>
                        <For each={props.language.options}>
                            {option => <option value={option.id}>{option.label}</option>}
                        </For>
                    </select>
                    <span class="kcq-title-screen__language-arrow" aria-hidden="true">v</span>
                </span>
            </label>
            <footer class="kcq-title-screen__credits">
                <div>
                    <p>{props.model.credit}</p>
                    <p>{props.model.copyright}</p>
                </div>
                <p class="kcq-title-screen__version">{props.model.version}</p>
            </footer>
        </div>}
    />;
}
