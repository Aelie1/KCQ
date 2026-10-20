import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../../vite.config.mjs";

const source = (name: string) => readFileSync(new URL("../../" + name, import.meta.url), "utf8");

describe("browser HTML entry points", () => {
    it("serves the graphical app at the root and the development fixtures separately", () => {
        expect(source("index.html")).toContain('<div id="root"></div>');
        expect(source("index.html")).toContain('src="/src/ui/web/app/main.tsx"');
        expect(existsSync(new URL("../../game.html", import.meta.url))).toBe(false);
    });

    it("builds only root and fixture entries into dist-web", () => {
        expect(config.build?.outDir).toBe("dist-web");
    });
});
