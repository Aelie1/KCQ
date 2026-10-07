/** Public trap amounts are bounded to 0–100. Shared by presentation meters. */
export const TRAP_METER_MAX = 100;

export function clampMeterValue(value: number, max: number): number {
    return Math.min(Math.max(0, max), Math.max(0, value));
}
