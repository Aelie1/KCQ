import type { ActionInfo, PlayerAction, PreviewInfo } from "../../engine/public/types";
import type { FightPolicy, PolicyContext } from "../harness";

export function firstTargets(
    targetCount: number | "all",
    candidates: readonly PreviewInfo[],
): string[] {
    if (targetCount === 0 || targetCount === "all") {
        return [];
    }

    const targetIds = candidates
        .filter((candidate) => candidate.valid && candidate.target !== null)
        .map((candidate) => candidate.target as string);
    return [...new Set(targetIds)].slice(0, targetCount);
}

const programmedMoves: Readonly<Record<string, string>> = {
    ko: "telekinesis",
    matsuko: "whiteFlame",
    hinari: "rockfall",
    naruyo: "precisionStab",
    sakari: "malfunction",
};

export function chooseBasicAction(context: PolicyContext): PlayerAction {
    // Keep established preferred moves ahead of any fallback attacks.
    for (const actionView of context.actions) {
        if (!actionView.available) continue;
        const move = actionView.moves.find(candidate => candidate.move.id === programmedMoves[actionView.id]);
        const action = move && moveAction(actionView.id, move);
        if (action) return action;
    }

    // A blocked preferred move need not waste another legal, simple attack.
    // Public previews and library traits identify offense without scoring it.
    for (const actionView of context.actions) {
        if (!actionView.available) continue;
        for (const move of actionView.moves) {
            if (!move.available || move.move.targetSide !== "enemy") continue;
            const damaging = context.library.moves[move.move.id]?.traits?.includes("damage")
                || move.targets.some(target => target.valid && (target.damage !== undefined
                    || target.effects.some(effect => effect.type === "damage" && effect.amount > 0)));
            if (!damaging) continue;
            const action = moveAction(actionView.id, move);
            if (action) return action;
        }
    }

    return { type: "endTurn" };
}

function moveAction(actor: string, info: ActionInfo): PlayerAction | undefined {
    if (!info.available) return undefined;
    const targets = firstTargets(info.move.targets, info.targets);
    if (typeof info.move.targets === "number" && targets.length !== info.move.targets) return undefined;
    return { type: "move", actor, move: info.move.id, targets };
}

export const basicPolicy: FightPolicy = {
    id: "basic",
    chooseAction: chooseBasicAction,
};
