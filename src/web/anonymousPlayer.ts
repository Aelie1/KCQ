export const ANONYMOUS_PLAYER_ID_KEY = "kcq_anonymous_player_id";

export interface AnonymousIdStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export function getOrCreateAnonymousPlayerId(
    storage: AnonymousIdStorage,
    randomUUID: () => string,
): string | undefined {
    try {
        const stored = storage.getItem(ANONYMOUS_PLAYER_ID_KEY);
        if (stored && isUuid(stored)) return stored;
    } catch {
        // Storage can be unavailable in restricted browser contexts.
    }

    let generated: string;
    try {
        generated = randomUUID();
    } catch {
        return undefined;
    }
    if (!isUuid(generated)) return undefined;

    try {
        storage.setItem(ANONYMOUS_PLAYER_ID_KEY, generated);
    } catch {
        // The in-memory ID still keeps this page's events correlated.
    }
    return generated;
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
        .test(value);
}
