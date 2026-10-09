import type { ActionResult, BondageEvent, Character, GameEvent, GameState, LeafEvent, PlayerAction } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";

export interface ActionSummary {
    count: number;
    total: number;
    max: number;
    maxMove?: string;
}

export interface BattleResultStats {
    rounds: number;
    actions: number;
    escapes: ActionSummary;
    hits: ActionSummary;
    bindings: ActionSummary;
    peakBinding: number;
    incapacitations: number;
    rescues: number;
    progress: {
        boss?: number;
        enemies?: number;
    };
}

export interface BattleResultViewModel {
    outcome: "victory" | "defeat";
    heading: string;
    encounter: string;
    difficulty: string;
    summary: string;
    progress?: string;
    rows: { label: string; value: string; detail?: string }[];
    retryLabel: string;
    backLabel: string;
    gameLogLabel: string;
}

const emptySummary = (): ActionSummary => ({ count: 0, total: 0, max: 0 });
const leaves = (event: GameEvent): LeafEvent[] => event.type === "useMove"
    ? [...event.targets.flatMap(target => target.effects), ...event.effects]
    : event.effects;
const isBindingChange = (event: LeafEvent): event is BondageEvent => event.type === "bondageAdded"
    || event.type === "bondageChanged" || event.type === "bondageRemoved";
const incapacitated = (character: Character): boolean => character.bindings.some(binding =>
    binding.status.some(status => status.id === "incapacitated" && status.value > 0))
    || character.buffs.some(buff => buff.statuses?.some(status => status.id === "incapacitated" && status.value > 0));
const skunkLink = (character: Character): string | undefined =>
    character.buffs.find(buff => buff.id === "skunked")?.linkedEntity;

/** Incremental UI statistics from public action frames; no replay or engine internals required. */
export function createBattleResultTracker(initial: GameState) {
    const stats: BattleResultStats = {
        rounds: initial.turn.round,
        actions: 0,
        escapes: emptySummary(),
        hits: emptySummary(),
        bindings: emptySummary(),
        peakBinding: 0,
        incapacitations: 0,
        rescues: 0,
        progress: {},
    };

    const playerIds = new Set(initial.characters.map(character => character.id));
    const tracks = new Map<string, Map<string, number>>();

    // Track enemies that have actually appeared.
    // Defeated enemies remain in this map at 0 HP.
    const enemyHp = new Map(initial.enemies.map(enemy => [enemy.id, {
        rank: enemy.rank,
        maxHp: enemy.maxHp,
        currHp: enemy.currHp,
    }]));

    let previous: GameState | undefined;
    let terminal = initial.turn.outcome !== "ongoing";

    const peak = (): void => {
        const burden = [...tracks.values()].reduce((sum, zones) =>
            sum + [...zones.values()].reduce((total, value) => total + value, 0), 0);

        stats.peakBinding = Math.max(stats.peakBinding, burden);
    };

    const updateProgress = (state: GameState): void => {
        const currentIds = new Set(state.enemies.map(enemy => enemy.id));

        for (const enemy of state.enemies) {
            enemyHp.set(enemy.id, {
                rank: enemy.rank,
                maxHp: enemy.maxHp,
                currHp: enemy.currHp,
            });
        }

        // Anything we've seen before that is no longer present was defeated.
        for (const [id, enemy] of enemyHp) {
            if (!currentIds.has(id)) {
                enemy.currHp = 0;
            }
        }

        // Prefer bosses even after they are defeated; otherwise combine all observed enemies.
        const observed = [...enemyHp.values()];
        const bosses = observed.filter(enemy => enemy.rank === "boss");
        const selected = bosses.length > 0 ? bosses : observed;
        const maxHp = selected.reduce((sum, enemy) => sum + enemy.maxHp, 0);
        const hpLeft = selected.reduce((sum, enemy) =>
            sum + Math.max(0, Math.min(enemy.currHp, enemy.maxHp)), 0);
        const remaining = maxHp > 0 ? hpLeft / maxHp : 0;

        stats.progress = bosses.length > 0 ? { boss: remaining } : { enemies: remaining };
    };

    const observe = (state: GameState, event?: GameEvent): void => {
        if (!terminal) {
            stats.rounds = state.turn.round;
            terminal = state.turn.outcome !== "ongoing";
        }

        const defeated = new Set(event ? leaves(event).flatMap(leaf =>
            leaf.type === "enemyDefeated" ? [leaf.target] : []) : []);

        for (const character of state.characters) {
            const before = previous?.characters.find(candidate => candidate.id === character.id);

            if (incapacitated(character) && (!before || !incapacitated(before))) {
                stats.incapacitations += 1;
            }

            // Match the existing combat metric: release from a skunk capture by defeating its linked enemy.
            const link = before && skunkLink(before);
            if (link && !skunkLink(character) && defeated.has(link)) {
                stats.rescues += 1;
            }

            tracks.set(
                character.id,
                new Map(character.bindings.map(binding => [binding.id, binding.value])),
            );
        }

        peak();
        updateProgress(state);
        previous = state;
    };

    observe(initial);

    return {
        record(action: PlayerAction, result: ActionResult, finalState: GameState): void {
            if (!result.success || terminal) return;

            stats.actions += 1;

            const playerMoves = result.frames.filter(({ event }) =>
                event.type === "useMove" && playerIds.has(event.actor));

            const damagingMove = playerMoves.find(({ event }) =>
                leaves(event).some(leaf =>
                    leaf.type === "enemyDamaged" && leaf.amount > 0));

            const totalDamage = playerMoves
                .flatMap(({ event }) => leaves(event))
                .reduce((sum, leaf) =>
                    sum + (leaf.type === "enemyDamaged"
                        ? Math.max(0, leaf.amount)
                        : 0), 0);

            addSummary(
                stats.hits,
                totalDamage,
                damagingMove?.event.type === "useMove"
                    ? damagingMove.event.move
                    : undefined,
            );

            const escaped = action.type === "escape"
                ? result.frames
                    .filter(({ event }) => event.type === "useEscape")
                    .flatMap(({ event }) => leaves(event))
                    .reduce((sum, leaf) =>
                        sum + (isBindingChange(leaf)
                            ? Math.max(0, -leaf.amount)
                            : 0), 0)
                : 0;

            addSummary(stats.escapes, escaped);

            for (const frame of result.frames) {
                const event = frame.event;
                const effects = leaves(event);

                if (event.type === "useMove" && !playerIds.has(event.actor)) {
                    addSummary(
                        stats.bindings,
                        effects.reduce((sum, leaf) =>
                            sum + (
                                isBindingChange(leaf) && playerIds.has(leaf.target)
                                    ? Math.max(0, leaf.amount)
                                    : 0
                            ), 0),
                        event.move,
                    );
                }

                // Walk actual deltas to retain peaks that rise and fall inside one action frame.
                for (const leaf of effects) {
                    if (!isBindingChange(leaf) || !playerIds.has(leaf.target)) continue;

                    const zones = tracks.get(leaf.target) ?? new Map<string, number>();

                    zones.set(
                        leaf.binding,
                        leaf.type === "bondageRemoved"
                            ? 0
                            : Math.max(
                                0,
                                (zones.get(leaf.binding) ?? 0) + leaf.amount,
                            ),
                    );

                    tracks.set(leaf.target, zones);
                    peak();
                }

                observe(frame.state, event);
            }

            // Reconcile the public state without double-counting transitions from the last frame.
            if (result.frames.at(-1)?.state !== finalState) {
                observe(finalState);
            }
        },

        getStats(): BattleResultStats {
            return {
                ...stats,
                escapes: { ...stats.escapes },
                hits: { ...stats.hits },
                bindings: { ...stats.bindings },
                progress: { ...stats.progress },
            };
        },
    };
}

function addSummary(summary: ActionSummary, amount: number, move?: string): void {
    if (amount <= 0) return;
    summary.count += 1;
    summary.total += amount;
    if (amount > summary.max) {
        summary.max = amount;
        summary.maxMove = move;
    }
}

export function createBattleResultViewModel(
    state: GameState, stats: BattleResultStats, presentation: Presentation,
): BattleResultViewModel | undefined {
    const outcome = state.turn.outcome;
    if (outcome === "ongoing") return undefined;
    const number = (value: number): string => String(Math.round(value * 10) / 10);
    type StatId = "rounds" | "actions" | "escapes" | "peakBinding" | "hits" | "bindings" | "incapacitations" | "rescues";
    const row = (id: StatId, value: number) => ({ label: presentation.ui(`battleResult.${id}`), value: number(value) });
    const actionRow = (id: StatId, summary: ActionSummary, withMax: boolean) => ({
        ...row(id, summary.count),
        detail: summary.count > 0 ? presentation.ui(withMax ? "battleResult.actionDetail" : "battleResult.escapeDetail", {
            average: number(summary.total / summary.count), max: number(summary.max),
            move: summary.maxMove ? presentation.move(summary.maxMove) : "",
        }) : undefined,
    });
    const rows: BattleResultViewModel["rows"] = [actionRow("escapes", stats.escapes, false)];
    if (outcome === "victory") rows.push(row("peakBinding", stats.peakBinding));
    rows.push(actionRow("hits", stats.hits, true), actionRow("bindings", stats.bindings, true));
    if (outcome === "victory" && stats.incapacitations > 0) rows.push(row("incapacitations", stats.incapacitations));
    if (stats.rescues > 0) rows.push(row("rescues", stats.rescues));
    return {
        outcome, heading: presentation.battleState(outcome),
        encounter: state.encounter ? presentation.encounter(state.encounter.id) : presentation.ui("battleOverview.noEncounter"),
        difficulty: presentation.difficulty(state.difficulty.id),
        summary: presentation.ui("battleResult.summary", { rounds: stats.rounds, actions: stats.actions }),
        progress: outcome === "defeat" ? presentation.ui(
            stats.progress.boss !== undefined ? "battleResult.bossHp" : "battleResult.enemyHp",
            { percent: Math.round((stats.progress.boss ?? stats.progress.enemies ?? 0) * 100) },
        ) : undefined,
        gameLogLabel: presentation.ui("battleResult.gameLog"),
        rows, retryLabel: presentation.ui("battleResult.retry"), backLabel: presentation.ui("battleResult.back"),
    };
}
