import type { ContentLibrary } from "../../../engine/public/library";
import type { DifficultyId, EncounterId } from "../../../engine/public/types";
import { DEFAULT_DIFFICULTY, ENCOUNTER_DIFFICULTIES } from "../app";

export type GraphicalRoute =
    | { screen: "picker" }
    | { screen: "details"; encounter: EncounterId }
    | { screen: "battle"; encounter: EncounterId; difficulty: DifficultyId }
    | { screen: "error" };

export function selectGraphicalRoute(params: URLSearchParams, library: ContentLibrary): GraphicalRoute {
    const encounter = params.get("encounter");
    if (!encounter) return { screen: "picker" };
    if (!Object.values(library.encounters).some(({ id }) => id === encounter)) return { screen: "error" };
    if (!params.has("difficulty")) return { screen: "details", encounter };
    const difficulty = ENCOUNTER_DIFFICULTIES.find(({ id }) => id === params.get("difficulty"))?.id;
    return difficulty ? { screen: "battle", encounter, difficulty } : { screen: "error" };
}

/** The entry flow has no difficulty selector yet. Keep its default in one place. */
export function encounterStartRoute(encounter: EncounterId): Extract<GraphicalRoute, { screen: "battle" }> {
    return { screen: "battle", encounter, difficulty: DEFAULT_DIFFICULTY };
}

export function graphicalRouteSearch(route: Exclude<GraphicalRoute, { screen: "error" }>): string {
    const params = new URLSearchParams();
    if (route.screen !== "picker") params.set("encounter", route.encounter);
    if (route.screen === "battle") params.set("difficulty", route.difficulty);
    return params.size ? `?${params}` : "";
}
