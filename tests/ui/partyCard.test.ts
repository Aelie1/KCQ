import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { PartyCard } from "../../src/ui/web/app/components/PartyCard";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { createPartyCardViewModel } from "../../src/ui/web/app/viewModels/partyCard";

describe("party card", () => {
    it("shows only Hinari's numeric public Subspace value with the shared treatment", () => {
        const fixture = battleOverviewFixture;
        const characters = fixture.state.characters.map((character) => ({
            ...character,
            data: character.id === "hinari"
                ? { ...character.data, subspace: 27, subspaceMax: 100 }
                : { ...character.data, subspace: 99 },
        }));
        const models = characters.map((character) => createPartyCardViewModel(
            character,
            fixture.actions.find(({ id }) => id === character.id)!,
            fixture.thresholds,
            fixture.presentation,
            fixture.state.encounter?.bindings,
        ));
        const hinari = models.find(({ id }) => id === "hinari")!;
        const hinariHtml = renderToString(() => createComponent(PartyCard, { character: hinari }));
        const otherHtml = models
            .filter(({ id }) => id !== "hinari")
            .map((character) => renderToString(() => createComponent(PartyCard, { character })))
            .join("");
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const sharedRule = css.match(/\.kcq-subspace-value\s*\{([^}]*)\}/)?.[1] ?? "";

        expect(hinari.subspaceValue).toBe(27);
        expect(hinariHtml).toMatch(/<span[^>]*class="kcq-party-card__resource kcq-subspace-value">27<\/span>/);
        expect(hinariHtml).not.toContain("Subspace");
        expect(hinariHtml).not.toContain("Store");
        expect(otherHtml).not.toContain("kcq-party-card__resource");
        expect(models.filter(({ id }) => id !== "hinari")
            .every((model) => model.subspaceValue === undefined)).toBe(true);
        expect(sharedRule).toContain("border: 1px solid var(--kcq-binding-light)");
        expect(sharedRule).toContain("color: var(--kcq-binding-light)");
    });
});
