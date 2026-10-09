import type { Enemy, EventFrame, GameEvent, GameState } from "../../../../engine/public/types";
import { getStringTable } from "../../../../../localization";
import { stockCampaign, stockCharacters } from "../../../../stock";
import { createGameLogEntries } from "../../../presentation/gameLog";
import { Presentation } from "../../../presentation/presentation";
import { makeFixtureCharacter } from "./publicFixture";

const enemy = (id: string): Enemy => ({
    id, defId: "skunkette", rank: "enemy", maxHp: 200, currHp: 200, currDef: 0,
    intentions: [], cooldowns: {}, buffs: id === "skunkette1" ? [{ id: "pounce", severity: 4, linkedEntity: "ko" }] : [],
});
const initialState: GameState = {
    turn: { round: 4, step: 1, phase: "player", outcome: "ongoing" },
    characters: [
        makeFixtureCharacter("ko", {
            bindings: [{ id: "latexArms", value: 12, level: "light", data: {}, status: [], tickEffects: [] }],
            buffs: [{ id: "pounce", severity: 4, linkedEntity: "skunkette1" }],
        }),
        makeFixtureCharacter("matsuko"),
        makeFixtureCharacter("hinari", { data: { subspace: 50, subspaceMax: 100 } }),
    ],
    enemies: [enemy("skunkette1"), enemy("skunkette2")],
    traps: [{ id: "trapPuddle", amount: 10 }],
    encounter: { id: "plains_1", enemies: ["skunkette1", "skunkette2"], bindings: ["latexArms", "latexTorso"], traps: ["trapPuddle"] },
    difficulty: { id: "standard", playerModifiers: {}, enemyModifiers: {} },
};

let current = initialState;
const frames: EventFrame[] = [];
function record(event: GameEvent, update?: (state: GameState) => void): void {
    current = structuredClone(current);
    update?.(current);
    frames.push({ event, state: current });
}
record({ type: "useEscape", actor: "ko", target: "ko", effects: [
    { type: "bondageRemoved", target: "ko", binding: "latexArms", amount: -12 },
] }, state => { state.characters[0]!.bindings = []; });
record({ type: "useMove", actor: "ko", move: "telekinesis", targets: [
    { target: "skunkette1", result: "hit", effects: [{ type: "enemyDamaged", target: "skunkette1", amount: 18 }] },
], effects: [] }, state => { state.enemies[0]!.currHp -= 18; });
record({ type: "useMove", actor: "hinari", move: "rockfall", targets: [
    { target: "skunkette1", result: "miss", effects: [] },
    { target: "skunkette1", result: "graze", effects: [{ type: "enemyDamaged", target: "skunkette1", amount: 3 }] },
    { target: "skunkette1", result: "hit", effects: [{ type: "enemyDamaged", target: "skunkette1", amount: 8 }] },
    { target: "skunkette1", result: "crit", effects: [{ type: "enemyDamaged", target: "skunkette1", amount: 16 }] },
], effects: [
    { type: "buffUpdated", target: "ko", buff: "pounce" },
    { type: "buffUpdated", target: "skunkette1", buff: "pounce" },
    { type: "dataChanged", target: "hinari", name: "subspace", amount: -25 },
] }, state => {
    state.enemies[0]!.currHp -= 27;
    state.characters[0]!.buffs[0]!.severity = 1;
    state.enemies[0]!.buffs[0]!.severity = 1;
    state.characters[2]!.data.subspace = 25;
});
record({ type: "useMove", actor: "matsuko", move: "immolation", targets: [
    { target: "skunkette1", result: "graze", effects: [{ type: "enemyDamaged", target: "skunkette1", amount: 6 }] },
    { target: "skunkette2", result: "crit", effects: [{ type: "enemyDamaged", target: "skunkette2", amount: 24 }] },
], effects: [{ type: "buffAdded", target: "matsuko", buff: "burnout" }] }, state => {
    state.enemies[0]!.currHp -= 6;
    state.enemies[1]!.currHp -= 24;
    state.characters[1]!.buffs = [{ id: "burnout", severity: 2 }];
});
for (const actor of ["ko", "hinari"]) record({
    type: "changeStance", actor, effects: [{ type: "stanceSet", actor, stance: "standing" }],
}, state => { state.characters.find(character => character.id === actor)!.standing = true; });
record({ type: "changePhase", phase: "enemy", effects: [] }, state => { state.turn.phase = "enemy"; });
record({ type: "useMove", actor: "skunkette1", move: "latexSpray", targets: [
    { target: "ko", result: "hit", effects: [{ type: "bondageAdded", target: "ko", binding: "latexTorso", amount: 18 }] },
], effects: [] }, state => {
    state.characters[0]!.bindings = [{ id: "latexTorso", value: 18, level: "light", data: {}, status: [], tickEffects: [] }];
});
record({ type: "changePhase", phase: "player", effects: [
    { type: "buffRemoved", target: "matsuko", buff: "burnout" },
    { type: "dataChanged", target: "hinari", name: "subspace", amount: 10 },
] }, state => {
    state.turn.phase = "player";
    state.turn.round = 5;
    state.characters[1]!.buffs = [];
    state.characters[2]!.data.subspace = 35;
});

export const gameLogFixture = {
    state: current,
    presentation: new Presentation(getStringTable("en", stockCharacters, stockCampaign)),
    entries: createGameLogEntries(frames, initialState),
};
