import type { Presentation } from "../../../presentation/presentation";
import type { LibraryPage } from "./library";

const guide = (id: string, section: string): LibraryPage => ({ kind: "entry", category: "guide", id, section });

/** Authored bracket terms only. Context disambiguates results, traits, and modifiers. */
export const GUIDE_REFERENCES: Readonly<Record<string, LibraryPage>> = {
    Moving: guide("basics", "stances"),
    Standing: guide("basics", "stances"),
    "Bonus Escape": guide("bindings-and-escaping", "bonus-escapes"),
    Damage: guide("moves", "move-traits"),
    Buff: guide("moves", "move-traits"),
    Debuff: guide("moves", "move-traits"),
    "One-time": guide("moves", "move-traits"),
    Free: guide("moves", "move-traits"),
    Miss: guide("moves", "move-results"),
    Graze: guide("moves", "move-results"),
    Crit: guide("moves", "move-results"),
    Mouth: guide("modifiers", "mouth"),
    Arms: guide("modifiers", "arms"),
    Legs: guide("modifiers", "legs"),
    Hit: guide("modifiers", "hit"),
    Defense: guide("modifiers", "defense"),
    Escape: guide("modifiers", "escape"),
    Vulnerability: guide("modifiers", "vulnerability"),
    Potency: guide("modifiers", "potency"),
    Willpower: guide("modifiers", "willpower"),
    Spread: guide("modifiers", "spread"),
    Regeneration: guide("modifiers", "regeneration"),
    Traps: { kind: "category", category: "traps" },
    Vibrating: { kind: "entry", category: "statuses", id: "vibrating" },
    Immobilized: { kind: "entry", category: "statuses", id: "immobilized" },
};
export type GuideReferenceContext = "move-traits" | "move-results" | "bindings-and-escaping" | "modifiers" | "intentions";
const CONTEXT_REFERENCES: Partial<Record<GuideReferenceContext, Readonly<Record<string, LibraryPage>>>> = {
    "move-traits": { Escape: guide("moves", "move-traits") },
    "move-results": { Hit: guide("moves", "move-results") },
    "bindings-and-escaping": { Escape: guide("bindings-and-escaping", "escaping") },
    modifiers: { Traps: guide("modifiers", "traps") },
};
export function resolveGuideReference(term: string, context?: GuideReferenceContext, occurrence = 0): LibraryPage | undefined {
    // In Enemy Intentions the second [Hit] is a roll result; the first is a modifier.
    if (context === "intentions" && term === "Hit" && occurrence === 1) return guide("moves", "move-results");
    const references = context ? CONTEXT_REFERENCES[context] : undefined;
    return references && Object.hasOwn(references, term) ? references[term]
        : Object.hasOwn(GUIDE_REFERENCES, term) ? GUIDE_REFERENCES[term] : undefined;
}
export type GuideReferencePart = string | { label: string; page: LibraryPage };
export function guideReferenceParts(text: string, context?: GuideReferenceContext): GuideReferencePart[] {
    const parts: GuideReferencePart[] = [];
    let end = 0;
    const occurrences = new Map<string, number>();
    for (const match of text.matchAll(/\[([^\[\]\r\n]+)\]/g)) {
        const term = match[1]!;
        const occurrence = occurrences.get(term) ?? 0;
        occurrences.set(term, occurrence + 1);
        const page = resolveGuideReference(term, context, occurrence);
        if (!page) continue;
        parts.push(text.slice(end, match.index), { label: match[1]!, page });
        end = match.index + match[0].length;
    }
    parts.push(text.slice(end));
    return parts;
}
export const guideText = (p: Presentation, page: string, key: string): string => p.referenceText("guide", page, key) ?? "";
