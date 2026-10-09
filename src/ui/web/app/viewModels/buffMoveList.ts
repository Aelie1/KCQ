import type { Buff, MoveId } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";

/** Shared category labels for previews and both entity Details panels. */
export function projectBuffMoveList(
    buff: Buff,
    presentation: Presentation,
    currentMoves?: ReadonlySet<MoveId>,
): { label: string; tone: "success" | "danger" }[] {
    const category = (moves: readonly MoveId[], variant: "allow" | "block") => {
        if (moves.length === 0) return [];
        const summary = presentation.buffMoveList(buff.id, variant);
        return summary !== undefined ? [summary] : moves.map(move => presentation.ui(
            variant === "allow" ? "targeting.addMove" : "targeting.blockMove",
            { move: presentation.move(move) },
        ));
    };
    return [
        ...category(buff.moveList?.addedMoves ?? [], "allow")
            .map(label => ({ label, tone: "success" as const })),
        ...category((buff.moveList?.blockedMoves ?? [])
            .filter(move => currentMoves === undefined || currentMoves.has(move)), "block")
            .map(label => ({ label, tone: "danger" as const })),
    ];
}
