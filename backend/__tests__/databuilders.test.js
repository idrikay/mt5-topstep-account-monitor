'use strict';

const { startOfUtcDay, isToday } = require('../utils/date');

describe('startOfUtcDay', () => {
    it('returns a Date set to midnight UTC', () => {
        const result = startOfUtcDay();
        expect(result.getUTCHours()).toBe(0);
        expect(result.getUTCMinutes()).toBe(0);
        expect(result.getUTCSeconds()).toBe(0);
        expect(result.getUTCMilliseconds()).toBe(0);
    });

    it('returns today\'s date', () => {
        const result   = startOfUtcDay();
        const now      = new Date();
        expect(result.getUTCFullYear()).toBe(now.getUTCFullYear());
        expect(result.getUTCMonth()).toBe(now.getUTCMonth());
        expect(result.getUTCDate()).toBe(now.getUTCDate());
    });
});

describe('isToday', () => {
    it('returns true for the current timestamp', () => {
        expect(isToday(new Date().toISOString())).toBe(true);
    });

    it('returns false for a timestamp from yesterday', () => {
        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        expect(isToday(yesterday.toISOString())).toBe(false);
    });

    it('returns false for a timestamp from tomorrow', () => {
        const tomorrow = new Date();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        expect(isToday(tomorrow.toISOString())).toBe(false);
    });

    it('returns false for null or undefined', () => {
        expect(isToday(null)).toBe(false);
        expect(isToday(undefined)).toBe(false);
    });
});