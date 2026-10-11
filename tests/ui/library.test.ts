import { readFileSync } from "node:fs";
import { createComponent, createRoot } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { LibraryPanel } from "../../src/ui/web/app/panels/LibraryPanel";
import { createLibraryNavigation, LIBRARY_CATEGORIES, libraryEntries, libraryHas, libraryMoveGroups, libraryPassiveSummary, libraryMoveTags, SKUNK_BINDINGS_ID, libraryRelated, libraryTrapOutcomes, referenceParts } from "../../src/ui/web/app/viewModels/library";
import { LIBRARY_EFFECTIVENESS, LIBRARY_HIT_STEP, LIBRARY_POTENCY_STEP, libraryAccuracy, libraryDamageProfile } from "../../src/ui/web/app/viewModels/libraryMechanics";
import { effectivenessRange, HIT_MODIFIER, WILLPOWER_MODIFIER, EFFECTIVENESS_MODIFIER } from "../../src/engine/private/constants";
import { libraryMoveEffectRows, libraryCompulsionCooldown } from "../../src/ui/web/app/viewModels/libraryMoveEffects";
import { groupReferenceRecipients } from "../../src/ui/web/app/viewModels/effectGroups";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
const engine = createStockEngine(12345);
const library = engine.getLibrary();

describe("Library reference browser", () => {
    it("converts cumulative trap ratios to conditional probabilities without fabricating effects", () => {
        const chances = { 1: { latexLegs: 10 }, 0.1: { latexLegs: 20, latexArms: 20, latexTorso: 20, latexHead: 20 }, 0.75: { latexLegs: 20 }, 0.35: { latexLegs: 20, latexArms: 20 } };
        const before = structuredClone(chances);
        const outcomes = libraryTrapOutcomes(chances);
        expect(outcomes.map(outcome => outcome.chance)).toEqual([25, 40, 25, 10]);
        expect(outcomes.map(outcome => outcome.bindings.length)).toEqual([1, 1, 2, 4]);
        expect(outcomes.reduce((sum, outcome) => sum + outcome.chance, 0)).toBe(100);
        expect(chances).toEqual(before);
    });
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

describe("Library static reference projections", () => {
    it("matches the engine effectiveness bands and coefficients without importing internals into the UI", () => {
        for (const [band, range] of Object.entries(LIBRARY_EFFECTIVENESS)) {
            expect(range).toEqual(effectivenessRange[band as keyof typeof effectivenessRange]);
        }
        expect(LIBRARY_HIT_STEP).toBe(HIT_MODIFIER);
        expect(LIBRARY_HIT_STEP).toBe(WILLPOWER_MODIFIER);
        expect(LIBRARY_POTENCY_STEP).toBe(EFFECTIVENESS_MODIFIER);
    });
    it("multiplies out per-hit damage with upward rounding and intrinsic move bonuses", () => {
        expect(libraryDamageProfile(library.moves.telekinesis!, presentation)?.bands.map(band => [band.chance, band.min, band.max]))
            .toEqual([[10, 0, 0], [15, 6, 15], [65, 24, 30], [10, 45, 60]]);
        expect(libraryDamageProfile(library.moves.fairyTelekinesis!, presentation)?.bands.map(band => [band.min, band.max]))
            .toEqual([[0, 0], [3, 8], [12, 15], [23, 30]]);
        expect(libraryAccuracy(library.moves.whiteFlame!)).toEqual({ miss: 0, graze: 5, hit: 83, crit: 12 });
        expect(libraryDamageProfile(library.moves.phoenixKick!, presentation)?.bands.map(band => [band.min, band.max]))
            .toEqual([[0, 0], [8, 20], [32, 39], [59, 78]]);
        const changed = { ...library.moves.telekinesis!, baseDamage: 11 };
        expect(libraryDamageProfile(changed, presentation)?.bands.map(band => [band.min, band.max]))
            .toEqual([[0, 0], [3, 6], [9, 11], [17, 22]]);
        expect(libraryDamageProfile(library.moves.starlightBindings!, presentation)).toBeUndefined();
        expect(engine.getGameState().characters).toEqual([]);
    });
    it("preserves missing accuracy bands and uses Willpower and enemy critical rules", () => {
        const template = library.moves.telekinesis!;
        expect(libraryAccuracy({ ...template, accuracy: { hit: 90, crit: 10 }, modifiers: { hit: -2 } }))
            .toEqual({ hit: 92, crit: 8 });
        expect(libraryAccuracy({ ...template, accuracy: { miss: 50, hit: 50 }, modifiers: { hit: 2 } }))
            .toEqual({ miss: 30, hit: 70 });
        expect(libraryAccuracy({ ...template, check: "willpower", modifiers: { hit: 9, willpower: 1 } }))
            .toEqual({ miss: 5, graze: 10, hit: 74, crit: 11 });
        expect(libraryAccuracy({ ...template, modifiers: { hit: 1 } }, false))
            .toEqual({ miss: 5, graze: 10, hit: 75, crit: 10 });
    });
    it("groups each available move once using campaign ownership and authored sources", () => {
        const groups = libraryMoveGroups(library, presentation);
        const ids = groups.flatMap(group => group.entries.map(entry => entry.id));
        expect(ids.length).toBe(Object.keys(library.moves).length);
        expect(new Set(ids).size).toBe(ids.length);
        expect(groups.find(group => group.owner?.id === "matsuko")?.entries.map(entry => entry.id)).toContain("punch");
        expect(groups.find(group => group.owner?.id === "skunkette")?.entries.map(entry => entry.id)).toContain("throwOff");
        expect(libraryPassiveSummary(library, "ko", "thousandRestraintsBody").allowedMoveTypes).toEqual(["mouth"]);
    });
    it("filters informational entries by the current campaign and counts them without mutating bindings", () => {
        const before = JSON.stringify(library.bindings);
        expect(libraryEntries(library, "bindings", presentation).map(entry => entry.id)).toContain(SKUNK_BINDINGS_ID);
        expect(libraryHas(library, { category: "bindings", id: SKUNK_BINDINGS_ID })).toBe(true);
        expect(libraryRelated({ category: "bindings", id: "latexHead" }, library, presentation)).toContainEqual({ category: "bindings", id: SKUNK_BINDINGS_ID });
        const other = { ...library, bindings: { rope: { id: "rope", status: {} } } };
        expect(libraryHas(other, { category: "bindings", id: SKUNK_BINDINGS_ID })).toBe(false);
        expect(libraryEntries(other, "bindings", presentation).map(entry => entry.id)).toEqual(["rope"]);
        expect(JSON.stringify(library.bindings)).toBe(before);
        const html = renderToString(() => createComponent(LibraryPanel, { library, presentation, onClose: () => {}, initialPage: { kind: "entry", category: "bindings", id: SKUNK_BINDINGS_ID } }));
        expect(html).toContain("Skunk Bindings");
        expect(html).not.toMatch(/\[(?:ui|binding|entity)\./);
    });
});


describe("Library structured effect projections", () => {
    it("represents every published move and preserves static effects without touching source data", () => {
        const before = JSON.stringify(library);
        for (const move of Object.values(library.moves)) {
            const rows = libraryMoveEffectRows(move, library, presentation);
            expect(rows.length, move.id).toBeGreaterThan(0);
            for (const row of rows) {
                expect(row.name ?? "", move.id).not.toMatch(/\[(ui|buff|move)\./);
                if (row.preview?.kind === "buff") expect(row.preview.name, move.id).not.toMatch(/\[buff\./);
            }
            for (const effect of move.effects ?? []) {
                expect(rows.some(row => row.preview?.kind === "buff" && row.preview.id === "library-" + effect.id), move.id).toBe(true);
            }
        }
        expect(JSON.stringify(library)).toBe(before);
        expect(engine.getGameState().characters).toEqual([]);
    });
    it("projects all supplied intrinsic modifiers, including non-damage moves, without making them buffs", () => {
        const modified = { ...library.moves.obey!, modifiers: { potency: 7, hit: -2, willpower: 3 } };
        const rows = libraryMoveEffectRows(modified, library, presentation);
        const row = rows.find(row => row.label === "Modifiers")!;
        expect(row.modifiers).toEqual(modified.modifiers);
        expect(row.preview).toBeUndefined();
        expect(row.recipient).toBe("");
    });
    it("preserves recipient and effect order, leaving one-recipient moves compact", () => {
        const rows = [{ recipient: "ko", name: "first" }, { recipient: "allies", name: "second" }, { recipient: "ko", name: "third" }, { recipient: "", name: "modifier" }];
        const grouped = groupReferenceRecipients(rows);
        expect(grouped.groups.map(group => [group.id, group.effects.map(row => row.name)])).toEqual([["ko", ["first", "third"]], ["allies", ["second"]]]);
        expect(grouped.ungrouped.map(row => row.name)).toEqual(["modifier"]);
        expect(groupReferenceRecipients(rows.slice(0, 1)).groups).toEqual([]);
        expect(groupReferenceRecipients(rows.slice(0, 1), true).groups).toHaveLength(1);
    });
    it("uses public cooldown relationships and falls back when they differ", () => {
        for (const id of ["obey", "stop", "attackMe"]) expect(libraryCompulsionCooldown(library.moves[id]!)).toBe(2);
        expect(libraryCompulsionCooldown({ ...library.moves.obey!, cooldown: { obey: 3, stop: 7, attackMe: 2 } })).toBeUndefined();
        expect(libraryCompulsionCooldown({ ...library.moves.obey!, cooldown: {} })).toBeUndefined();
        expect(libraryCompulsionCooldown(library.moves.fairyTransformation!)).toBeUndefined();
    });
    it("puts AOE before all target-side tags", () => {
        for (const move of Object.values(library.moves).filter(move => move.targets === "all")) {
            const ids = libraryMoveTags(move, presentation).map(tag => tag.id);
            for (const side of ["ally", "enemy"]) if (ids.includes(side)) expect(ids.indexOf("aoe")).toBeLessThan(ids.indexOf(side));
        }
    });
    it("keeps headers content-sized and damage columns shrinkable at the 320px CSS breakpoint", () => {
        // happy-dom does not perform text layout. Protect the responsive rules directly;
        // actual glyph fitting still requires a browser visual check.
        const css = readFileSync("src/ui/web/app/app.css", "utf8");
        const owner = css.match(/\.kcq-library__header \.kcq-library__owner \{([^}]+)\}/)![1]!;
        expect(owner).toContain("flex: 0 1 auto;");
        expect(css).not.toMatch(/kcq-library__header \.kcq-library__owner \{[^}]*flex-basis:/);
        expect(css).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
        expect(css).toContain(".kcq-library__effect-cards .kcq-damage-profile__band { font-size: 11px; line-height: 15px; white-space: nowrap; }");
        expect(css).toContain(".kcq-library__effect-cards .kcq-damage-profile__band strong { font-size: 13px; line-height: 16px; }");
        expect(css).toContain(".kcq-library__effect-cards .kcq-damage-profile { grid-column: 2; }");
    });
});
