import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { PartyCard } from "../../src/ui/web/app/components/PartyCard";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { createPartyCardViewModel } from "../../src/ui/web/app/viewModels/partyCard";

function renderedText(html: string): string {
    return html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "");
}

describe("party card", () => {
    it("renders the four binding zones in order as unlabeled severity meters", () => {
        const fixture = battleOverviewFixture;
        const character = fixture.state.characters[0];
        const model = createPartyCardViewModel(
            character,
            fixture.actions.find(({ id }) => id === character.id)!,
            fixture.thresholds,
            fixture.presentation,
            fixture.state.encounter?.bindings,
        );
        const html = renderToString(() => createComponent(PartyCard, { character: model }));

        expect(model.bindings.map(({ id }) => id)).toEqual(fixture.state.encounter.bindings);
        expect(html.match(/role="progressbar"/g)).toHaveLength(model.bindings.length);
        expect(html).not.toContain("kcq-binding-metric__label");
        expect(html).not.toContain("kcq-binding-metric__value");

        let previousMeterIndex = -1;
        for (const binding of model.bindings) {
            const meterIndex = html.indexOf(`aria-label="${binding.label}"`);
            expect(meterIndex).toBeGreaterThan(previousMeterIndex);
            expect(html).toContain(`kcq-party-card__binding-meter--${binding.level}`);
            expect(html).toContain(`aria-valuenow="${binding.current}"`);
            expect(html).toContain(`aria-valuemax="${binding.max}"`);
            previousMeterIndex = meterIndex;
        }
    });

    it("shows only Hinari's compact numeric Subspace value", () => {
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
        expect(hinari.resourceLabel).toBe("Sub: 27");
        expect(hinariHtml).toContain("kcq-party-card__resource");
        expect(hinariHtml).toContain("kcq-subspace-value");
        expect(renderedText(hinariHtml)).toContain("Sub: 27");
        expect(hinariHtml).not.toContain("Subspace");
        expect(hinariHtml).not.toContain("Store");
        expect(otherHtml).not.toContain("kcq-party-card__resource");
        expect(models.filter(({ id }) => id !== "hinari")
            .every((model) => model.resourceLabel === undefined)).toBe(true);
    });
});
