import { For, type JSX } from "solid-js";
import type { KCQCampaign } from "../../../../content";
import type { TitleViewModel } from "../viewModels/title";
import { EncounterHeader } from "./EncounterHeader";
import { ScreenLayout } from "./ScreenLayout";

export function TitleScreen(props: {
    model: TitleViewModel;
    onSelect: (campaign: KCQCampaign) => void;
    onSettings: () => void;
}): JSX.Element {
    return <ScreenLayout class="kcq-title-screen"
        header={<EncounterHeader title={props.model.title} settingsLabel={props.model.settingsLabel}
            onSettings={props.onSettings} />}
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
        footer={<footer class="kcq-title-screen__credits">
            <p>{props.model.version}</p>
            <p>{props.model.credit}</p>
            <p>{props.model.copyright}</p>
        </footer>}
    />;
}
