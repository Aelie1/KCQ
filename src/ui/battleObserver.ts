import type { ActionResult, BattleState, PlayerAction } from "../engine/public/types";

export interface BattleObserver {
    onAction?(
        action: PlayerAction,
        result: ActionResult,
        source: "player" | "automatic",
    ): void | Promise<void>;
    onOutcome?(outcome: BattleState): void | Promise<void>;
    onQuit?(): void | Promise<void>;
}
