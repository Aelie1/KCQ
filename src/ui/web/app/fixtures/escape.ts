import type {
    ActionView,
    Binding,
    EntityId,
    EscapeInfo,
    GameState,
    ThresholdInfo,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { characterDetailsFixture } from "./characterDetails";

export interface EscapeFixture {
    actions: readonly ActionView[];
    actorId: EntityId;
    initialSelectedEscape?: Pick<EscapeInfo, "binding" | "target">;
    presentation: Presentation;
    state: GameState;
    thresholds: ThresholdInfo;
}

function binding(id: string, value: number, level: Binding["level"]): Binding {
    return { id, value, level, status: [], data: {}, tickEffects: [] };
}

const characterBindings: Record<string, Binding[]> = {
    ko: characterDetailsFixture.state.characters[0].bindings,
    matsuko: [
        binding("latexHead", 0, "none"),
        binding("latexArms", 0, "none"),
        binding("latexTorso", 54, "heavy"),
        binding("latexLegs", 25, "moderate"),
    ],
    hinari: [
        binding("latexHead", 0, "none"),
        binding("latexArms", 26, "moderate"),
        binding("latexTorso", 27, "moderate"),
        binding("latexLegs", 80, "overwhelming"),
    ],
};

const state = {
    ...characterDetailsFixture.state,
    characters: characterDetailsFixture.state.characters.map((character) => ({
        ...character,
        bindings: characterBindings[character.id] ?? character.bindings,
    })),
} satisfies GameState;

const escapes = [
    escape("ko", "latexHead", -8),
    escape("ko", "latexArms", -19),
    escape("ko", "latexTorso", -5),
    escape("ko", "latexLegs"),
    escape("matsuko", "latexHead"),
    escape("matsuko", "latexArms"),
    escape("matsuko", "latexTorso", -20),
    escape("matsuko", "latexLegs", -25),
    escape("hinari", "latexHead"),
    escape("hinari", "latexArms", -26),
    escape("hinari", "latexTorso", -27),
    {
        ...escape("hinari", "latexLegs", -8),
        effects: [
            bindingEffect("hinari", "latexLegs", -8),
            bindingEffect("ko", "latexArms", 8),
        ],
    },
] satisfies EscapeInfo[];

const actions = characterDetailsFixture.actions.map((action) => action.id === "ko"
    ? { ...action, escapes }
    : {
        ...action,
        available: true,
        reason: undefined,
        stance: { available: true },
    }) satisfies ActionView[];

const base = {
    state,
    actions,
    actorId: "ko",
    presentation: characterDetailsFixture.presentation,
    thresholds: characterDetailsFixture.thresholds,
} satisfies EscapeFixture;

export const escapeFixtures = {
    unselected: base,
    selectedAssist: {
        ...base,
        initialSelectedEscape: {
            target: "hinari",
            binding: "latexLegs",
        },
    },
} satisfies Record<string, EscapeFixture>;

function escape(target: string, bindingId: string, amount?: number): EscapeInfo {
    return {
        available: true,
        target,
        binding: bindingId,
        bonus: false,
        effects: amount === undefined ? [] : [bindingEffect(target, bindingId, amount)],
    };
}

function bindingEffect(target: string, bindingId: string, amount: number) {
    return {
        type: "binding" as const,
        target,
        binding: bindingId,
        amount,
    };
}
