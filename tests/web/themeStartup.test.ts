import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const entries = ["index.html"];
const source = (entry: string) => readFileSync(entry, "utf8");
const bootstrap = (entry: string) => source(entry).match(/<script>([\s\S]*?)<\/script>/)![1]!;

describe("theme before first paint", () => {
    it("runs the synchronous bootstrap in the HTML head before the app", () => {
        for (const entry of entries) {
            const html = source(entry);
            expect(html.indexOf("<script>")).toBeLessThan(html.indexOf("</head>"));
            expect(html.indexOf("<script>")).toBeLessThan(html.indexOf('type="module"'));
        }
    });
    it.each(entries.flatMap(entry => [null, "invalid", "dark", "light", "system"].flatMap(saved =>
        [true, false].map(light => ({ entry, saved, light })))))("applies $saved with OS light=$light in $entry", ({ entry, saved, light }) => {
            const document = { documentElement: { dataset: {} as Record<string, string> } };
            runInNewContext(bootstrap(entry), { document, localStorage: { getItem: () => saved }, matchMedia: () => ({ matches: light }) });
            expect(document.documentElement.dataset.kcqTheme).toBe(saved === "light" || (saved === "system" && light) ? "light" : "dark");
        });
    it.each(entries)("keeps %s usable with denied storage or unavailable matchMedia", entry => {
        const document = { documentElement: { dataset: {} as Record<string, string> } };
        runInNewContext(bootstrap(entry), { document, localStorage: { getItem: () => { throw Error("denied"); } } });
        expect(document.documentElement.dataset.kcqTheme).toBe("dark");
        runInNewContext(bootstrap(entry), { document, localStorage: { getItem: () => "system" } });
        expect(document.documentElement.dataset.kcqTheme).toBe("dark");
    });
});
