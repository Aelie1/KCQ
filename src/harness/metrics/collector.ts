import type {
    ActionResult,
    GameState,
    PlayerAction,
} from "../../engine/public/types";
import type { SingleFightTermination } from "../harness";

/** The loaded encounter state, before the policy submits its first action. */
export interface MetricFightStart {
    readonly view: GameState;
}

/** One policy submission and the public result returned by the engine. */
export interface MetricActionObservation {
    /** One-based position in the submitted action trace. */
    readonly actionIndex: number;
    readonly action: PlayerAction;
    readonly before: GameState;
    readonly result: ActionResult;
}

/** The terminal harness state, including timeout and runner-error terminations. */
export interface MetricFightEnd {
    readonly termination: SingleFightTermination;
    readonly view: GameState;
    readonly actionCount: number;
}

/**
 * A stateful, single-fight metric collector.
 *
 * Collectors observe only the public engine boundary. They must not mutate the
 * supplied actions, views, events, or results. A fresh instance is created for
 * every fight so collectors never need to coordinate or share a statistics bag.
 */
export interface MetricCollector<Result = unknown> {
    readonly id: string;
    onFightStart?(context: MetricFightStart): void;
    onAction?(context: MetricActionObservation): void;
    onFightEnd?(context: MetricFightEnd): void;
    getResult(): Result;
}

export type MetricCollectorFactory<Result = unknown> = () => MetricCollector<Result>;

export type MetricCollectorResults = Record<string, unknown>;

/** Owns and dispatches one independent collector instance per configured factory. */
export class MetricCollectorSet {
    private readonly collectors: MetricCollector[];

    constructor(factories: readonly MetricCollectorFactory[]) {
        this.collectors = factories.map((factory) => factory());
        const ids = new Set<string>();
        for (const collector of this.collectors) {
            if (collector.id.length === 0) {
                throw new Error("Metric collector IDs must not be empty");
            }
            if (ids.has(collector.id)) {
                throw new Error(`Duplicate metric collector ID: ${collector.id}`);
            }
            ids.add(collector.id);
        }
    }

    onFightStart(context: MetricFightStart): void {
        for (const collector of this.collectors) collector.onFightStart?.(context);
    }

    onAction(context: MetricActionObservation): void {
        for (const collector of this.collectors) collector.onAction?.(context);
    }

    onFightEnd(context: MetricFightEnd): void {
        for (const collector of this.collectors) collector.onFightEnd?.(context);
    }

    getResults(): MetricCollectorResults {
        return Object.fromEntries(
            this.collectors.map((collector) => [collector.id, collector.getResult()]),
        );
    }
}
