import type { Buff, MoveId } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";

/** Shared category labels for previews and both entity Details panels. */
export function projectBuffMoveList(
    buff: Pick<Buff, "id" | "moveList">,
    presentation: Presentation,
    currentMoves?: ReadonlySet<MoveId>,
    references = false,
): { label: string; tone: "success" | "danger"; move?: MoveId }[] {
    const category = (moves: readonly MoveId[], variant: "allow" | "block") => {
        if (moves.length === 0) return [];
        const summary = presentation.buffMoveList(buff.id, variant);
        return summary !== undefined && !references ? [{ label: summary }] : moves.map(move => ({
            label: presentation.ui(variant === "allow" ? "targeting.addMove" : "targeting.blockMove", { move: presentation.move(move) }),
            ...(references ? { move } : {}),
        }));
    };
    return [
        ...category(buff.moveList?.addedMoves ?? [], "allow")
            .map(detail => ({ ...detail, tone: "success" as const })),
        ...category((buff.moveList?.blockedMoves ?? [])
            .filter(move => currentMoves === undefined || currentMoves.has(move)), "block")
            .map(detail => ({ ...detail, tone: "danger" as const })),
    ];
}
