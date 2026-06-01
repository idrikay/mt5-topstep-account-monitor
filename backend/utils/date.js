'use strict';

/** Returns a Date set to midnight UTC for today. */
function startOfUtcDay() {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

/**
 * Returns true when the given timestamp falls within today's UTC date.
 * Checks both lower bound (>= today midnight) and upper bound (< tomorrow midnight)
 * so that future timestamps are correctly excluded.
 */
function isToday(timestamp) {
    if (!timestamp) return false;

    const date     = new Date(timestamp);
    const todayStart    = startOfUtcDay();
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

    return date >= todayStart && date < tomorrowStart;
}

module.exports = { startOfUtcDay, isToday };