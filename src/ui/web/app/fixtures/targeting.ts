import { getStringTable } from "../../../../../localization";
import { stockCampaign, stockCharacters } from "../../../../stock";
import type {
    ActionInfo,
    ActionView,
    Enemy,
    EntityId,
    GameState,
    PreviewInfo,
    ThresholdInfo,
} from "../../../../engine/public/types";
import { Presentation } from "../../../presentation/presentation";
import { characterDetailsFixture } from "./characterDetails";

export interface TargetingFixture {
    action: ActionInfo;
    actions: readonly ActionView[];
    actorId: EntityId;
    initialSelectedTargetIds?: readonly EntityId[];
    presentation: Presentation;
    state: GameState;
    thresholds: ThresholdInfo;
}

const presentation = new Presentation(getStringTable("en", stockCharacters, stockCampaign));

function enemy(id: string): Enemy {
    return {
        id,
        defId: id.startsWith("skunketteQueen") ? "skunketteQueen" : "skunkette",
        rank: "enemy",
        maxHp: 200,
        currHp: 152,
        currDef: 0,

        modifiers: {},
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
    ...characterDetailsFixture.state,
    enemies: [
        enemy("skunkette1"),
        enemy("skunketteQueen"),
        enemy("skunkette2"),
    ],
    encounter: {
        ...characterDetailsFixture.state.encounter,
        id: characterDetailsFixture.state.encounter?.id ?? "plains_2",
        enemies: ["skunkette1", "skunketteQueen", "skunkette2"],
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
            buff: { id: "transformation", modifiers: { defense: 3 } },
            operation: "add" as const,
        }],
    })),
    effects: [],
} satisfies ActionInfo;

const base = {
    state,
    actions: characterDetailsFixture.actions,
    actorId: "ko",
    presentation,
    thresholds: characterDetailsFixture.thresholds,
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
