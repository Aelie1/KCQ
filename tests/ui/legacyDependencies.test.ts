import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const relative = (path: string): string => path.slice(root.length + 1).replaceAll("\\", "/");
const sources = (directory: string): string[] => readdirSync(resolve(root, directory), { recursive: true })
    .map(entry => resolve(root, directory, entry.toString()))
    .filter(path => /\.[cm]?tsx?$/.test(path));

const legacyEntries = new Set([
    "src/ui/web/main.ts",
    "src/ui/web/view.ts",
    "src/harness/cli/replay-csv-main.ts",
]);
const isLegacy = (path: string): boolean => relative(path).startsWith("src/ui/console/")
    || legacyEntries.has(relative(path));

function localImports(path: string): string[] {
    const imports = [...readFileSync(path, "utf8").matchAll(
        /(?:from\s*|import\s*\(|require\s*\(|import\s*)["']([^"']+)["']/g,
    )].map(match => match[1]);
    return imports.filter(specifier => specifier.startsWith("."))
        .flatMap(specifier => {
            const base = resolve(dirname(path), specifier).replace(/\.[cm]?[jt]sx?$/, "");
            if (isLegacy(base + ".ts")) return [base + ".ts"];
            const target = [base, base + ".ts", base + ".tsx", base + ".mts", base + ".cjs",
                resolve(base, "index.ts"), resolve(base, "index.tsx")]
                .find(candidate => /\.[cm]?tsx?$|\.cjs$/.test(candidate) && existsSync(candidate));
            return target ? [target] : [];
        });
}

describe("legacy console dependency boundary", () => {
    it("keeps surviving production code and tests independent of legacy implementations and entries", () => {
        const pending = [...sources("src"), ...sources("tests"), ...sources("localization")];
        expect(pending.filter(isLegacy)).toEqual([]);
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
