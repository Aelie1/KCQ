import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../../vite.config.mjs";

const source = (name: string) => readFileSync(new URL("../../" + name, import.meta.url), "utf8");

describe("browser HTML entry points", () => {
    it("serves the graphical app at the root and preserves the console client separately", () => {
        expect(source("index.html")).toContain('<div id="root"></div>');
        expect(source("index.html")).toContain('src="/src/ui/web/app/main.tsx"');
        expect(source("console.html")).toContain('id="screen-container"');
        expect(source("console.html")).toContain('id="battle-log"');
        expect(source("console.html")).toContain('src="/src/ui/web/main.ts"');
        expect(source("ui-dev.html")).toContain('src="/src/ui/web/app/dev/main.tsx"');
        expect(existsSync(new URL("../../game.html", import.meta.url))).toBe(false);
    });

    it("builds only root, console, and fixture entries into dist-web", () => {
        expect(config.build?.outDir).toBe("dist-web");
        expect(config.build?.rollupOptions?.input).toEqual({
            main: new URL("../../index.html", import.meta.url).pathname,
            console: new URL("../../console.html", import.meta.url).pathname,
            "ui-dev": new URL("../../ui-dev.html", import.meta.url).pathname,
        });
    });
});
