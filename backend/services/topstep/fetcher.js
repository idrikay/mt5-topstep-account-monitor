'use strict';

const axios  = require('axios');
const logger = require('../../utils/logger');
const { isToday } = require('../../utils/date');

// ─── Filtering helpers ────────────────────────────────────────────────────────

function isSubAccountAllowed(account, accountData) {
    if (account.allowedSubAccountNames.length === 0) return true;
    const name = (accountData.name || '').toLowerCase();
    return account.allowedSubAccountNames.some(n => name.includes(n.toLowerCase()));
}

// ─── REST helpers ─────────────────────────────────────────────────────────────

function authHeaders(jwt) {
    return {
        Authorization: `Bearer ${jwt}`,
        accept: 'application/json',
        'Content-Type': 'application/json',
    };
}

async function tryEndpoints(apiUrl, endpoints, body, jwt) {
    for (const endpoint of endpoints) {
        try {
            const { data } = await axios.post(`${apiUrl}${endpoint}`, body, {
                headers: authHeaders(jwt),
                timeout: 5_000,
            });
            return data;
        } catch {
            // try next endpoint
        }
    }
    return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function searchAccounts(account) {
    const log = logger.child({ account: account.name });
    log.info('Searching for sub-accounts…');

    try {
        const { data } = await axios.post(
            `${account.apiUrl}/api/Account/search`,
            { onlyActiveAccounts: false },
            { headers: authHeaders(account.jwt) }
        );

        if (!data.success || !data.accounts) return [];

        const filtered = data.accounts.filter(a => isSubAccountAllowed(account, a));
        log.info({ total: data.accounts.length, monitoring: filtered.length }, 'Sub-accounts found');

        filtered.forEach(a => {
            account.subAccounts[a.id] = {
                id: a.id,
                name: a.name || `Account ${a.id}`,
                balance: a.balance || 0,
                canTrade: a.canTrade,
                isVisible: a.isVisible,
                simulated: a.simulated,
                trades: [],
                positions: [],
                orders: [],
                rawData: a,
            };
            log.info({ subAccount: a.name, balance: a.balance }, 'Sub-account registered');
        });

        return filtered;
    } catch (err) {
        log.error({ err }, 'Error searching sub-accounts');
        return [];
    }
}

async function searchOpenPositions(account, subAccountId) {
    try {
        const { data } = await axios.post(
            `${account.apiUrl}/api/Position/searchOpen`,
            { accountId: subAccountId },
            { headers: authHeaders(account.jwt) }
        );
        const positions = data?.success ? (data.positions || []) : [];
        account.subAccounts[subAccountId].positions = positions;
        return positions;
    } catch {
        return [];
    }
}

async function searchTrades(account, subAccountId) {
    const ENDPOINTS = ['/api/Trade/search', '/api/Trade/searchRecent', '/api/Trades/search'];
    try {
        const data   = await tryEndpoints(account.apiUrl, ENDPOINTS, { accountId: subAccountId, limit: 100 }, account.jwt);
        const trades = data?.success ? (data.trades || []).filter(t => isToday(t.creationTimestamp)) : [];
        account.subAccounts[subAccountId].trades = trades;
        return trades;
    } catch {
        return [];
    }
}

async function searchOrders(account, subAccountId) {
    const ENDPOINTS = ['/api/Order/searchOpen', '/api/Order/search', '/api/Orders/search'];
    try {
        const data   = await tryEndpoints(account.apiUrl, ENDPOINTS, { accountId: subAccountId }, account.jwt);
        const orders = data?.success ? (data.orders || []) : [];
        account.subAccounts[subAccountId].orders = orders;
        return orders;
    } catch {
        return [];
    }
}

async function subscribeToSubAccount(account, subAccountId) {
    if (!account.connection || account.subscribedAccounts.has(subAccountId)) return;

    const log = logger.child({ account: account.name, subAccountId });
    try {
        await account.connection.invoke('SubscribeOrders',    subAccountId);
        await account.connection.invoke('SubscribePositions', subAccountId);
        await account.connection.invoke('SubscribeTrades',    subAccountId);
        account.subscribedAccounts.add(subAccountId);
        log.info('Subscribed to sub-account');
    } catch (err) {
        log.error({ err }, 'Subscription error');
    }
}

async function fetchInitialData(account, broadcast) {
    if (!account.jwt) return;

    const log = logger.child({ account: account.name });
    log.info('Fetching initial data…');

    const found = await searchAccounts(account);
    if (found.length === 0) {
        log.warn('No matching sub-accounts found');
        return;
    }

    for (const subId of Object.keys(account.subAccounts)) {
        const id = parseInt(subId, 10);
        await searchOpenPositions(account, id);
        await searchTrades(account, id);
        await searchOrders(account, id);
        await subscribeToSubAccount(account, id);
    }

    log.info('Initial data fetch complete');
    broadcast.broadcastAllData();
}

module.exports = {
    isSubAccountAllowed,
    searchAccounts,
    searchOpenPositions,
    searchTrades,
    searchOrders,
    subscribeToSubAccount,
    fetchInitialData,
};