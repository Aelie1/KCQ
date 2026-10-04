import { englishStrings } from "../../../../../localization/en";
import type {
    ActionInfo,
    Character,
    Enemy,
    EntityId,
    GameState,
    PreviewInfo,
} from "../../../../engine/public/types";
import { Presentation } from "../../../presentation/presentation";

export interface TargetingFixture {
    action: ActionInfo;
    actorId: EntityId;
    initialSelectedTargetIds?: readonly EntityId[];
    presentation: Presentation;
    state: GameState;
}

const presentation = new Presentation(englishStrings);

function character(id: string, standing: boolean): Character {
    return {
        id,
        acted: false,
        standing,
        bonusEscapes: 0,
        bindings: [],
        buffs: [],
        cooldowns: {},
        modifiers: {},
        blockedMoveTypes: [],
        data: {},
    };
}

function enemy(id: string): Enemy {
    return {
        id,
        defId: id.startsWith("skunketteQueen") ? "skunketteQueen" : "skunkette",
        rank: "enemy",
        maxHp: 200,
        currHp: 152,
        currDef: 0,
        intentions: [],
        buffs: [],
        cooldowns: {},
    };
}

function telekinesisTarget(target: string): PreviewInfo {
    const accuracy = { miss: 10, graze: 15, hit: 65, crit: 10 } as const;
    return {
        valid: true,
        target,
        accuracy,
        damage: {
            miss: { chance: 10, min: 0, max: 0 },
            graze: { chance: 15, min: 6, max: 15 },
            hit: { chance: 65, min: 24, max: 30 },
            crit: { chance: 10, min: 45, max: 60 },
        },
        effects: [],
    };
}

const state = {
    turn: {
        round: 4,
        step: 1,
        phase: "player",
        outcome: "ongoing",
    },
    characters: [
        character("ko", false),
        character("matsuko", false),
        character("hinari", true),
    ],
    enemies: [
        enemy("skunkette1"),
        enemy("skunketteQueen"),
        enemy("skunkette2"),
    ],
    traps: [{ id: "trapPuddle", amount: 57 }],
    encounter: {
        id: "plains_2",
        enemies: ["skunkette1", "skunketteQueen", "skunkette2"],
        bindings: [],
        traps: ["trapPuddle"],
    },
    difficulty: {
        id: "standard",
        playerModifiers: {},
        enemyModifiers: {},
    },
} satisfies GameState;

const telekinesis = {
    move: {
        id: "telekinesis",
        targetSide: "enemy",
        targets: 1,
        type: "mouth",
    },
    available: true,
    targets: [
        telekinesisTarget("skunkette1"),
        telekinesisTarget("skunketteQueen"),
        telekinesisTarget("skunkette2"),
    ],
    effects: [],
} satisfies ActionInfo;

const fairyEmpowerment = {
    move: {
        id: "fairyEmpowerment",
        targetSide: "player",
        targets: "all",
        type: "mouth",
    },
    available: true,
    targets: state.characters.map(({ id }) => ({
        valid: true as const,
        target: id,
        effects: [{
            type: "buff" as const,
            target: id,
            buff: "transformation",
            effects: { defense: 3 },
            operation: "add" as const,
        }],
    })),
    effects: [],
} satisfies ActionInfo;

const base = {
    state,
    actorId: "ko",
    presentation,
} satisfies Omit<TargetingFixture, "action">;

export const targetingFixtures = {
    telekinesisChoose: {
        ...base,
        action: telekinesis,
    },
    telekinesisReady: {
        ...base,
        action: telekinesis,
        initialSelectedTargetIds: ["skunkette1"],
    },
    allTargets: {
        ...base,
        action: fairyEmpowerment,
    },
} satisfies Record<string, TargetingFixture>;
