import type { ContentLibrary } from "../../../engine/public/library";
import type { CampaignId, EncounterId } from "../../../engine/public/types";

export function getNextEncounter(
    library: ContentLibrary, campaign: CampaignId | undefined, encounter: EncounterId, outcome: "victory" | "defeat",
): EncounterId | undefined {
    const next = campaign ? library.campaigns[campaign]?.[outcome][encounter]?.[0] : undefined;
    return next && Object.hasOwn(library.encounters, next) ? next : undefined;
}
