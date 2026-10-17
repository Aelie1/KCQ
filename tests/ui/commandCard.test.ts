import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { CommandCard } from "../../src/ui/web/app/components/CommandCard";
import type { CommandTagViewModel } from "../../src/ui/web/app/viewModels/characterDetails";

describe("command card", () => {
    it("renders the complete long name, unavailable reason, and multiple tags", () => {
        const tags: CommandTagViewModel[] = [
            { id: "mouth", label: "Mouth", tone: "warning" },
            { id: "ally", label: "Ally", tone: "ally" },
            { id: "enemy", label: "Enemy", tone: "primary" },
            { id: "retarget", label: "Retarget", tone: "primary" },
        ];
        const name = "Power of Compulsion: Irresistible Command";
        const reasonLabel = "This character cannot use the command while restrained.";
        const html = renderToString(() => createComponent(CommandCard, {
            command: {
                id: "power-of-compulsion",
                name,
                reasonLabel,
                shortcutKey: "8",
                shortcutLabel: "8",
                available: false,
                cooldown: { value: 2, active: true, accessibleLabel: "Cooldown 2" },
                tags,
            },
        }));

        expect(html).toContain(name);
        expect(html).toContain('class="kcq-shortcut" aria-hidden="true">8</span>');
        expect(html).not.toContain("[8]");
        expect(html).toContain(reasonLabel);
        expect(html).toContain('aria-label="' + name + ': ' + reasonLabel + ': Cooldown 2"');
        expect(html).toContain('class="kcq-command-card__cooldown kcq-command-card__cooldown--active" aria-hidden="true" title="Cooldown 2"');
        expect(html).toContain('class="kcq-command-card__cooldown-icon"');
        expect(html).toContain(" disabled");
        const text = html.replace(/<!--.*?-->|<[^>]+>/g, "");
        expect(text).not.toContain("Cooldown 2");
        expect(text).toContain("2");
        for (const tag of tags) expect(html).toContain(tag.label);
    });

    it.each([undefined, 0, -1])("omits the indicator without a positive cooldown value (%s)", (remaining) => {
        const html = renderToString(() => createComponent(CommandCard, {
            command: {
                id: "obey", name: "Obey", available: true, shortcutLabel: "", tags: [],
                ...(remaining !== undefined ? { cooldown: { value: remaining, active: false, accessibleLabel: "Cooldown " + remaining } } : {}),
            },
        }));

        expect(html).not.toContain("kcq-command-card__cooldown");
        expect(html).not.toContain("Cooldown");
        expect(html).toContain('aria-label="Obey"');
        expect(html).not.toContain(" disabled");
    });

    it("uses growing cards and two-line name, reason, and tag constraints", () => {
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const cardRule = css.match(/\.kcq-command-card\s*\{([^}]*)\}/)?.[1] ?? "";
        const nameRule = css.match(/\.kcq-command-card__name\s*\{([^}]*)\}/)?.[1] ?? "";
        const reasonRule = css.match(/\.kcq-command-card__reason\s*\{([^}]*)\}/)?.[1] ?? "";
        const tagsRule = css.match(/\.kcq-command-card__tags\s*\{([^}]*)\}/)?.[1] ?? "";

        expect(cardRule).not.toMatch(/(^|\s)height:\s*75px/);
        expect(nameRule).toContain("-webkit-line-clamp: 2");
        expect(nameRule).toContain("flex: 1");
        expect(nameRule).toContain("min-width: 0");
        expect(nameRule).not.toContain("text-overflow: ellipsis");
        expect(nameRule).not.toContain("white-space: nowrap");
        expect(reasonRule).toContain("-webkit-line-clamp: 2");
        expect(reasonRule).toContain("font-size: 10px");
        expect(reasonRule).toContain("line-height: 12px");
        expect(tagsRule).toContain("max-height: 36px");
        expect(tagsRule).toContain("overflow: hidden");
    });
});
