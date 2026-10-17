import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const relative = (path: string): string => path.slice(root.length + 1).replaceAll("\\", "/");
const sources = (directory: string): string[] => readdirSync(resolve(root, directory), { recursive: true })
    .map(entry => resolve(root, directory, entry.toString()))
    .filter(path => /\.[cm]?tsx?$/.test(path));

// These entries retain the viewer wiring until Phase 2; the launcher core survives.
const legacyEntries = new Set([
    "src/ui/web/main.ts",
    "src/ui/web/view.ts",
    "src/harness/cli/launcher-main.ts",
    "src/harness/cli/replay-csv-main.ts",
]);
const legacyTests = new Set([
    "tests/ui/console.test.ts",
    "tests/ui/consoleApp.test.ts",
    "tests/ui/controller.test.ts",
    "tests/ui/presentation.test.ts",
    "tests/ui/replay.test.ts",
    "tests/web/consoleEntry.test.ts",
    "tests/web/view.test.ts",
]);
const isLegacy = (path: string): boolean => relative(path).startsWith("src/ui/console/")
    || legacyEntries.has(relative(path));

function localImports(path: string): string[] {
    const imports = [...readFileSync(path, "utf8").matchAll(
        /(?:from\s*|import\s*\(|require\s*\(|import\s*)["']([^"']+)["']/g,
    )].map(match => match[1]);
    return imports.filter(specifier => specifier.startsWith("."))
        .flatMap(specifier => {
            const base = resolve(dirname(path), specifier).replace(/\.[cm]?jsx?$/, "");
            const target = [base, base + ".ts", base + ".tsx", base + ".mts", base + ".cjs",
                resolve(base, "index.ts"), resolve(base, "index.tsx")]
                .find(candidate => /\.[cm]?tsx?$|\.cjs$/.test(candidate) && existsSync(candidate));
            return target ? [target] : [];
        });
}

describe("legacy console dependency boundary", () => {
    it("keeps surviving production code and tests independent of legacy implementations and entries", () => {
        const pending = [...sources("src"), ...sources("tests"), ...sources("localization")]
            .filter(path => !isLegacy(path) && !legacyTests.has(relative(path)));
        const visited = new Set<string>();
        const violations: string[] = [];
        while (pending.length) {
            const path = pending.pop()!;
            if (visited.has(path)) continue;
            visited.add(path);
            for (const target of localImports(path)) {
                if (isLegacy(target)) violations.push(relative(path) + " -> " + relative(target));
                else pending.push(target);
            }
        }
        expect(violations).toEqual([]);
    });
});
