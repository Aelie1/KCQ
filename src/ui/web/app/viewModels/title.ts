import type { KCQCampaign, KCQCharacter } from "../../../../content";
import { stockCharacters } from "../../../../stock";
import type { Presentation } from "../../../presentation/presentation";
import type { SavePackage } from "../savePackage";
import { displayVersion } from "../version";

export interface TitleViewModel {
    title: string;
    campaignsHeading: string;
    partyHeading: string;
    changePartyLabel: string;
    partySummary: string;
    continueLabel: string;
    resumeHeading: string;
    deleteLabel: string;
    deletePrompt: string;
    deleteConfirmLabel: string;
    deleteCancelLabel: string;
    deleteError: string;
    resume?: {
        campaign: string;
        summary: string;
        progress?: string;
    };
    saveMessages: Record<"incompatible" | "corrupted" | "inaccessible", string>;
    version: string;
    credit: string;
    copyright: string;
    languageLabel: string;
    campaigns: readonly { id: KCQCampaign; name: string; description: string }[];
}

export function createTitleViewModel(
    campaigns: readonly KCQCampaign[], presentation: Presentation, release: string, save?: SavePackage,
    party: readonly KCQCharacter[] = stockCharacters,
): TitleViewModel {
    const progress = save?.stats.stats.progress;
    const hp = progress?.boss ?? progress?.enemies;

    const progressLabel = hp === undefined ? undefined : presentation.ui(
        progress?.boss !== undefined
            ? "battleResult.bossHp.short"
            : "battleResult.enemyHp.short",
        { percent: Math.round(hp * 100) },
    );
    return {
        title: presentation.ui("title.name"),
        campaignsHeading: presentation.ui("title.campaigns"),
        partyHeading: presentation.ui("title.party"),
        changePartyLabel: presentation.ui("party.change"),
        partySummary: party.map(id => presentation.entity(id)).join(", "),
        continueLabel: presentation.ui("title.continue"),
        resumeHeading: presentation.ui("title.resumeBattle"),
        deleteLabel: presentation.ui("title.save.delete"),
        deletePrompt: presentation.ui("title.save.deletePrompt"),
        deleteConfirmLabel: presentation.ui("title.save.deleteConfirm"),
        deleteCancelLabel: presentation.ui("title.save.deleteCancel"),
        deleteError: presentation.ui("title.save.deleteError"),
        resume: save ? {
            campaign: campaigns.includes(save.saveState.campaign as KCQCampaign)
                ? presentation.campaign(save.saveState.campaign) : presentation.ui("battleOverview.noEncounter"),
            summary: presentation.ui("title.save.summary", {
                encounter: save.saveState.encounter
                    ? presentation.referenceText("encounter", save.saveState.encounter, "name") ?? presentation.ui("battleOverview.noEncounter")
                    : presentation.ui("battleOverview.noEncounter"),
                difficulty: presentation.referenceText("difficulty", save.saveState.difficulty, "name")
                    ?? presentation.ui("title.save.unknownDifficulty"),
                round: presentation.ui("battleOverview.round", { round: save.saveState.turn.round }),
            }),
            progress: progressLabel
        } : undefined,
        saveMessages: {
            incompatible: presentation.ui("title.save.incompatible"),
            corrupted: presentation.ui("title.save.corrupted"),
            inaccessible: presentation.ui("title.save.inaccessible"),
        },
        version: presentation.ui("version.name", { version: displayVersion(release) }),
        credit: presentation.ui("title.credit"),
        copyright: presentation.ui("title.copyright"),
        languageLabel: presentation.ui("battleSettings.language"),
        campaigns: campaigns.map(id => ({
            id, name: presentation.campaign(id), description: presentation.campaign(id, "desc"),
        })),
    };
}
