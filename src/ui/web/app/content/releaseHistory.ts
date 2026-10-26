export interface ReleaseNotes {
    version: string;
    titleKey?: string;
    sections: readonly {
        headingKey?: string;
        bulletKeys: readonly string[];
    }[];
}

export interface ReleaseHistory {
    /** Newest first; versions are display identifiers, not sortable semantic versions. */
    releases: readonly ReleaseNotes[];
}

// Replace these placeholder releases and their localized strings with real notes.
export const releaseHistory: ReleaseHistory = {
    releases: [
        {
            version: "1.1.0",
            titleKey: "patchNotes.1.1.0.title",
            sections: [{ bulletKeys: ["patchNotes.1.1.0.line1", "patchNotes.1.1.0.line2"] }],
        },
        {
            version: "1.0.1",
            titleKey: "patchNotes.1.0.1.title",
            sections: [{ bulletKeys: ["patchNotes.1.0.1.line1"] }],
        },
        {
            version: "1.0.0",
            titleKey: "patchNotes.1.0.0.title",
            sections: [{ bulletKeys: ["patchNotes.1.0.0.line1", "patchNotes.1.0.0.line2"] }],
        },
    ],
};
