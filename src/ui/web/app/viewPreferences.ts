import { batch, createContext, createSignal } from "solid-js";

export type BattleColumns = "auto" | "1" | "2" | "3";
export type EnemyCards = "auto" | "compact" | "expanded";
export type BindingDescriptions = "auto" | "on" | "off";

export interface ViewPreferences {
    readonly columns: BattleColumns;
    readonly enemyCards: EnemyCards;
    readonly bindingDescriptions: BindingDescriptions;
    setColumns: (value: BattleColumns) => void;
    setEnemyCards: (value: EnemyCards) => void;
    setBindingDescriptions: (value: BindingDescriptions) => void;
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
    const validDescriptions = (value: string | null): value is BindingDescriptions =>
        value !== null && ["auto", "on", "off"].includes(value);
    const [columns, setColumns] = preference<BattleColumns>("battleColumns", "auto", value => validColumns(value) ? value : undefined, validColumns);
    const [enemyCards, setEnemyCards] = preference<EnemyCards>("enemyCards", "auto", value => validCards(value) ? value : undefined, validCards);
    const [bindingDescriptions, setBindingDescriptions] = preference<BindingDescriptions>("bindingDescriptions", "auto", value => validDescriptions(value) ? value : undefined, validDescriptions);
    return {
        get columns() { return columns(); },
        get enemyCards() { return enemyCards(); },
        get bindingDescriptions() { return bindingDescriptions(); },
        setColumns, setEnemyCards, setBindingDescriptions,
        reset: () => batch(() => {
            setColumns("auto"); setEnemyCards("auto");
            setBindingDescriptions("auto");
        }),
    };
}
