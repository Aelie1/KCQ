import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { Presentation } from "../../src/ui/presentation/presentation";
import { ModifierMeter } from "../../src/ui/web/app/components/ModifierMeter";
import { characterDetailsFixture } from "../../src/ui/web/app/fixtures/characterDetails";
import { CharacterDetailsPanel } from "../../src/ui/web/app/panels/CharacterDetailsPanel";
import { stockStrings } from "../helpers/stockStrings";

function renderedText(html: string): string {
    return html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "");
}

describe("character details panel", () => {
    it("keeps an incapacitated roster character selectable for inspection", () => {
        const selected: string[] = [];
        const html = renderToString(() => createComponent(CharacterDetailsPanel, {
            ...characterDetailsFixture,
            onSelectCharacter: (id) => selected.push(id),
        }));
        const rosterButton = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
            .map(([button]) => button)
            .find((button) => button.includes("Matsuko"));

        expect(rosterButton).toBeDefined();
        expect(rosterButton).toContain("kcq-character-roster__card--disabled");
        expect(rosterButton).not.toMatch(/\sdisabled(?:[\s=>]|$)/);
        expect(selected).toEqual([]);
    });

    it("renders linked buffs with the shared chain-link component", () => {
        const html = renderToString(() => createComponent(CharacterDetailsPanel, characterDetailsFixture));

        expect(html).toContain("kcq-linked-entity-chip__icon");
        expect(html).toContain("Skunkette 1");
        expect(html).not.toContain("↗ Skunkette 1");
    });

    it("renders nonzero rows and a blocked zero capability without ordinary +0 rows", () => {
        const html = renderToString(() => createComponent(CharacterDetailsPanel, characterDetailsFixture));
        const text = renderedText(html);

        expect(text).toContain("Status &amp; Capabilities");
        expect(text).toContain("MouthBlk");
        expect(text).toContain("Defense-8");
        expect(text).not.toContain("+0");
        expect(html.match(/class="kcq-modifier-meter"/g)).toHaveLength(5);
        expect(html.match(/class="kcq-character-binding"/g)).toHaveLength(3);
        expect(text).toContain("Bindings / 3 Zones");
        expect(text).not.toContain("Skunk Legs");
        expect(text).toContain("Buffs");
        expect(html).not.toContain(">Effects</h2>");
    });

    it.each(["modifiers", "bindings", "buffs", "all"] as const)(
        "removes empty %s cards and their headings while keeping the screen actions",
        (empty) => {
            const fixture = characterDetailsFixture;
            const state = {
                ...fixture.state,
                characters: fixture.state.characters.map((character) => character.id === "ko"
                    ? {
                        ...character,
                        ...((empty === "modifiers" || empty === "all")
                            ? { modifiers: {}, blockedMoveTypes: [] } : {}),
                        ...((empty === "bindings" || empty === "all") ? { bindings: [] } : {}),
                        ...((empty === "buffs" || empty === "all") ? { buffs: [] } : {}),
                    }
                    : character),
            };
            const html = renderToString(() => createComponent(CharacterDetailsPanel, { ...fixture, state }));
            const text = renderedText(html);
            for (const [kind, className, heading] of [
                ["modifiers", "kcq-character-capabilities", "character-status-heading"],
                ["bindings", "kcq-character-bindings", "character-bindings-heading"],
                ["buffs", "kcq-character-effects", "character-effects-heading"],
            ]) {
                if (empty === kind || empty === "all") {
                    expect(html).not.toContain(className);
                    expect(html).not.toContain(heading);
                } else {
                    expect(html).toContain(className);
                    expect(html).toContain(heading);
                }
            }
            expect(text).not.toContain("None");
            expect(html).not.toContain("kcq-character-effects__empty");
            expect(html).toContain("kcq-character-commands");
            expect(html).toContain("kcq-character-details__footer");
        },
    );

    it("renders localized buff move changes as individual positive and restrictive chips", () => {
        const fixture = characterDetailsFixture;
        const presentation = new Presentation({
            ...stockStrings,
            "move.fairyTelekinesis.name": "Localized Fairy Move",
            "move.fairyReflect.name": "Localized Reflect",
            "move.telekinesis.name": "Localized Base Move",
        });
        const state = {
            ...fixture.state,
            characters: fixture.state.characters.map((character) => character.id === "ko"
                ? {
                    ...character, buffs: [{
                        id: "transformation",
                        moveList: {
                            addedMoves: ["fairyTelekinesis", "fairyReflect"],
                            blockedMoves: ["telekinesis"],
                        },
                    }]
                }
                : character),
        };
        const html = renderToString(() => createComponent(CharacterDetailsPanel, { ...fixture, state, presentation }));
        const buffSection = html.match(/<section[^>]*kcq-character-effects[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? "";
        const chips = [...buffSection.matchAll(/<span[^>]*kcq-status-chip[^>]*>[\s\S]*?<\/span>/g)]
            .map(([chip]) => chip);

        expect(chips).toHaveLength(3);
        expect(chips[0]).toContain("kcq-status-chip--success");
        expect(renderedText(chips[0])).toBe("Add Localized Fairy Move");
        expect(chips[1]).toContain("kcq-status-chip--success");
        expect(renderedText(chips[1])).toBe("Add Localized Reflect");
        expect(chips[2]).toContain("kcq-status-chip--danger");
        expect(renderedText(chips[2])).toBe("Block Localized Base Move");
        expect(buffSection).not.toContain("fairyTelekinesis");
        expect(buffSection).not.toContain("telekinesis");
    });

    it("renders exactly eight fixed-geometry modifier pips", () => {
        const html = renderToString(() => createComponent(ModifierMeter, {
            metric: { blocked: false, label: "Defense", tone: "success", value: 3, valueLabel: "+3" },
        }));

        expect((html.match(/class="kcq-pip-meter__pip(?: |")/g) ?? []).length).toBe(8);
        expect(html).toContain("kcq-pip-meter");

        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const meterRule = css.match(/\.kcq-pip-meter\s*\{([^}]*)\}/)?.[1] ?? "";
        const pipRule = css.match(/\.kcq-pip-meter__pip\s*\{([^}]*)\}/)?.[1] ?? "";
        expect(meterRule).toContain("grid-template-columns: repeat(8, auto)");
        expect(meterRule).toContain("gap: 1px");
        expect(meterRule).toContain("width: 63px");
        expect(pipRule).toContain("width: 7px");
    });

    it("shows Hinari's public Subspace resource in the Commands header", () => {
        const fixture = characterDetailsFixture;
        const state = {
            ...fixture.state,
            characters: fixture.state.characters.map((character) => character.id === "hinari"
                ? { ...character, data: { subspace: 27, subspaceMax: 100 } }
                : character),
        };
        const html = renderToString(() => createComponent(CharacterDetailsPanel, {
            ...fixture,
            state,
            focusedCharacterId: "hinari",
        }));

        expect(html).toContain("kcq-combat-header--subscreen");
        expect(html).toContain("kcq-character-roster");
        expect(html).not.toContain("kcq-character-capabilities");
        expect(html).not.toContain("kcq-character-bindings");
        expect(html).not.toContain("kcq-character-effects");
        expect(html).toContain("kcq-character-commands");
        expect(html).toContain("kcq-character-commands__resource");
        expect(html).toContain("kcq-subspace-meter");
        expect(html).toContain('style="width:27%"');
        expect(renderedText(html)).toContain("Commands / Hinari");
        expect(renderedText(html)).toContain("Subspace");
        expect(renderedText(html)).toContain("27/100");

        for (const focusedCharacterId of ["ko", "matsuko"] as const) {
            const otherHtml = renderToString(() => createComponent(CharacterDetailsPanel, {
                ...fixture,
                state,
                focusedCharacterId,
            }));

            expect(otherHtml).not.toContain("kcq-character-commands__resource");
            expect(renderedText(otherHtml)).not.toContain("SUBSPACE");
        }
    });

    it("renders compact top-card conditions with independent established tones", () => {
        const html = renderToString(() => createComponent(
            CharacterDetailsPanel,
            characterDetailsFixture,
        ));
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");

        expect(html).toContain("kcq-character-roster__condition--danger\">Immob</span>");
        expect(html).toContain("kcq-character-roster__action--danger\">Incap</span>");
        expect(html).toContain("kcq-character-roster__condition--success\">Moving</span>");
        expect(html).toContain("kcq-character-roster__condition--warning\">Standing</span>");
        expect(html).toContain('aria-label="Ready · Immobilized"');
        expect(html).toContain('aria-label="Incapacitated · Moving"');

        const successRule = css.match(/\.kcq-character-roster__action--success,\s*\.kcq-character-roster__condition--success\s*\{([^}]*)\}/)?.[1] ?? "";
        const dangerRule = css.match(/\.kcq-character-roster__action--danger,\s*\.kcq-character-roster__condition--danger\s*\{([^}]*)\}/)?.[1] ?? "";
        const warningRule = css.match(/\.kcq-character-roster__condition--warning\s*\{([^}]*)\}/)?.[1] ?? "";
        expect(successRule).toContain("color: var(--kcq-state-success)");
        expect(dangerRule).toContain("color: var(--kcq-state-danger)");
        expect(warningRule).toContain("color: var(--kcq-state-warning)");
    });
});
