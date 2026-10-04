import type { GameState } from "../../../../engine/public/types";

export const battleOverviewFixture = {
    round: 1,
    step: 0,
    phase: "player",
    outcome: "ongoing",
} satisfies GameState["turn"];
