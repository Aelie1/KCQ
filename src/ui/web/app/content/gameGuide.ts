import type { BindingLevel, HitBand, ModifierId } from "../../../../engine/public/types";
import type { CommandTagTone } from "../viewModels/characterDetails";

/** Keys are variants under guide.<page> in the presentation string table. */
export interface GuideSection {
    id: string;
    heading?: string;
    paragraphs: readonly string[];
    traits?: readonly { label: string; text: string; tone: CommandTagTone }[];
    table?: { headers?: readonly string[]; rows: readonly (readonly string[])[]; levels?: readonly BindingLevel[]; bands?: readonly Exclude<HitBand, "none">[] };
    list?: { ordered?: boolean; items: readonly string[] };
    after?: string;
    modifier?: ModifierId;
}
export interface GuidePage { id: string; sections: readonly GuideSection[] }

/** Small, explicit layout for the five authored pages; no engine content or Markdown compiler. */
export const GAME_GUIDE_PAGES: readonly GuidePage[] = [
    {
        id: "basics",
        sections: [
            {
                id: "overview",
                heading: "overview.heading",
                paragraphs: ["overview.paragraph.0", "overview.paragraph.1", "overview.paragraph.2"]
            },
            {
                id: "turns",
                heading: "turns.heading",
                paragraphs: ["turns.paragraph.0"]
            },
            {
                id: "stances",
                heading: "stances.heading",
                paragraphs: ["stances.paragraph.0"]
            },
            {
                id: "intentions",
                heading: "intentions.heading",
                paragraphs: ["intentions.paragraph.0"]
            }
        ]
    },
    {
        id: "moves",
        sections: [
            {
                id: "move-traits",
                heading: "move-traits.heading",
                paragraphs: ["move-traits.paragraph.0"],
                traits: [
                    { label: "trait.0.label", text: "trait.0.text", tone: "danger" },
                    { label: "trait.1.label", text: "trait.1.text", tone: "neutral" },
                    { label: "trait.2.label", text: "trait.2.text", tone: "special" },
                    { label: "trait.3.label", text: "trait.3.text", tone: "neutral" },
                    { label: "trait.4.label", text: "trait.4.text", tone: "neutral" },
                    { label: "trait.5.label", text: "trait.5.text", tone: "success" }
                ]
            },
            {
                id: "body-parts",
                heading: "body-parts.heading",
                paragraphs: ["body-parts.paragraph.0", "body-parts.paragraph.1"]
            },
            {
                id: "move-results",
                heading: "move-results.heading",
                paragraphs: ["move-results.paragraph.0"],
                table: {
                    rows: [
                        ["move-results.row.0.0", "move-results.row.0.1"],
                        ["move-results.row.1.0", "move-results.row.1.1"],
                        ["move-results.row.2.0", "move-results.row.2.1"],
                        ["move-results.row.3.0", "move-results.row.3.1"]
                    ],
                    bands: ["miss", "graze", "hit", "crit"]
                }
            },
            {
                id: "cooldowns",
                heading: "cooldowns.heading",
                paragraphs: ["cooldowns.paragraph.0"]
            },
            {
                id: "accuracy",
                heading: "accuracy.heading",
                paragraphs: ["accuracy.paragraph.0"]
            }
        ]
    },
    {
        id: "bindings-and-escaping",
        sections: [
            {
                id: "binding-severity",
                heading: "binding-severity.heading",
                paragraphs: ["binding-severity.paragraph.0"],
                table: {
                    rows: [
                        ["binding-severity.row.0.0", "binding-severity.row.0.1"],
                        ["binding-severity.row.1.0", "binding-severity.row.1.1"],
                        ["binding-severity.row.2.0", "binding-severity.row.2.1"],
                        ["binding-severity.row.3.0", "binding-severity.row.3.1"],
                        ["binding-severity.row.4.0", "binding-severity.row.4.1"]
                    ],
                    levels: ["light", "moderate", "heavy", "severe", "overwhelming"]
                }
            },
            {
                id: "escaping",
                heading: "escaping.heading",
                paragraphs: ["escaping.paragraph.0"],
                table: {
                    rows: [
                        ["escaping.row.0.0", "escaping.row.0.1", "escaping.row.0.2", "escaping.row.0.3"],
                        ["escaping.row.1.0", "escaping.row.1.1", "escaping.row.1.2", "escaping.row.1.3"]
                    ],
                    headers: ["escaping.column.0", "escaping.column.1", "escaping.column.2", "escaping.column.3"]
                }
            },
            {
                id: "bonus-escapes",
                heading: "bonus-escapes.heading",
                paragraphs: ["bonus-escapes.paragraph.0"],
                list: {
                    ordered: true,
                    items: ["bonus-escapes.item.0", "bonus-escapes.item.1", "bonus-escapes.item.2"]
                },
                after: "bonus-escapes.after"
            }
        ]
    },
    {
        id: "modifiers",
        sections: [
            {
                id: "overview",
                heading: "overview.heading",
                paragraphs: ["overview.paragraph.0"]
            },
            {
                id: "mouth",
                heading: "mouth.heading",
                paragraphs: ["mouth.paragraph.0"],
                modifier: "hitmouth"
            },
            {
                id: "arms",
                heading: "arms.heading",
                paragraphs: ["arms.paragraph.0"],
                modifier: "hitarms"
            },
            {
                id: "legs",
                heading: "legs.heading",
                paragraphs: ["legs.paragraph.0"],
                modifier: "hitlegs"
            },
            {
                id: "hit",
                heading: "hit.heading",
                paragraphs: ["hit.paragraph.0"],
                modifier: "hit"
            },
            {
                id: "defense",
                heading: "defense.heading",
                paragraphs: ["defense.paragraph.0"],
                modifier: "defense"
            },
            {
                id: "escape",
                heading: "escape.heading",
                paragraphs: ["escape.paragraph.0"],
                modifier: "escape"
            },
            {
                id: "vulnerability",
                heading: "vulnerability.heading",
                paragraphs: ["vulnerability.paragraph.0"],
                modifier: "vulnerability"
            },
            {
                id: "potency",
                heading: "potency.heading",
                paragraphs: ["potency.paragraph.0"],
                modifier: "potency"
            },
            {
                id: "traps",
                heading: "traps.heading",
                paragraphs: ["traps.paragraph.0"],
                modifier: "traps"
            },
            {
                id: "willpower",
                heading: "willpower.heading",
                paragraphs: ["willpower.paragraph.0"],
                modifier: "willpower"
            },
            {
                id: "spread",
                heading: "spread.heading",
                paragraphs: ["spread.paragraph.0"],
                modifier: "spread"
            },
            {
                id: "regeneration",
                heading: "regeneration.heading",
                paragraphs: ["regeneration.paragraph.0"],
                modifier: "regeneration"
            }
        ]
    },
    {
        id: "strategy",
        sections: [
            {
                id: "overview",
                paragraphs: ["overview.paragraph.0"],
                list: {
                    items: ["tip.0", "tip.1", "tip.2", "tip.3", "tip.4", "tip.5", "tip.6", "tip.7"]
                }
            }
        ]
    }
];

export const gameGuidePage = (id: string): GuidePage | undefined => GAME_GUIDE_PAGES.find(page => page.id === id);
