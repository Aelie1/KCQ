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
                shortcutLabel: "[8]",
                available: false,
                tags,
            },
        }));

        expect(html).toContain(name);
        expect(html).toContain(reasonLabel);
        for (const tag of tags) expect(html).toContain(tag.label);
    });

    it("uses growing cards and two-line name, reason, and tag constraints", () => {
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const cardRule = css.match(/\.kcq-command-card\s*\{([^}]*)\}/)?.[1] ?? "";
        const nameRule = css.match(/\.kcq-command-card__name\s*\{([^}]*)\}/)?.[1] ?? "";
        const reasonRule = css.match(/\.kcq-command-card__reason\s*\{([^}]*)\}/)?.[1] ?? "";
        const tagsRule = css.match(/\.kcq-command-card__tags\s*\{([^}]*)\}/)?.[1] ?? "";

        expect(cardRule).toContain("min-height: 75px");
        expect(cardRule).not.toMatch(/(^|\s)height:\s*75px/);
        expect(nameRule).toContain("-webkit-line-clamp: 2");
        expect(nameRule).not.toContain("text-overflow: ellipsis");
        expect(nameRule).not.toContain("white-space: nowrap");
        expect(reasonRule).toContain("-webkit-line-clamp: 2");
        expect(reasonRule).toContain("font-size: 10px");
        expect(reasonRule).toContain("line-height: 12px");
        expect(tagsRule).toContain("max-height: 36px");
        expect(tagsRule).toContain("overflow: hidden");
    });
});
