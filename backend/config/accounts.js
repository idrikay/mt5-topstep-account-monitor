'use strict';

const logger = require('../utils/logger');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the value of TOPSTEP_{index}_{key} with ACCOUNT_{index}_{key} as
 * a legacy fallback.
 */
const getTopstepEnv = (index, key) =>
    process.env[`TOPSTEP_${index}_${key}`] || process.env[`ACCOUNT_${index}_${key}`];

const defaultApiUrl = () =>
    process.env.DEFAULT_TOPSTEP_API_URL || process.env.DEFAULT_API_URL || 'https://api.topstepx.com';

const defaultRtcUrl = () =>
    process.env.DEFAULT_TOPSTEP_RTC_URL || process.env.DEFAULT_RTC_URL || 'https://rtc.topstepx.com';

// ─── TopStepX accounts ───────────────────────────────────────────────────────

const topstepAccounts = [];

for (let i = 1; getTopstepEnv(i, 'NAME'); i++) {
    const allowedSubAccountNames = [];

    for (let s = 1; ; s++) {
        const subName =
            (process.env[`TOPSTEP_${i}_SUB_${s}`] || process.env[`ACCOUNT_${i}_SUB_${s}`] || '').trim();
        if (!subName) break;
        allowedSubAccountNames.push(subName);
    }

    topstepAccounts.push({
        id: `topstep-${i}`,
        platform: 'topstep',
        name: getTopstepEnv(i, 'NAME').trim(),
        username: getTopstepEnv(i, 'USERNAME').trim(),
        apiKey: getTopstepEnv(i, 'API_KEY').trim(),
        apiUrl: getTopstepEnv(i, 'API_URL') || defaultApiUrl(),
        rtcUrl: getTopstepEnv(i, 'RTC_URL') || defaultRtcUrl(),
        allowedSubAccountNames,
        // Runtime state (mutated by services)
        jwt: null,
        connection: null,
        subAccounts: {},
        subscribedAccounts: new Set(),
    });
}

// ─── MT5 accounts ────────────────────────────────────────────────────────────

const mt5Accounts = [];

for (let i = 1; process.env[`MT5_${i}_ACCOUNT_ID`]; i++) {
    mt5Accounts.push({
        id: `mt5-${i}`,
        platform: 'mt5',
        name: (process.env[`MT5_${i}_NAME`] || `MT5 Account ${i}`).trim(),
        accountId: process.env[`MT5_${i}_ACCOUNT_ID`].trim(),
        // Runtime state (mutated by services)
        connection: null,
        streamConnection: null,
        metaAccount: null,
        accountInfo: null,
        positions: [],
        orders: [],
        deals: [],
        isConnected: false,
        lastUpdate: null,
    });
}

const metaApiToken = process.env.METAAPI_TOKEN?.trim() || null;

// ─── Startup summary ─────────────────────────────────────────────────────────

logger.info({
    topstepAccounts: topstepAccounts.length,
    mt5Accounts:     mt5Accounts.length,
    metaApiToken:    metaApiToken ? `set (${metaApiToken.substring(0, 10)}…)` : 'not set',
    topstep: topstepAccounts.map(acc => ({
        name:            acc.name,
        user:            acc.username,
        subAccountFilter: acc.allowedSubAccountNames,
    })),
    mt5: mt5Accounts.map(acc => ({ name: acc.name, accountId: acc.accountId })),
}, 'Account configuration loaded');

if (mt5Accounts.length === 0) {
    logger.warn('No MT5 accounts configured — set METAAPI_TOKEN, MT5_1_NAME, MT5_1_ACCOUNT_ID in .env');
}

module.exports = { topstepAccounts, mt5Accounts, metaApiToken };