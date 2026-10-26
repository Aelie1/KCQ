import type { Presentation } from "../../../presentation/presentation";
import { releaseHistory, type ReleaseHistory } from "../content/releaseHistory";

export function createPatchNotesViewModel(presentation: Presentation, history: ReleaseHistory = releaseHistory) {
    return {
        heading: presentation.ui("patchNotes.title"),
        backLabel: presentation.ui("patchNotes.back"),
        releases: history.releases.map(release => ({
            version: release.version,
            title: release.titleKey ? presentation.ui(release.titleKey) : undefined,
            sections: release.sections.map(section => ({
                heading: section.headingKey ? presentation.ui(section.headingKey) : undefined,
                bullets: section.bulletKeys.map(key => presentation.ui(key)),
            })),
        })),
    };
}

export type PatchNotesViewModel = ReturnType<typeof createPatchNotesViewModel>;
