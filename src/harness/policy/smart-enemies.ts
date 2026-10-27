import type { ActionInfo, ActionView, Enemy, EntityId, GameState } from "../../engine/public/types";

interface SmartEnemyView {
    readonly physicalEnemies: readonly Enemy[];
    readonly dormantIds: ReadonlySet<EntityId>;
}

// Only derived views are cached. Never cache a caller's mutable state: the next
// decision must observe a newly added or removed Dormant buff, even at the same HP.
const views = new WeakMap<GameState, SmartEnemyView>();

/**
 * Decision-local strategic state. Enemy valuation sees only non-dormant enemies;
 * characters, effects, and action previews retain their full mechanical meaning.
 * Nested scorers reuse this view in O(1), without cloning/filtering per candidate.
 */
export function smartEnemyContext<T extends {
    readonly state: GameState;
    readonly actions?: readonly ActionView[];
}>(context: T): T {
    if (views.has(context.state)) return context;

    const dormantIds = new Set(context.state.enemies
        .filter((enemy) => enemy.buffs.some(({ id }) => id === "dormant"))
        .map(({ id }) => id));
    const state = {
        ...context.state,
        enemies: context.state.enemies.filter(({ id }) => !dormantIds.has(id)),
    };
    views.set(state, { physicalEnemies: context.state.enemies, dormantIds });
    // Keep every preview/effect, including automatic dormant recipients. Only
    // mark moves with insufficient selectable active targets strategically unusable.
    const actions = dormantIds.size === 0 ? context.actions : context.actions?.map((view) => ({
        ...view,
        moves: view.moves.map((info) => info.available && !hasSelectableTargets(info, dormantIds)
            ? { ...info, available: false }
            : info),
    }));
    return { ...context, state, ...(actions === undefined ? {} : { actions }) };
}

function hasSelectableTargets(info: ActionInfo, excluded: ReadonlySet<EntityId>): boolean {
    if (info.move.targets === "all" || info.move.targets === 0) return true;
    const ids = new Set(info.targets.flatMap((target) =>
        target.valid && target.target !== null && !excluded.has(target.target) ? [target.target] : []));
    return ids.size >= info.move.targets;
}

/** For explicit target selection only; never remove automatic/AoE previews. */
export function dormantEnemyIds(context: { readonly state: GameState }): ReadonlySet<EntityId> {
    return views.get(smartEnemyContext(context).state)!.dormantIds;
}

/** Physical random destinations still include dormant enemies, at zero value. */
export function physicalEnemies(context: { readonly state: GameState }): readonly Enemy[] {
    return views.get(smartEnemyContext(context).state)!.physicalEnemies;
}
