import type { KCQCampaign } from "../../../../content";
import type { Presentation } from "../../../presentation/presentation";
import { displayVersion } from "../version";

export interface TitleViewModel {
    title: string;
    campaignsHeading: string;
    version: string;
    credit: string;
    copyright: string;
    languageLabel: string;
    campaigns: readonly { id: KCQCampaign; name: string; description: string }[];
}

export function createTitleViewModel(
    campaigns: readonly KCQCampaign[], presentation: Presentation, release: string,
): TitleViewModel {
    return {
        title: presentation.ui("title.name"),
        campaignsHeading: presentation.ui("title.campaigns"),
        version: presentation.ui("version.name", { version: displayVersion(release) }),
        credit: presentation.ui("title.credit"),
        copyright: presentation.ui("title.copyright"),
        languageLabel: presentation.ui("battleSettings.language"),
        campaigns: campaigns.map(id => ({
            id, name: presentation.campaign(id), description: presentation.campaign(id, "desc"),
        })),
    };
}
