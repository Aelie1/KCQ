import { For, type JSX } from "solid-js";
import type { KCQCampaign } from "../../../../content";
import type { LanguageSelection } from "../language";
import type { TitleViewModel } from "../viewModels/title";
import { ScreenLayout } from "./ScreenLayout";

export function TitleScreen(props: {
    model: TitleViewModel;
    language: LanguageSelection;
    onSelect: (campaign: KCQCampaign) => void;
}): JSX.Element {
    return <ScreenLayout class="kcq-title-screen"
        header={<h1 class="kcq-title-screen__title">{props.model.title}</h1>}
        body={<div class="kcq-title-screen__campaigns">
            <h2>{props.model.campaignsHeading}</h2>
            <For each={props.model.campaigns}>
                {campaign => <button class="kcq-encounter-card kcq-title-screen__campaign" type="button"
                    onClick={() => props.onSelect(campaign.id)}>
                    <strong>{campaign.name}</strong>
                    <span>{campaign.description}</span>
                </button>}
            </For>
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
