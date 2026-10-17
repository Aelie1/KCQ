import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { GAME_GUIDE_PAGES } from "../../src/ui/web/app/content/gameGuide";
import { GUIDE_REFERENCES, guideReferenceParts, guideText, resolveGuideReference, type GuideReferenceContext } from "../../src/ui/web/app/viewModels/gameGuide";
import { createLibraryNavigation, libraryEntries, libraryHas, libraryName, type LibraryPage } from "../../src/ui/web/app/viewModels/library";
import { gameGuideEnglishStrings } from "../../localization/en/gameGuide";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
const library = createStockEngine().getLibrary();

describe("Game Guide references", () => {
    it("lists the five pages in authored order independently of engine content", () => {
        const entries = libraryEntries(library, "guide", presentation);
        expect(entries.map(entry => libraryName(entry, presentation))).toEqual(["Basics", "Moves", "Bindings and Escaping", "Modifiers", "Strategy"]);
        expect(libraryEntries(library, "guide", presentation, "escaping")).toEqual([{ category: "guide", id: "bindings-and-escaping" }]);
        expect(libraryHas(library, { category: "guide", id: "missing" })).toBe(false);
        expect(libraryHas(library, { category: "guide", id: "basics", section: "missing" })).toBe(false);
    });
    it("resolves every marked term and explicit destination to an available page or subsection", () => {
        const valid = (page: LibraryPage): boolean => page.kind !== "entry" || libraryHas(library, page);
        for (const [term, page] of Object.entries(GUIDE_REFERENCES)) expect(valid(page), term).toBe(true);
        for (const [key, text] of Object.entries(gameGuideEnglishStrings)) {
            for (const match of text.matchAll(/\[([^\]]+)\]/g)) {
                const destination = resolveGuideReference(match[1]!);
                expect(destination, key + ": " + match[1]).toBeDefined();
                expect(valid(destination!)).toBe(true);
            }
        }
        for (const page of GAME_GUIDE_PAGES) for (const section of page.sections) {
            const keys = [...section.paragraphs, ...(section.heading ? [section.heading] : []), ...(section.after ? [section.after] : []),
                ...(section.traits?.flatMap(trait => [trait.label, trait.text]) ?? []), ...(section.table?.headers ?? []),
                ...(section.table?.rows.flat() ?? []), ...(section.list?.items ?? [])];
            for (const key of keys) expect(guideText(presentation, page.id, key), page.id + "." + key).not.toBe("");
        }
    });
    it.each([
        ["Standing", undefined, "guide", "basics", "stances"],
        ["Bonus Escape", undefined, "guide", "bindings-and-escaping", "bonus-escapes"],
        ["Hit", undefined, "guide", "modifiers", "hit"],
        ["Defense", undefined, "guide", "modifiers", "defense"],
        ["Crit", undefined, "guide", "moves", "move-results"],
        ["Free", undefined, "guide", "moves", "move-traits"],
        ["Vibrating", undefined, "statuses", "vibrating", undefined],
        ["Immobilized", undefined, "statuses", "immobilized", undefined],
        ["Hit", "move-results", "guide", "moves", "move-results"],
        ["Escape", "move-traits", "guide", "moves", "move-traits"],
        ["Escape", "bindings-and-escaping", "guide", "bindings-and-escaping", "escaping"],
        ["Escape", "modifiers", "guide", "modifiers", "escape"],
        ["Traps", "modifiers", "guide", "modifiers", "traps"],
    ] as const)("links %s in %s to its relevant explanation", (term, context, category, id, section) => {
        expect(resolveGuideReference(term, context as GuideReferenceContext | undefined)).toEqual({ kind: "entry", category, id, ...(section ? { section } : {}) });
    });
    it("distinguishes the Hit modifier from a Hit result in Enemy Intentions", () => {
        const text = guideText(presentation, "basics", "intentions.paragraph.0");
        const hits = guideReferenceParts(text, "intentions").filter(part => typeof part !== "string" && part.label === "Hit");
        expect(hits).toEqual([
            { label: "Hit", page: { kind: "entry", category: "guide", id: "modifiers", section: "hit" } },
            { label: "Hit", page: { kind: "entry", category: "guide", id: "moves", section: "move-results" } },
        ]);
    });
    it("retains authored link labels, handles repeated terms, and leaves unknown terms literal", () => {
        expect(guideReferenceParts("[Standing], [Standing], [Free].")).toEqual([
            "", { label: "Standing", page: GUIDE_REFERENCES.Standing }, ", ", { label: "Standing", page: GUIDE_REFERENCES.Standing },
            ", ", { label: "Free", page: GUIDE_REFERENCES.Free }, ".",
        ]);
        expect(guideReferenceParts("[Unmapped] [constructor]")).toEqual(["[Unmapped] [constructor]"]);
        expect(resolveGuideReference("Traps")).toEqual({ kind: "category", category: "traps" });
    });
    it("preserves guide subsection visits, scroll, and forward history without touching combat", () => createRoot(dispose => {
        const before = JSON.stringify(library);
        const nav = createLibraryNavigation();
        nav.open({ kind: "category", category: "guide" });
        nav.open(GUIDE_REFERENCES.Standing!);
        nav.remember("", 120, "guide:basics#stances");
        nav.open(GUIDE_REFERENCES.Crit!);
        nav.open(GUIDE_REFERENCES.Crit!);
        expect(nav.visits()).toHaveLength(4);
        nav.open({ kind: "entry", category: "guide", id: "moves", section: "move-traits" });
        expect(nav.visits()).toHaveLength(5);
        nav.back(); nav.back();
        expect(nav.current().page).toEqual(GUIDE_REFERENCES.Standing);
        expect(nav.current().scroll).toBe(120);
        nav.forward(); expect(nav.current().page).toEqual(GUIDE_REFERENCES.Crit);
        nav.open(GUIDE_REFERENCES.Vibrating!);
        expect(nav.canForward()).toBe(false);
        expect(JSON.stringify(library)).toBe(before);
        dispose();
    }));
});
