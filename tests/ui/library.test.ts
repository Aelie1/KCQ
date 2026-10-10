import { createComponent, createRoot } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { LibraryPanel } from "../../src/ui/web/app/panels/LibraryPanel";
import { createLibraryNavigation, LIBRARY_CATEGORIES, libraryEntries, libraryRelated, referenceParts } from "../../src/ui/web/app/viewModels/library";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
const engine = createStockEngine(12345);
const library = engine.getLibrary();

describe("Library reference browser", () => {
    it("retains cross-category history, list query, scroll, and focus", () => createRoot(dispose => {
        const nav = createLibraryNavigation();
        nav.open({ kind: "home" });
        expect(nav.canBack()).toBe(false);
        nav.open({ kind: "category", category: "characters" });
        nav.remember("Ko", 42, "ko");
        nav.open({ kind: "entry", category: "characters", id: "ko" });
        nav.open({ kind: "entry", category: "moves", id: "starlightBindings" });
        nav.open({ kind: "entry", category: "statuses", id: "bound" });
        nav.back();
        expect(nav.current().page).toEqual({ kind: "entry", category: "moves", id: "starlightBindings" });
        nav.back(); nav.back();
        expect(nav.current()).toEqual({ page: { kind: "category", category: "characters" }, search: "Ko", scroll: 42, focus: "ko" });
        nav.back(); nav.back();
        expect(nav.canBack()).toBe(false);
        expect(nav.current().page).toEqual({ kind: "home" });
        dispose();
    }));
    it("filters only the supplied library by localized names", () => {
        const scoped = { ...library, moves: { telekinesis: library.moves.telekinesis! } };
        expect(libraryEntries(scoped, "moves", presentation).map(entry => entry.id)).toEqual(["telekinesis"]);
        expect(libraryEntries(library, "characters", presentation, "KO-CHAN").map(entry => entry.id)).toEqual(["ko"]);
        expect(libraryEntries(library, "characters", presentation, "absent")).toEqual([]);
    });
    it("links both directions and excludes unavailable definitions", () => {
        expect(libraryRelated({ category: "moves", id: "telekinesis" }, library, presentation)).toContainEqual({ category: "characters", id: "ko" });
        expect(libraryRelated({ category: "statuses", id: "bound" }, library, presentation)).toContainEqual({ category: "bindings", id: "latexArms" });
        const scoped = { ...library, characters: {}, bindings: {}, moves: { telekinesis: library.moves.telekinesis! } };
        expect(libraryRelated({ category: "moves", id: "telekinesis" }, scoped, presentation)).toEqual([]);
        expect(referenceParts("Apply [statuses:bound] and [moves:obey].")).toEqual(["Apply ", { category: "statuses", id: "bound" }, " and ", { category: "moves", id: "obey" }, "."]);
        expect(referenceParts("[unknown:thing] <script>")).toEqual(["[unknown:thing] <script>"]);
    });
    it("renders every published entry across all nine categories without missing localization", () => {
        const before = JSON.stringify(library);
        for (const category of LIBRARY_CATEGORIES) {
            expect(Object.keys(library[category]).length).toBeGreaterThan(0);
            for (const id of Object.keys(library[category])) {
                const html = renderToString(() => createComponent(LibraryPanel, { library, presentation, onClose: () => {}, initialPage: { kind: "entry", category, id } }));
                expect(html, category + ":" + id).toContain('data-library-id="' + id + '"');
                expect(html, category + ":" + id).not.toMatch(/\[(?:ui|entity|move|status|binding|trap|passive|difficulty|encounter)\./);
                expect(html).not.toMatch(/>\.\.\.</);
            }
        }
        expect(JSON.stringify(library)).toBe(before);
        expect(engine.getGameState().characters).toEqual([]);
    });
    it("copies starting resources and move tags without exposing mutable definitions", () => {
        const reference = engine.getLibrary();
        expect(reference.characters.hinari!.data).toEqual({ subspace: 0, subspaceMax: 100 });
        expect(reference.moves.telekinesis!.traits).toEqual(["damage"]);
        reference.characters.hinari!.data!.subspace = 99;
        reference.moves.telekinesis!.traits!.push("heal");
        expect(engine.getLibrary().characters.hinari!.data!.subspace).toBe(0);
        expect(engine.getLibrary().moves.telekinesis!.traits).toEqual(["damage"]);
        expect(() => structuredClone(reference)).not.toThrow();
    });
});
