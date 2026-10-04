import type { Enemy } from "../../../../engine/public/types";
import type {
    EnemyCardIntentions,
    IntentRowData,
    PartyCardData,
    PartyCondition,
} from "../components/componentTypes";

const skunkette = {
    id: "skunkette1",
    currHp: 200,
    maxHp: 200,
} satisfies Pick<Enemy, "currHp" | "id" | "maxHp">;

const skunk = {
    id: "skunk1",
    currHp: 300,
    maxHp: 300,
} satisfies Pick<Enemy, "currHp" | "id" | "maxHp">;

const queen = {
    id: "skunkQueen1",
    currHp: 234,
    maxHp: 750,
} satisfies Pick<Enemy, "currHp" | "id" | "maxHp">;

export const intentRowFixtures = {
    pounce: { move: "Pounce", target: "Ko-chan", outcome: "hit" },
    latexShower: { move: "Latex Shower", target: "Matsuko", outcome: "crit" },
    constructRainmaker: { move: "Construct Rainmaker" },
} satisfies Record<string, IntentRowData>;

export const enemyCardFixtures = [
    {
        enemy: skunkette,
        name: "Skunkette 1",
        intentions: [intentRowFixtures.pounce],
    },
    {
        enemy: skunk,
        name: "Skunk 1",
        intentions: [intentRowFixtures.latexShower],
    },
    {
        enemy: queen,
        name: "Skunk Queen",
        intentions: [
            { move: "Skunk Gun", target: "Ko-chan", outcome: "hit" },
            intentRowFixtures.constructRainmaker,
        ],
    },
] as const satisfies readonly {
    enemy: Pick<Enemy, "currHp" | "id" | "maxHp">;
    intentions: EnemyCardIntentions;
    name: string;
}[];

function condition(fields: PartyCondition): PartyCondition {
    return fields;
}

export const partyCardFixtures = [
    {
        name: "Ko-chan",
        id: "ko",
        acted: false,
        standing: false,
        blockedMoveTypes: ["arms", "mouth"],
        condition: condition({ label: "Immob", tone: "danger" }),
        bindings: [
            { id: "latexHead", label: "H", current: 72, max: 72, level: "severe" },
            { id: "latexArms", label: "A", current: 27, max: 34, level: "moderate" },
            { id: "latexTorso", label: "T", current: 89, max: 89, level: "max" },
            { id: "latexLegs", label: "L", current: 0, max: 0, level: "none" },
        ],
        visibleEffects: ["Pounced", "Transformation", "+2 more"],
    },
    {
        name: "Matsuko",
        id: "matsuko",
        acted: true,
        standing: false,
        blockedMoveTypes: ["mouth"],
        bindings: [
            { id: "latexHead", label: "H", current: 0, max: 0, level: "none" },
            { id: "latexArms", label: "A", current: 0, max: 0, level: "none" },
            { id: "latexTorso", label: "T", current: 54, max: 54, level: "severe" },
            { id: "latexLegs", label: "L", current: 25, max: 25, level: "moderate" },
        ],
        visibleEffects: ["Pounced", "Burnout", "Empowerment"],
    },
    {
        name: "Hinari",
        id: "hinari",
        acted: false,
        standing: true,
        blockedMoveTypes: ["legs"],
        bindings: [
            { id: "latexHead", label: "H", current: 0, max: 0, level: "none" },
            { id: "latexArms", label: "A", current: 26, max: 26, level: "moderate" },
            { id: "latexTorso", label: "T", current: 27, max: 27, level: "moderate" },
            { id: "latexLegs", label: "L", current: 80, max: 80, level: "max" },
        ],
        visibleEffects: ["Pounced", "Latex Mist", "+4 buffs"],
    },
] as const satisfies readonly PartyCardData[];
