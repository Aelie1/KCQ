import { batch, createContext, createSignal } from "solid-js";

export type BattleColumns = "auto" | "1" | "2" | "3";
export type EnemyCards = "auto" | "compact" | "expanded";
export const DEFAULT_MANUAL_ZOOM = 100;

export interface ViewPreferences {
    readonly columns: BattleColumns;
    readonly autoZoom: boolean;
    readonly manualZoom: number;
    readonly enemyCards: EnemyCards;
    setColumns: (value: BattleColumns) => void;
    setAutoZoom: (value: boolean) => void;
    setManualZoom: (value: number) => void;
    setEnemyCards: (value: EnemyCards) => void;
    reset: () => void;
}

export const ViewPreferencesContext = createContext<ViewPreferences>();

function read(key: string): string | null {
    try { return window.localStorage.getItem(`kcq.${key}`); } catch { return null; }
}

function preference<T>(key: string, fallback: T, parse: (value: string | null) => T | undefined,
    valid: (value: T) => boolean): [() => T, (value: T) => void] {
    const [value, setValue] = createSignal(parse(read(key)) ?? fallback);
    return [value, next => {
        if (!valid(next)) return;
        setValue(() => next);
        try { window.localStorage.setItem(`kcq.${key}`, String(next)); } catch { /* Keep the in-session preference. */ }
    }];
}

export function createViewPreferences(): ViewPreferences {
    const validColumns = (value: string | null): value is BattleColumns =>
        value !== null && ["auto", "1", "2", "3"].includes(value);
    const validCards = (value: string | null): value is EnemyCards =>
        value !== null && ["auto", "compact", "expanded"].includes(value);
    const validZoom = (value: number) => Number.isInteger(value) && value >= 75 && value <= 200 && value % 5 === 0;
    const [columns, setColumns] = preference<BattleColumns>("battleColumns", "auto", value => validColumns(value) ? value : undefined, validColumns);
    const [autoZoom, setAutoZoom] = preference("autoZoom", true, value => value === "true" ? true : value === "false" ? false : undefined,
        value => typeof value === "boolean");
    const [manualZoom, setManualZoom] = preference("manualZoom", DEFAULT_MANUAL_ZOOM,
        value => value !== null && value.trim() !== "" && validZoom(Number(value)) ? Number(value) : undefined, validZoom);
    const [enemyCards, setEnemyCards] = preference<EnemyCards>("enemyCards", "auto", value => validCards(value) ? value : undefined, validCards);
    return {
        get columns() { return columns(); },
        get autoZoom() { return autoZoom(); },
        get manualZoom() { return manualZoom(); },
        get enemyCards() { return enemyCards(); },
        setColumns, setAutoZoom, setManualZoom, setEnemyCards,
        reset: () => batch(() => {
            setColumns("auto"); setAutoZoom(true); setManualZoom(DEFAULT_MANUAL_ZOOM); setEnemyCards("auto");
        }),
    };
}
