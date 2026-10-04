import type {
    EventFrame,
    GameState,
    PlayerAction,
} from "../../../../engine/public/types";

const fixtureState = {
    turn: { round: 4, step: 1, phase: "player", outcome: "ongoing" },
    characters: [],
    enemies: [],
    traps: [],
    encounter: null,
    difficulty: {
        id: "standard",
        playerModifiers: {},
        enemyModifiers: {},
    },
} satisfies GameState;

const action = {
    type: "escape",
    actor: "ko",
    target: "ko",
    binding: "latexArms",
} satisfies PlayerAction;

const frames = [
    {
        state: fixtureState,
        event: {
            type: "useEscape",
            actor: "ko",
            target: "ko",
            effects: [
                { type: "bondageRemoved", target: "ko", binding: "latexArms", amount: -12 },
            ],
        },
    },
    {
        state: fixtureState,
        event: {
            type: "useMove",
            actor: "ko",
            move: "telekinesis",
            targets: [{
                target: "skunkette1",
                result: "hit",
                effects: [
                    { type: "enemyDamaged", target: "skunkette1", amount: 18 },
                ],
            }],
            effects: [],
        },
    },
    {
        state: fixtureState,
        event: {
            type: "useMove",
            actor: "hinari",
            move: "rockfall",
            targets: [
                {
                    target: "skunkette1",
                    result: "graze",
                    effects: [
                        { type: "enemyDamaged", target: "skunkette1", amount: 6 },
                    ],
                },
                {
                    target: "skunkette2",
                    result: "crit",
                    effects: [
                        { type: "enemyDamaged", target: "skunkette2", amount: 24 },
                        { type: "enemyDefeated", target: "skunkette2" },
                    ],
                },
            ],
            effects: [
                { type: "buffAdded", target: "hinari", buff: "focus" },
            ],
        },
    },
    {
        state: fixtureState,
        event: {
            type: "useMove",
            actor: "matsuko",
            move: "flameBurst",
            targets: [],
            effects: [
                { type: "actionInterrupted", actor: "matsuko", reason: "bindingRestriction" },
            ],
        },
    },
    {
        state: fixtureState,
        event: { type: "changePhase", phase: "enemy", effects: [] },
    },
    {
        state: fixtureState,
        event: {
            type: "useMove",
            actor: "skunkette1",
            move: "latexSpray",
            targets: [{
                target: "ko",
                result: "hit",
                effects: [
                    { type: "bondageChanged", target: "ko", binding: "latexTorso", amount: 21 },
                ],
            }],
            effects: [],
        },
    },
    {
        state: fixtureState,
        event: { type: "changePhase", phase: "player", effects: [] },
    },
] satisfies readonly EventFrame[];

export const gameLogFixture = {
    action,
    frames,
    startingRound: 4,
};
