const OVERFLOW_SHORTCUTS = "qwertyuiopasdfghjklzxcvbnm";

export function numberedShortcut(number: number, lastDigit = 9): string {
    if (number >= 1 && number <= lastDigit) return String(number);
    return OVERFLOW_SHORTCUTS[number - lastDigit - 1] ?? String(number);
}
