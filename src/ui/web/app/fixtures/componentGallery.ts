import { englishStrings } from "../../../../../localization/en/index";
import type {
    ActionView,
    Binding,
    BindingLevel,
    Buff,
    Character,
    Enemy,
    FailureReason,
    HitBand,
    Intention,
    MoveId,
    ThresholdInfo,
} from "../../../../engine/public/types";
import { Presentation } from "../../../presentation/presentation";
import { createEnemyCardViewModel } from "../viewModels/enemyCard";
import { createIntentViewModel } from "../viewModels/intentRow";
import { createPartyCardViewModel } from "../viewModels/partyCard";
import { makeFixtureCharacter } from "./publicFixture";

const presentation = new Presentation(englishStrings);

function intention(move: MoveId, target?: string, band: HitBand = "none"): Intention {
    return {
        move,
        targets: target ? [{ target, band, effects: [] }] : [],
        effects: [],
    };
}

const rawIntentions = {
    pounce: intention("pounce", "ko", "hit"),
    latexShower: intention("latexShower", "matsuko", "crit"),
    constructRainmaker: intention("latexRainmaker"),
    skunkGun: intention("skunkGun", "ko", "hit"),
    skunkCollar: intention("skunkCollar", "hinari", "graze"),
    callReinforcements: intention("callReinforcements"),
    skunkPerfume: intention("skunkPerfume"),
} as const;

export const intentRowFixtures = {
    pounce: createIntentViewModel(rawIntentions.pounce, presentation),
    latexShower: createIntentViewModel(rawIntentions.latexShower, presentation),
    constructRainmaker: createIntentViewModel(rawIntentions.constructRainmaker, presentation),
};

function enemy(id: string, currHp: number, maxHp: number, intentions: Intention[]): Enemy {
    return {
        id,
        defId: id.replace(/\d+$/, ""),
        rank: id.startsWith("queen") ? "boss" : "enemy",
        currHp,
        maxHp,
        currDef: 0,
        intentions,
        buffs: [],
        cooldowns: {},
    };
}

const rawEnemyCardFixtures = [
    enemy("skunkette1", 200, 200, []),
    enemy("skunk1", 300, 300, [rawIntentions.latexShower]),
    enemy("queen1", 550, 750, [
        rawIntentions.skunkGun,
        rawIntentions.constructRainmaker,
    ]),
    enemy("queen2", 400, 750, [
        rawIntentions.skunkGun,
        rawIntentions.skunkCollar,
        rawIntentions.callReinforcements,
    ]),
    enemy("queen3", 234, 750, [
        rawIntentions.skunkGun,
        rawIntentions.skunkCollar,
        rawIntentions.callReinforcements,
        rawIntentions.constructRainmaker,
        rawIntentions.skunkPerfume,
    ]),
];

export const enemyCardFixtures = rawEnemyCardFixtures.map((fixture) =>
    createEnemyCardViewModel(fixture, presentation));

const thresholds: ThresholdInfo = {
    thresholds: {
        light: 10,
        moderate: 20,
        heavy: 35,
        severe: 50,
        overwhelming: 70,
    },
    max: 100,
};

function binding(id: string, value: number, level: BindingLevel): Binding {
    return { id, value, level, data: {}, status: [], tickEffects: [] };
}

function buff(id: string): Buff {
    return { id };
}

function character(
    id: string,
    options: {
        acted?: boolean;
        standing?: boolean;
        blockedMoveTypes?: Character["blockedMoveTypes"];
        bindings?: Binding[];
        buffs?: Buff[];
    } = {},
): Character {
    return makeFixtureCharacter(id, {
        acted: options.acted ?? false,
        standing: options.standing ?? false,
        bindings: options.bindings ?? [],
        buffs: options.buffs ?? [],
        blockedMoveTypes: options.blockedMoveTypes ?? [],
    });
}

function action(
    id: string,
    reason?: FailureReason,
    stanceReason?: FailureReason,
): ActionView {
    return {
        id,
        available: reason === undefined,
        ...(reason ? { reason } : {}),
        moves: [],
        escapes: [],
        stance: stanceReason
            ? { available: false, reason: stanceReason }
            : { available: true },
    };
}

const rawPartyCardFixtures = [
    {
        character: character("ko", {
            blockedMoveTypes: ["arms", "mouth"],
            bindings: [
                binding("latexHead", 72, "severe"),
                binding("latexArms", 27, "moderate"),
                binding("latexTorso", 89, "max"),
                binding("latexLegs", 0, "none"),
            ],
            buffs: [buff("pounce"), buff("transformation"), buff("empowerment"), buff("reflect")],
        }),
        action: action("ko"),
    },
    {
        character: character("matsuko", {
            acted: true,
            blockedMoveTypes: ["mouth"],
            bindings: [
                binding("latexHead", 0, "none"),
                binding("latexArms", 0, "none"),
                binding("latexTorso", 54, "severe"),
                binding("latexLegs", 25, "moderate"),
            ],
            buffs: [buff("pounce"), buff("burnout"), buff("empowerment")],
        }),
        action: action("matsuko", "actorAlreadyActed"),
    },
    {
        character: character("hinari", {
            standing: true,
            blockedMoveTypes: ["legs"],
            bindings: [
                binding("latexHead", 0, "none"),
                binding("latexArms", 26, "moderate"),
                binding("latexTorso", 27, "moderate"),
                binding("latexLegs", 80, "max"),
            ],
            buffs: [buff("pounce"), buff("latexMist")],
        }),
        action: action("hinari"),
    },
    {
        character: character("ko", {
            standing: true,
            blockedMoveTypes: ["legs"],
            bindings: [
                binding("latexHead", 20, "moderate"),
                binding("latexArms", 35, "heavy"),
                binding("latexTorso", 50, "severe"),
                binding("latexLegs", 70, "overwhelming"),
            ],
        }),
        action: action("ko", undefined, "actorImmobilized"),
    },
    {
        character: character("matsuko", {
            blockedMoveTypes: ["arms", "mouth", "legs"],
            bindings: [
                binding("latexHead", 100, "max"),
                binding("latexArms", 100, "max"),
                binding("latexTorso", 100, "max"),
                binding("latexLegs", 100, "max"),
            ],
            buffs: [buff("servitude")],
        }),
        action: action("matsuko", "actorIncapacitated"),
    },
];

export const partyCardFixtures = rawPartyCardFixtures.map((fixture) =>
    createPartyCardViewModel(fixture.character, fixture.action, thresholds, presentation));
