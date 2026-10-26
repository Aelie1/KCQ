import type { CampaignReference, ContentLibrary, EncounterReference } from "../../../../engine/public/library";
import { getThresholds } from "../../../../engine/public/mechanics";
import type { CampaignId, DifficultyId, EncounterId, EnemyRank } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { getNextEncounter } from "../nextEncounter";
import { groupEffectPreviews, type EffectGroupViewModel } from "./effectGroups";
import type { EffectPreviewViewModel } from "./effectPreviews";

export interface EncounterSummaryViewModel {
    id: EncounterId;
    name: string;
    stars: number;
    starsText: string;
    challengeLabel: string;
    bestClear?: DifficultyId;
    bestClearLabel: string;
}
export interface EncounterPickerViewModel {
    title: string;
    settingsLabel: string;
    backLabel: string;
    changePartyLabel: string;
    showAllLabel: string;
    showAll: boolean;
    encounters: readonly (EncounterSummaryViewModel & { locked: boolean })[];
    layout?: readonly (readonly EncounterPickerSectionViewModel[])[];
    additionalEncounters: EncounterPickerViewModel["encounters"];
    additionalEncountersLabel: string;
}
export interface EncounterPickerSectionViewModel {
    name: string;
    encounters: EncounterPickerViewModel["encounters"];
}
export interface EncounterEnemyViewModel {
    name: string;
    rank: EnemyRank;
    rankLabel: string;
    rankTone: "danger" | "warning" | "success" | "neutral";
    hp: number;
    hpLabel: string;
}
export interface EncounterDetailsViewModel extends EncounterSummaryViewModel {
    description: string;
    nextEncounter?: EncounterId;
    victory?: string;
    defeat?: string;
    enemies: readonly EncounterEnemyViewModel[];
    effects: readonly EffectPreviewViewModel[];
    effectGroups: readonly EffectGroupViewModel[];
    labels: {
        settings: string; challenge: string; bestClear: string; description: string;
        victory: string; defeat: string; narrativeUnavailable: string;
        enemies: string; specialRules: string; chooseDifficulty: string; back: string; nextLevel: string;
    };
}

export function encounterStars(stars: number): string {
    const filled = Math.max(0, Math.trunc(stars));
    return "★".repeat(filled);
}

function encounterSummary(
    encounter: EncounterReference, presentation: Presentation, bestClear?: DifficultyId,
): EncounterSummaryViewModel {
    return {
        id: encounter.id,
        name: presentation.encounter(encounter.id),
        stars: encounter.stars,
        starsText: encounterStars(encounter.stars),
        challengeLabel: presentation.ui("encounter.challengeAccessible", { stars: encounter.stars }),
        ...(bestClear ? { bestClear } : {}),
        bestClearLabel: `👑 ${bestClear ? presentation.difficulty(bestClear) : presentation.ui("encounter.uncleared")}`,
    };
}

export function createEncounterPickerViewModel(
    library: ContentLibrary, presentation: Presentation, campaign: CampaignReference,
    bestClears: Readonly<Partial<Record<EncounterId, DifficultyId>>> = {},
    unlocked: readonly EncounterId[] = [], showAll = false,
): EncounterPickerViewModel {
    const available = new Set([...campaign.initial, ...unlocked]);
    const progression = [...Object.entries(campaign.victory), ...Object.entries(campaign.defeat)];
    const campaignIds = new Set([...campaign.initial, ...progression.flatMap(([id, next]) => [id, ...next])]);
    const remaining = Object.values(library.encounters).filter(encounter => campaignIds.has(encounter.id));
    const encounters: EncounterReference[] = [];
    // Keep predecessors before their unlocks, using catalog order for parallel branches.
    // Fall back to catalog order if a future campaign contains a progression cycle.
    while (remaining.length > 0) {
        const pending = new Set(remaining.map(encounter => encounter.id));
        const index = remaining.findIndex(encounter => !progression.some(([id, next]) =>
            pending.has(id) && next.includes(encounter.id)));
        encounters.push(...remaining.splice(index < 0 ? 0 : index, 1));
    }
    if (showAll) encounters.push(...Object.values(library.encounters).filter(encounter => !campaignIds.has(encounter.id)));
    const summaries = encounters.map(encounter => {
        const locked = !showAll && !available.has(encounter.id);
        const summary = encounterSummary(encounter, presentation, locked ? undefined : bestClears[encounter.id]);
        return { ...summary, locked, name: locked ? summary.name.replace(/\S/gu, "?") : summary.name };
    });
    const summariesById = new Map(summaries.map(encounter => [encounter.id, encounter]));
    const layout = campaign.layout?.map(row => row.map(section => ({
        name: presentation.campaignSection(campaign.id, section.name),
        encounters: section.chapters.flatMap(id => {
            const summary = summariesById.get(id);
            return summary ? [summary] : [];
        }),
    })));
    const layoutIds = new Set(layout?.flatMap(row => row.flatMap(section => section.encounters.map(({ id }) => id))));
    return {
        title: presentation.campaign(campaign.id),
        settingsLabel: presentation.ui("battleOverview.settings"),
        backLabel: presentation.ui("targeting.back"),
        changePartyLabel: presentation.ui("party.change"),
        showAllLabel: presentation.ui("encounter.showAll"),
        showAll,
        encounters: summaries,
        layout,
        additionalEncounters: layout ? summaries.filter(({ id }) => !layoutIds.has(id)) : [],
        additionalEncountersLabel: presentation.ui("encounter.additionalEncounters"),
    };
}

export function createEncounterDetailsViewModel(
    library: ContentLibrary, encounterId: EncounterId, presentation: Presentation, bestClear?: DifficultyId, campaign?: CampaignId,
): EncounterDetailsViewModel {
    const encounter = library.encounters[encounterId];
    if (!encounter) throw new Error(`Missing encounter reference: ${encounterId}`);
    const grouped = groupEffectPreviews(encounter.setup, {
        presentation, encounterSetup: true, thresholds: getThresholds(),
    }, "encounter-setup");
    return {
        ...encounterSummary(encounter, presentation, bestClear),
        description: presentation.encounter(encounter.id, "desc"),
        nextEncounter: encounter.stars === 0 ? getNextEncounter(library, campaign, encounterId, "victory") : undefined,
        victory: bestClear ? presentation.referenceText("encounter", encounter.id, "victory") : undefined,
        defeat: bestClear ? presentation.referenceText("encounter", encounter.id, "defeat") : undefined,
        enemies: encounter.enemies.map((setup) => {
            const enemy = library.enemies[setup.defId];
            if (!enemy) throw new Error(`Missing enemy reference: ${setup.defId}`);
            return {
                name: setup.id ? presentation.entity(setup.id) : presentation.enemyDefinition(setup.defId),
                rank: enemy.rank,
                rankLabel: presentation.enemyRank(enemy.rank),
                rankTone: enemy.rank === "boss" ? "danger" : enemy.rank === "elite" ? "warning" : enemy.rank === "enemy" ? "success" : "neutral",
                hp: enemy.hp,
                hpLabel: presentation.ui("encounter.hp", { hp: enemy.hp }),
            };
        }),
        effects: grouped.ungrouped,
        effectGroups: grouped.groups,
        labels: {
            settings: presentation.ui("battleOverview.settings"),
            challenge: presentation.ui("encounter.challenge"),
            bestClear: presentation.ui("encounter.bestClear"),
            description: presentation.ui("encounter.description"),
            victory: presentation.battleState("victory"),
            defeat: presentation.battleState("defeat"),
            narrativeUnavailable: presentation.ui("action.unavailable"),
            enemies: presentation.ui("encounter.enemies"),
            specialRules: presentation.ui("encounter.specialRules"),
            chooseDifficulty: presentation.ui("encounter.chooseDifficulty"),
            nextLevel: presentation.ui("encounter.nextLevel"),
            back: presentation.ui("targeting.back"),
        },
    };
}
