import { englishStrings } from "../../../../../localization/en/index";
import type {
    ActionInfo,
    ActionView,
    Binding,
    Buff,
    Character,
    Effect,
    EntitySide,
    GameState,
    MoveType,
    PreviewInfo,
    TargetCount,
    ThresholdInfo,
} from "../../../../engine/public/types";
import { Presentation } from "../../../presentation/presentation";

const presentation = new Presentation(englishStrings);

function binding(
    id: string,
    value: number,
    level: Binding["level"],
    status: Binding["status"] = [],
): Binding {
    return { id, value, level, status, data: {}, tickEffects: [] };
}

function character(
    id: string,
    overrides: Partial<Character> = {},
): Character {
    return {
        id,
        acted: false,
        standing: false,
        bonusEscapes: 0,
        bonusBlocked: false,
        bindings: [],
        buffs: [],
        cooldowns: {},
        modifiers: {},
        blockedMoveTypes: [],
        data: {},
        ...overrides,
    };
}

function validTarget(
    target: string | null,
    effects: Effect[] = [],
    damage = false,
): PreviewInfo {
    return {
        valid: true,
        target,
        effects,
        ...(damage ? {
            damage: { hit: { chance: 100, min: 18, max: 24 } },
        } : {}),
    };
}

function move(
    id: string,
    type: MoveType,
    targetSide: EntitySide,
    targets: TargetCount,
    previews: PreviewInfo[],
    options: { effects?: Effect[]; hits?: number } = {},
): ActionInfo {
    return {
        move: {
            id,
            type,
            targetSide,
            targets,
            ...(options.hits ? { hits: options.hits } : {}),
        },
        available: true,
        targets: previews,
        effects: options.effects ?? [],
    };
}

const koBuffs: Buff[] = [
    {
        id: "pounce",
        statuses: [{ id: "immobilized", value: 1 }],
        modifiers: { hit: -1 },
        linkedEntity: "skunkette1",
    },
    {
        id: "transformation",
        duration: 2,
        modifiers: { defense: 3 },
    },
    { id: "empowerment" },
];

const koMoves: ActionInfo[] = [
    move("telekinesis", "mouth", "enemy", 1, [
        validTarget("skunkette1", [], true),
    ]),
    move("fairyTelekinesis", "mouth", "enemy", "all", [
        validTarget("skunkette1", [], true),
    ], { hits: 2 }),
    move("starlightBindings", "mouth", "enemy", 1, [
        validTarget("skunkette1", [{
            type: "binding",
            target: "skunkette1",
            binding: "latexArms",
            amount: 20,
        }]),
    ]),
    move("fairyStarlightBindings", "mouth", "enemy", "all", [
        validTarget("skunkette1", [{
            type: "binding",
            target: "skunkette1",
            binding: "latexArms",
            amount: 20,
        }]),
    ]),
    move("reflect", "mouth", "player", 0, [
        validTarget(null),
    ], {
        effects: [{
            type: "buff",
            target: "ko",
            buff: { id: "reflect" },
            operation: "add",
        }]
    }),
    move("fairyReflect", "mouth", "player", 0, [
        validTarget(null),
    ], {
        effects: [{
            type: "buff",
            target: "ko",
            buff: { id: "fairyReflect" },
            operation: "add",
        }]
    }),
    move("fairyTransformation", "mouth", "player", 0, [
        validTarget(null),
    ], {
        effects: [{
            type: "buff",
            target: "ko",
            buff: { id: "transformation" },
            operation: "add",
        }]
    }),
    move("fairyEmpowerment", "mouth", "player", "all", [
        validTarget("ko", [{
            type: "buff",
            target: "ko",
            buff: { id: "empowerment" },
            operation: "add",
        }]),
        validTarget("matsuko", [{
            type: "buff",
            target: "matsuko",
            buff: { id: "empowerment" },
            operation: "add",
        }]),
    ]),
    move("powerOfDenial", "mouth", "either", 1, [
        validTarget("matsuko"),
        validTarget("skunkette1"),
    ]),
];

const koAction: ActionView = {
    id: "ko",
    available: true,
    moves: koMoves,
    escapes: [
        {
            available: false,
            reason: "escapeUnavailable",
            target: "ko",
            binding: "latexArms",
            effects: [],
        },
        {
            available: false,
            reason: "escapeUnavailable",
            target: "matsuko",
            binding: "latexTorso",
            effects: [],
        },
    ],
    stance: { available: false, reason: "actorImmobilized" },
};

const state = {
    turn: {
        round: 4,
        step: 1,
        phase: "player",
        outcome: "ongoing",
    },
    characters: [
        character("ko", {
            bindings: [
                binding("latexHead", 72, "severe", [
                    { id: "gagged", value: 3 },
                    { id: "submissive", value: 1 },
                ]),
                binding("latexArms", 27, "moderate", [
                    { id: "bound", value: 1 },
                ]),
                binding("latexTorso", 89, "overwhelming", [
                    { id: "breathless", value: 4 },
                    { id: "vibrating", value: 3 },
                ]),
                binding("latexLegs", 0, "none"),
            ],
            buffs: koBuffs,
            modifiers: {
                hitarms: -2,
                defense: -8,
                willpower: -2,
                vulnerability: 2,
            },
            blockedMoveTypes: ["mouth"],
        }),
        character("matsuko"),
        character("hinari", { standing: true }),
    ],
    enemies: [{
        id: "skunkette1",
        defId: "skunkette",
        rank: "enemy",
        maxHp: 200,
        currHp: 200,
        currDef: 0,
        intentions: [],
        buffs: [],
        cooldowns: {},
    }],
    traps: [],
    encounter: {
        id: "plains_2",
        enemies: ["skunkette1"],
        bindings: ["latexHead", "latexArms", "latexTorso", "latexLegs"],
        traps: [],
    },
    difficulty: {
        id: "standard",
        playerModifiers: {},
        enemyModifiers: {},
    },
} satisfies GameState;

const actions = [
    koAction,
    {
        id: "matsuko",
        available: false,
        reason: "actorIncapacitated",
        moves: [],
        escapes: [],
        stance: { available: false, reason: "actorIncapacitated" },
    },
    {
        id: "hinari",
        available: false,
        reason: "actorSkipped",
        moves: [],
        escapes: [],
        stance: { available: false, reason: "actorSkipped" },
    },
] satisfies ActionView[];

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

export const characterDetailsFixture = {
    state,
    actions,
    focusedCharacterId: "ko",
    presentation,
    thresholds,
};
