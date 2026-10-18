import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/ui/web/app/tokens.css", "utf8");
const declarations = (source: string): Record<string, string> => Object.fromEntries(
    [...source.matchAll(/(--kcq-[\w-]+):\s*([^;]+);/g)].map(match => [match[1]!, match[2]!.trim()]),
);
const dark = declarations(css.match(/:root\s*\{([^}]+)\}/)![1]!);
const light = { ...dark, ...declarations(css.match(/:root\[data-kcq-theme="light"\]\s*\{([^}]+)\}/)![1]!) };
const originalDark = {
    "--kcq-surface-background": "#0b111a",
    "--kcq-surface-panel": "#111925",
    "--kcq-surface-panel-alt": "#141c29",
    "--kcq-surface-card": "#0f1724",
    "--kcq-surface-raised": "#1e293b",
    "--kcq-surface-inset": "#020617",
    "--kcq-surface-overlay": "rgb(2 6 23 / 65%)",
    "--kcq-shadow-raised": "rgb(0 0 0 / 35%)",
    "--kcq-structure-border": "#334155",
    "--kcq-structure-border-strong": "#475569",
    "--kcq-text-primary": "#f1f5f9",
    "--kcq-text-secondary": "#cbd5e1",
    "--kcq-text-muted": "#94a3b8",
    "--kcq-text-dim": "#94a3b8",
    "--kcq-text-secondary-action": "#e2e8f0",
    "--kcq-accent-primary": "#22d3ee",
    "--kcq-accent-primary-bg": "#172554",
    "--kcq-accent-primary-deep": "#07313a",
    "--kcq-state-success-bg": "#052e24",
    "--kcq-state-warning-bg": "#3a2a05",
    "--kcq-state-danger-bg": "#3b1018",
    "--kcq-state-special-bg": "#2e1f55",
    "--kcq-state-special-deep": "#34103a",
    "--kcq-state-neutral-bg": "#1e293b",
    "--kcq-binding-heavy-bg": "#431c0a",
    "--kcq-action-danger-text": "#f08080",
    "--kcq-action-danger-border": "#75404a",
    "--kcq-action-danger-bg": "#2b1d28",
    "--kcq-action-danger-hover-text": "#ffe0e0",
    "--kcq-action-danger-hover-border": "#d06070",
    "--kcq-action-danger-hover-bg": "#592936",
    "--kcq-state-info": "#22d3ee",
    "--kcq-state-success": "#34d399",
    "--kcq-state-warning": "#fbbf24",
    "--kcq-state-danger": "#fb7185",
    "--kcq-state-special": "#c4b5fd",
    "--kcq-state-special-vivid": "#e879f9",
    "--kcq-binding-light": "#67e8f9",
    "--kcq-binding-moderate": "#facc15",
    "--kcq-binding-heavy": "#fb923c",
    "--kcq-binding-severe": "#fb7185",
    "--kcq-binding-impossible": "#e879f9",
    "--kcq-effect-crown": "#e8ba5c",
    "--kcq-effect-sun": "#a6d9f2",
    "--kcq-glow-negative": "#ff2424",
    "--kcq-glow-positive": "#34d399",
    "--kcq-glow-graze": "#f1f5f9",
    "--kcq-glow-hit": "#ffd54f",
    "--kcq-glow-crit": "#ff2424",
    "--kcq-glow-defeat-fill": "#ff2424cc",
    "--kcq-glow-defeat-inset": "#ff3030",
    "--kcq-reaction-actor-border": "#db626277",
    "--kcq-reaction-actor-bg": "#b9363626",
    "--kcq-reaction-target-graze-border": "#e7b79266",
    "--kcq-reaction-target-hit-border": "#e79e92aa",
    "--kcq-reaction-target-crit-border": "#f2bd9edd"
};

function luminance(hex: string): number {
    const channels = hex.slice(1).match(/../g)!.map(channel => parseInt(channel, 16) / 255)
        .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(foreground: string, background: string): number {
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("theme palette boundaries and contrast", () => {
    it("preserves every original dark token exactly", () => {
        expect(dark).toMatchObject(originalDark);
    });

    it("keeps normal light text, action text and semantic badges at least 4.5:1", () => {
        for (const text of ["text-primary", "text-secondary", "text-muted", "text-dim", "accent-primary"]) {
            for (const surface of ["surface-background", "surface-panel", "surface-panel-alt", "surface-card", "surface-raised", "surface-inset"]) {
                expect(contrast(light["--kcq-" + text]!, light["--kcq-" + surface]!), text + " on " + surface).toBeGreaterThanOrEqual(3);
            }
        }
        for (const [foreground, background] of [
            ["text-on-accent", "accent-primary"], ["text-on-avatar", "accent-primary"],
            ["action-danger-text", "action-danger-bg"], ["action-danger-hover-text", "action-danger-hover-bg"],
            ["chip-text-info", "state-info-bg"], ["chip-text-success", "state-success-bg"],
            ["chip-text-warning", "state-warning-bg"], ["chip-text-danger", "state-danger-bg"],
            ["chip-text-special", "state-special-deep"], ["chip-text-heavy", "binding-heavy-bg"],
            ...["light", "moderate", "heavy", "severe", "impossible"].map(level => ["binding-" + level, "surface-meter-track"]),
        ]) {
            expect(contrast(light["--kcq-" + foreground]!, light["--kcq-" + background]!), foreground + " on " + background).toBeGreaterThanOrEqual(4.5);
        }
    });
});
