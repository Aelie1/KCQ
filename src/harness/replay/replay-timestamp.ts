const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u;

/** Repair capture-clock ordering only; sequence remains the authority for action order. */
export function normalizeActionTimestamps<T extends { sequence: number; timestamp: string }>(
    actions: readonly T[],
    startedAt: string,
    endedAt: string | undefined,
    replayId: string,
): T[] {
    const prefix = `Replay ${replayId}`;
    const started = timestampMilliseconds(startedAt, `${prefix} battle_started`);
    const ended = endedAt === undefined
        ? undefined
        : timestampMilliseconds(endedAt, `${prefix} terminal event`);
    if (ended !== undefined && ended < started) {
        throw new Error(`${prefix}: terminal timestamp precedes battle start.`);
    }
    let previous = started;
    let previousTimestamp = startedAt;
    const normalized = new Map<T, T>();
    for (const action of [...actions].sort((left, right) => left.sequence - right.sequence)) {
        // Validate the original value before clamping, including out-of-bounds values.
        const current = timestampMilliseconds(action.timestamp,
            `${prefix} battle_action sequence ${action.sequence}`);
        const clamped = Math.max(previous, Math.min(current, ended ?? Infinity));
        const timestamp = clamped === current ? action.timestamp
            : clamped === previous ? previousTimestamp : endedAt!;
        normalized.set(action, timestamp === action.timestamp ? action : { ...action, timestamp });
        previous = clamped;
        previousTimestamp = timestamp;
    }
    // Preserve input row order and every field other than a repaired timestamp.
    return actions.map((action) => normalized.get(action)!);
}

/** Validate an ISO-8601 wall-clock timestamp and return its epoch milliseconds. */
export function timestampMilliseconds(value: string, description: string): number {
    const match = ISO_TIMESTAMP.exec(value);
    const milliseconds = Date.parse(value);
    if (!match || !Number.isFinite(milliseconds)) {
        throw new Error(`${description} has invalid timestamp ${JSON.stringify(value)}.`);
    }

    const [, yearText, monthText, dayText, hourText, minuteText, secondText,
        offsetHourText, offsetMinuteText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
    const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
    const daysInMonth = month >= 1 && month <= 12
        ? new Date(Date.UTC(year, month, 0)).getUTCDate()
        : 0;
    if (day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59
        || offsetHour > 23 || offsetMinute > 59) {
        throw new Error(`${description} has invalid timestamp ${JSON.stringify(value)}.`);
    }
    return milliseconds;
}
