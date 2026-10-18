import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const engineInternals = ["src/engine/private", "src/engine/protected"];
const rules = [
    { directory: "src/ui", forbidden: engineInternals },
    { directory: "src/harness", forbidden: engineInternals },
    { directory: "src/engine", forbidden: ["src/content", "src/ui", "src/harness", "localization"] },
];

describe("production dependency boundaries", () => {
    it.each(rules)("keeps $directory independent of $forbidden", ({ directory, forbidden }) => {
        const sources = readdirSync(resolve(root, directory), { recursive: true })
            .map(entry => resolve(root, directory, entry.toString()))
            .filter(path => /\.[cm]?tsx?$/.test(path))
            .sort();
        const forbiddenPaths = forbidden.map(path => resolve(root, path));
        const violations: string[] = [];

        expect(sources.length).toBeGreaterThan(0);
        for (const path of sources) {
            // Includes type imports, re-exports, side-effect imports, import(), and require().
            const imports = readFileSync(path, "utf8").matchAll(
                /(?:from\s*|import\s*\(|require\s*\(|import\s*)["']([^"']+)["']/g,
            );
            for (const [, specifier] of imports) {
                if (!specifier.startsWith(".")) continue;
                const target = resolve(dirname(path), specifier).replace(/\.[cm]?[jt]sx?$/, "");
                if (forbiddenPaths.some(boundary => target === boundary || target.startsWith(boundary + sep))) {
                    violations.push(relative(root, path).replaceAll("\\", "/") + " -> " + specifier);
                }
            }
        }

        expect(violations).toEqual([]);
    });
});
