import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import { getStringTable } from "../../localization";
import { Presentation } from "../../src/ui/presentation/presentation";
import { patchNotesScreen } from "../../src/ui/web/app/components/patchNotesScreen";
import { releaseHistory } from "../../src/ui/web/app/content/releaseHistory";
import { hasSeenPatchNotes, markpatchNotesSeen, PATCH_NOTES_STORAGE_KEY } from "../../src/ui/web/app/patchNotes";
import { createpatchNotesViewModel } from "../../src/ui/web/app/viewModels/patchNotes";

// Render portal contents inline for server-side content assertions.
vi.mock("solid-js/web", async importOriginal => ({
    ...await importOriginal<typeof import("solid-js/web")>(),
    Portal: (props: { children: ReturnType<typeof createComponent> }) => props.children,
}));

describe("Patch Notes storage", () => {
    it.each([null, "", "{}", "null", "\"1.1.0\"", "broken JSON {", "1.0.1", "v1.1.0"])(
        "treats missing, malformed or different values (%j) as unseen", saved => {
            expect(hasSeenPatchNotes("1.1.0", { getItem: () => saved })).toBe(false);
        },
    );

    it("compares arbitrary visible version strings exactly and saves them as plain strings", () => {
        const values = new Map<string, string>();
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => { values.set(key, value); }
        };
        markpatchNotesSeen("preview \u00b7 abc123", storage);
        expect(values.get(PATCH_NOTES_STORAGE_KEY)).toBe("preview \u00b7 abc123");
        expect(hasSeenPatchNotes("preview \u00b7 abc123", storage)).toBe(true);
        expect(hasSeenPatchNotes("preview \u00b7 def456", storage)).toBe(false);
    });

    it("handles unavailable storage without throwing", () => {
        expect(hasSeenPatchNotes("1.1.0", { getItem: () => { throw new Error("denied"); } })).toBe(false);
        expect(() => markpatchNotesSeen("1.1.0", { setItem: () => { throw new Error("full"); } })).not.toThrow();
        // Node has no window; default storage access must be safe there as well.
        expect(hasSeenPatchNotes("1.1.0")).toBe(false);
        expect(() => markpatchNotesSeen("1.1.0")).not.toThrow();
    });
});

describe("player release history", () => {
    const presentation = new Presentation(getStringTable("en"));

    it("renders all localized placeholder releases newest first, with nine bullet points and no dates", () => {
        const model = createpatchNotesViewModel(presentation);
        const html = renderToString(() => createComponent(patchNotesScreen, { model, onClose: () => { } }))
            .replace(/\sdata-hk="[^"]*"/g, "").replace(/<!--.*?-->/g, "");
        expect(model.releases.map(release => release.version)).toEqual(["1.1.0", "1.0.1", "1.0.0"]);
        expect(model.releases.map(release => release.title)).toEqual([
            "Storytelling Improvements", "Quality-of-Life Update", "Initial Release",
        ]);
        expect(html.match(/>Placeholder</g)).toHaveLength(9);
        expect(html).not.toContain("kcq-patch-notes__notice");
        expect(html.indexOf("1.1.0")).toBeLessThan(html.indexOf("1.0.1"));
        expect(html.indexOf("1.0.1")).toBeLessThan(html.indexOf("1.0.0"));
        expect(html.match(/<li>/g)).toHaveLength(9);
        expect(html).not.toContain("<time");
        for (const release of releaseHistory.releases) {
            for (const section of release.sections) {
                for (const key of section.bulletKeys) expect(html).toContain(presentation.ui(key));
            }
        }
        expect(html).not.toMatch(/\[ui\./);
    });

    it("supports optional titles, section headings, multiple sections and replacement notes without UI changes", () => {
        const localized = new Presentation({
            "ui.patchNotes.title": "Localized updates", "ui.patchNotes.back": "Retour",
            "ui.notes.heading": "Localized improvements", "ui.notes.bullet": "Nouvelle interface.",
        });
        const model = createpatchNotesViewModel(localized, {
            releases: [{
                version: "next", sections: [
                    { headingKey: "notes.heading", bulletKeys: ["notes.bullet"] },
                    { bulletKeys: ["notes.bullet"] },
                ]
            }]
        });
        const html = renderToString(() => createComponent(patchNotesScreen, { model, onClose: () => { } }))
            .replace(/\sdata-hk="[^"]*"/g, "").replace(/<!--.*?-->/g, "");
        expect(html).toContain("Localized updates"); expect(html).toContain("Retour");
        expect(html).toContain("<h2>next"); expect(html).not.toContain(" \u2014 ");
        expect(html).toContain("<h3>Localized improvements</h3>");
        expect(html.match(/Nouvelle interface\./g)).toHaveLength(2);
    });
});
