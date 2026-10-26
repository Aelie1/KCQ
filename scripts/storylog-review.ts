import {
    baseStrings,
    campaignStrings,
    characterStrings,
} from "../localization";
import type { StringTable } from "../src/ui/presentation/presentation";

type ReviewSource = {
    section: string;
    strings: StringTable;
};

const sources: ReviewSource[] = [
    { section: "System", strings: baseStrings.en },
    ...Object.entries(characterStrings).map(([character, languages]) => ({
        section: character,
        strings: languages.en,
    })),
    ...Object.entries(campaignStrings).map(([campaign, languages]) => ({
        section: campaign,
        strings: languages.en,
    })),
];

const actorBySection: Record<string, string> = {
    ko: "Ko-chan",
    matsuko: "Matsuko",
    hinari: "Hinari",
    naruyo: "Naruyo",
    sakari: "Sakari",
    skunk: "Skunkette A",
};

const sample = (section: string, text: string): string => {
    const playerSection = section in actorBySection && section !== "skunk";
    const values: Record<string, string> = {
        actor: actorBySection[section] ?? "Ko-chan",
        target: playerSection ? "Skunkette A" : "Ko-chan",
        targetCount: playerSection ? "the entire enemy party" : "Ko-chan and Matsuko",
        hits: "Ko-chan and Matsuko",
        misses: "Hinari",
        grazes: "Ko-chan",
        crits: "Matsuko",
        damage: "25",
        band: "Hit",
        hitLocation: "on her arms",
        targetPossessive: "Ko-chan's",
        binding: "arm",
        level: "Heavy",
        previous: "Moderate",
        buff: "Latex Mist III",
        trap: "Latex Puddle",
        amount: "25",
    };

    return text.replace(/\{([^}]+)\}/g, (match, name: string) => values[name] ?? match);
};

const cell = (value: string): string => value
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, "\\n");

console.log([
    "Section",
    "Key",
    "Text",
    "Sample",
    "Placeholders",
    "Suppress",
    "Review Notes",
].join("\t"));

for (const { section, strings } of sources) {
    const entries = Object.entries(strings)
        .filter(([key, value]) =>
            key.includes(".narrative.")
            && !key.endsWith(".suppress")
            && value.trim() !== ""
            && value.trim() !== "...")
        .sort(([left], [right]) => left.localeCompare(right));

    for (const [key, text] of entries) {
        const placeholders = [...new Set(
            [...text.matchAll(/\{([^}]+)\}/g)].map(match => match[1]!),
        )].join(", ");

        console.log([
            section,
            key,
            text,
            sample(section, text),
            placeholders,
            strings[`${key}.suppress`] ?? "",
            "",
        ].map(cell).join("\t"));
    }
}
