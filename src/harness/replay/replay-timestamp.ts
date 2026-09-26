const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u;

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
