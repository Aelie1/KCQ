import type { ContentLibrary, EncounterReference } from "../../../../engine/public/library";
import type { DifficultyId, EncounterId, EnemyRank } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { createEffectPreviewViewModels, type EffectPreviewViewModel } from "./effectPreviews";

export interface EncounterSummaryViewModel {
    id: EncounterId;
    name: string;
    stars: string;
    challengeLabel: string;
    bestClear?: DifficultyId;
    bestClearLabel: string;
}
export interface EncounterPickerViewModel {
    title: string;
    settingsLabel: string;
    encounters: readonly EncounterSummaryViewModel[];
}
export interface EncounterEnemyViewModel {
    name: string;
    rank: EnemyRank;
    rankLabel: string;
    rankTone: "danger" | "warning" | "neutral";
    hp: number;
    hpLabel: string;
}
export interface EncounterDetailsViewModel extends EncounterSummaryViewModel {
    description: string;
    enemies: readonly EncounterEnemyViewModel[];
    effects: readonly EffectPreviewViewModel[];
    labels: {
        settings: string; challenge: string; bestClear: string; description: string;
        enemies: string; specialRules: string; start: string;
    };
}

export function encounterStars(stars: number): string {
    const filled = Math.min(5, Math.max(0, Math.trunc(stars)));
    return "★".repeat(filled) + "☆".repeat(5 - filled);
}

function encounterSummary(
    encounter: EncounterReference, presentation: Presentation, bestClear?: DifficultyId,
): EncounterSummaryViewModel {
    return {
        id: encounter.id,
        name: presentation.encounter(encounter.id),
        stars: encounterStars(encounter.stars),
        challengeLabel: presentation.ui("encounter.challengeAccessible", { stars: encounter.stars }),
        ...(bestClear ? { bestClear } : {}),
        bestClearLabel: `👑 ${bestClear ? presentation.difficulty(bestClear) : presentation.ui("encounter.uncleared")}`,
    };
}

export function createEncounterPickerViewModel(
    library: ContentLibrary, presentation: Presentation,
    bestClears: Readonly<Partial<Record<EncounterId, DifficultyId>>> = {},
): EncounterPickerViewModel {
    return {
        title: presentation.ui("encounterPicker.title"),
        settingsLabel: presentation.ui("battleOverview.settings"),
        encounters: Object.values(library.encounters).map((encounter) =>
            encounterSummary(encounter, presentation, bestClears[encounter.id])),
    };
}

export function createEncounterDetailsViewModel(
    library: ContentLibrary, encounterId: EncounterId, presentation: Presentation, bestClear?: DifficultyId,
): EncounterDetailsViewModel {
    const encounter = library.encounters[encounterId];
    if (!encounter) throw new Error(`Missing encounter reference: ${encounterId}`);
    return {
        ...encounterSummary(encounter, presentation, bestClear),
        description: presentation.encounter(encounter.id, "desc"),
        enemies: encounter.enemies.map((setup) => {
            const enemy = library.enemies[setup.defId];
            if (!enemy) throw new Error(`Missing enemy reference: ${setup.defId}`);
            return {
                name: setup.id ? presentation.entity(setup.id) : presentation.enemyDefinition(setup.defId),
                rank: enemy.rank,
                rankLabel: presentation.enemyRank(enemy.rank),
                rankTone: enemy.rank === "boss" ? "danger" : enemy.rank === "enemy" ? "warning" : "neutral",
                hp: enemy.hp,
                hpLabel: presentation.ui("encounter.hp", { hp: enemy.hp }),
            };
        }),
        effects: createEffectPreviewViewModels(encounter.setup, { presentation }, "encounter-setup"),
        labels: {
            settings: presentation.ui("battleOverview.settings"),
            challenge: presentation.ui("encounter.challenge"),
            bestClear: presentation.ui("encounter.bestClear"),
            description: presentation.ui("encounter.description"),
            enemies: presentation.ui("encounter.enemies"),
            specialRules: presentation.ui("encounter.specialRules"),
            start: presentation.ui("encounter.start"),
        },
    };
}
