import { englishStrings } from "../../../../../localization/en/index";
import type {
    ActionView,
    Binding,
    BindingLevel,
    Buff,
    Character,
    Enemy,
    FailureReason,
    GameState,
    HitBand,
    Intention,
    ThresholdInfo,
} from "../../../../engine/public/types";
import { Presentation } from "../../../presentation/presentation";
import { makeFixtureCharacter } from "./publicFixture";

const presentation = new Presentation(englishStrings);

const thresholds = {
    thresholds: {
        light: 10,
        moderate: 25,
        heavy: 40,
        severe: 55,
        overwhelming: 75,
        max: 100,
    },
    max: 100,
} satisfies ThresholdInfo;

function intention(move: string, target?: string, band: HitBand = "none"): Intention {
    return {
        move,
        targets: target ? [{ target, band, effects: [] }] : [],
        effects: [],
    };
}

function enemy(
    id: string,
    currHp: number,
    maxHp: number,
    intentions: Intention[],
): Enemy {
    return {
        id,
        defId: id.replace(/\d+$/, ""),
        rank: id === "queen" ? "boss" : "enemy",
        currHp,
        maxHp,
        currDef: 0,
        intentions,
        buffs: [],
        cooldowns: {},
    };
}

function binding(id: string, value: number, level: BindingLevel): Binding {
    return { id, value, level, data: {}, status: [], tickEffects: [] };
}

function buff(id: string, duration?: number): Buff {
    return { id, ...(duration === undefined ? {} : { duration }) };
}

function character(
    id: string,
    options: {
        bindings: Binding[];
        blockedMoveTypes?: Character["blockedMoveTypes"];
        buffs?: Buff[];
        standing?: boolean;
    },
): Character {
    return makeFixtureCharacter(id, {
        standing: options.standing ?? false,
        bindings: options.bindings,
        buffs: options.buffs ?? [],
        blockedMoveTypes: options.blockedMoveTypes ?? [],
    });
}

function action(id: string, stanceReason?: FailureReason): ActionView {
    return {
        id,
        available: true,
        moves: [],
        escapes: [],
        stance: stanceReason
            ? { available: false, reason: stanceReason }
            : { available: true },
    };
}

const state = {
    turn: {
        round: 4,
        step: 2,
        phase: "enemy",
        outcome: "ongoing",
    },
    encounter: {
        id: "plains_2",
        enemies: ["skunkette1", "skunkette2", "skunk1", "queen", "skunkette3", "skunkette4"],
        bindings: ["latexHead", "latexArms", "latexTorso", "latexLegs"],
        traps: ["trapPuddle"],
    },
    enemies: [
        enemy("skunkette1", 200, 200, [intention("pounce", "ko", "hit")]),
        enemy("skunkette2", 200, 200, [intention("latexSpray", "ko", "hit")]),
        enemy("skunk1", 300, 300, [intention("latexShower", "matsuko", "crit")]),
        enemy("queen", 234, 750, [
            intention("skunkGun", "ko", "hit"),
            intention("latexRainmaker"),
            intention("callReinforcements"),
        ]),
        enemy("skunkette3", 164, 200, [intention("latexMist", "hinari", "graze")]),
        enemy("skunkette4", 200, 200, [intention("pounce", "ko", "hit")]),
    ],
    characters: [
        character("ko", {
            blockedMoveTypes: ["arms", "mouth"],
            bindings: [
                binding("latexHead", 72, "severe"),
                binding("latexArms", 27, "moderate"),
                binding("latexTorso", 89, "overwhelming"),
                binding("latexLegs", 0, "none"),
            ],
            buffs: [
                buff("pounce", 1),
                buff("transformation", 2),
                buff("empowerment", 2),
                buff("reflect", 1),
            ],
        }),
        character("matsuko", {
            blockedMoveTypes: ["mouth"],
            bindings: [
                binding("latexHead", 0, "none"),
                binding("latexArms", 0, "none"),
                binding("latexTorso", 54, "heavy"),
                binding("latexLegs", 25, "moderate"),
            ],
            buffs: [buff("pounce", 1), buff("burnout", 2), buff("empowerment", 2)],
        }),
        character("hinari", {
            standing: true,
            blockedMoveTypes: ["legs"],
            bindings: [
                binding("latexHead", 0, "none"),
                binding("latexArms", 26, "moderate"),
                binding("latexTorso", 27, "moderate"),
                binding("latexLegs", 80, "overwhelming"),
            ],
            buffs: [
                buff("pounce", 1),
                buff("latexMist", 2),
                buff("brace", 1),
                buff("subspaceClutter", 2),
                buff("defenseBarrier", 1),
                buff("reflect", 1),
            ],
        }),
    ],
    traps: [{ id: "trapPuddle", amount: 57 }],
    difficulty: {
        id: "standard",
        playerModifiers: {},
        enemyModifiers: {},
    },
} satisfies GameState;

const actions = [
    action("ko", "actorImmobilized"),
    action("matsuko"),
    action("hinari"),
] satisfies ActionView[];

export const battleOverviewFixture = {
    state,
    actions,
    thresholds,
    presentation,
};
