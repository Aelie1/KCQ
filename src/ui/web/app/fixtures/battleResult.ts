import type { BattleResultStats } from "../viewModels/battleResult";
import { createBattleResultViewModel } from "../viewModels/battleResult";
import { battleOverviewFixture } from "./battleOverview";

const stats: BattleResultStats = {
    rounds: 12, actions: 34, peakBinding: 145, progress: 0.73, incapacitations: 2, rescues: 1,
    escapes: { count: 12, total: 264, max: 40 },
    hits: { count: 14, total: 448, max: 68, maxMove: "fairyRockfall" },
    bindings: { count: 28, total: 336, max: 38, maxMove: "latexSpray" },
};
const model = (outcome: "victory" | "defeat") => createBattleResultViewModel({
    ...battleOverviewFixture.state,
    turn: { ...battleOverviewFixture.state.turn, outcome },
}, stats, battleOverviewFixture.presentation)!;

export const battleResultFixtures = { victory: model("victory"), defeat: model("defeat") };
