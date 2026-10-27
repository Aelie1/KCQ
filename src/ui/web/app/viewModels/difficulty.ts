import type { ContentLibrary } from "../../../../engine/public/library";
import type { BuffEffect, DifficultyId, EncounterId } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { createEffectPreviewViewModels, type EffectPreviewViewModel } from "./effectPreviews";

export interface DifficultySelectViewModel {
    encounterId: EncounterId;
    encounterName: string;
    selectedDifficulty: DifficultyId;
    selectedDifficultyName: string;
    description: string;
    choices: readonly { id: DifficultyId; label: string; selected: boolean }[];
    globalEffects?: { recipientName: string; effects: readonly EffectPreviewViewModel[] };
    specialRules?: { rows: readonly { enemyId: string; enemyName: string; description: string }[] };
    labels: {
        settings: string; title: string; globalEffects: string; specialRules: string;
        enemyColumn: string; changeColumn: string; back: string; start: string;
    };
}

export function createDifficultySelectViewModel(
    library: ContentLibrary, encounterId: EncounterId, difficulty: DifficultyId, presentation: Presentation,
): DifficultySelectViewModel {
    const encounter = library.encounters[encounterId];
    if (!encounter) throw new Error(`Missing encounter reference: ${encounterId}`);
    const reference = library.difficulties[difficulty];
    if (!reference) throw new Error(`Missing difficulty reference: ${difficulty}`);
    const target = difficulty === "casual" ? "allies" : "enemies";
    const modifierEffect: BuffEffect = {
        type: "buff", operation: "add", target,
        buff: {
            id: "difficultyModifier",
            modifiers: target === "allies" ? reference.playerModifiers : reference.enemyModifiers,
        },
    };
    const rules = Object.values(library.enemies).flatMap(enemy => {
        const description = presentation.referenceText("difficulty", difficulty, enemy.id);
        return description ? [{ enemyId: enemy.id, enemyName: presentation.enemyDefinition(enemy.id), description }] : [];
    });
    return {
        encounterId,
        encounterName: presentation.encounter(encounterId),
        selectedDifficulty: difficulty,
        selectedDifficultyName: presentation.difficulty(difficulty),
        description: presentation.difficulty(difficulty, "desc"),
        choices: Object.values(library.difficulties).map(x => ({ id: x.id, label: presentation.difficulty(x.id), selected: x.id === difficulty })),
        ...(difficulty !== "standard" ? {
            globalEffects: {
                recipientName: presentation.entity(target),
                effects: createEffectPreviewViewModels([modifierEffect], { presentation, scopeTarget: target }, "difficulty"),
            },
        } : {}),
        ...((difficulty === "extreme" || difficulty === "mythic") && rules.length > 0 ? {
            specialRules: {
                rows: rules,
            },
        } : {}),
        labels: {
            settings: presentation.ui("battleOverview.settings"),
            title: presentation.ui("difficulty.title"),
            globalEffects: presentation.ui("difficulty.globalEffects"),
            specialRules: presentation.ui("encounter.specialRules"),
            enemyColumn: presentation.ui("difficulty.enemyColumn"),
            changeColumn: presentation.ui("difficulty.changeColumn"),
            back: presentation.ui("characterDetails.back"),
            start: presentation.ui("encounter.start"),
        },
    };
}
