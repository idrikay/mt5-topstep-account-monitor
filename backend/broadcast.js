'use strict';

/**
 * Creates broadcaster functions bound to the given Socket.IO instance and
 * account arrays.  Returned functions may be called freely from any service
 * without importing `io` or the account arrays directly, keeping the rest of
 * the codebase free of circular dependencies.
 *
 * @param {import('socket.io').Server} io
 * @param {object[]} topstepAccounts
 * @param {object[]} mt5Accounts
 */
function createBroadcaster(io, topstepAccounts, mt5Accounts) {

    // ── Full account list ─────────────────────────────────────────────────────

    function broadcastAllData() {
        const payload = [
            ...buildTopstepPayload(topstepAccounts),
            ...buildMT5Payload(mt5Accounts),
        ];

        if (payload.length > 0) {
            io.emit('accountListUpdate', payload);
        }

        broadcastPositionsSummary();
    }

    // ── Positions summary ─────────────────────────────────────────────────────

    function broadcastPositionsSummary() {
        const positions = [
            ...collectTopstepPositions(topstepAccounts),
            ...collectMT5Positions(mt5Accounts),
        ];

        io.emit('positionsSummary', positions);
    }

    return { broadcastAllData, broadcastPositionsSummary };
}

// ─── Private builders ─────────────────────────────────────────────────────────

function buildTopstepPayload(topstepAccounts) {
    const rows = [];

    topstepAccounts.forEach(acc => {
        Object.keys(acc.subAccounts).forEach(subId => {
            const sub = acc.subAccounts[subId];
            rows.push({
                id: `${acc.id}-${subId}`,
                platform: 'topstep',
                parentId: acc.id,
                parentName: acc.name,
                name: sub.name || `${acc.name} - Account ${subId}`,
                accountId: sub.id,
                balance: sub.balance || 0,
                equity: sub.balance || 0,   // TopStepX does not expose a separate equity field
                profit: 0,
                trades: sub.trades || [],
                positions: sub.positions || [],
                orders: sub.orders || [],
            });
        });
    });

    return rows;
}

function buildMT5Payload(mt5Accounts) {
    return mt5Accounts
        .filter(acc => acc.isConnected && acc.accountInfo)
        .map(acc => ({
            id: acc.id,
            platform: 'mt5',
            parentId: acc.id,
            parentName: acc.name,
            name: acc.accountInfo.name || acc.name,
            accountId: acc.accountId,
            balance: acc.accountInfo.balance || 0,
            equity: acc.accountInfo.equity || 0,
            profit: acc.accountInfo.profit || 0,
            margin: acc.accountInfo.margin || 0,
            freeMargin: acc.accountInfo.freeMargin || 0,
            marginLevel: acc.accountInfo.marginLevel,
            currency: acc.accountInfo.currency,
            leverage: acc.accountInfo.leverage,
            trades: acc.deals || [],
            positions: acc.positions || [],
            orders: acc.orders || [],
            lastUpdate: acc.lastUpdate,
        }));
}

function collectTopstepPositions(topstepAccounts) {
    const rows = [];

    topstepAccounts.forEach(acc => {
        Object.keys(acc.subAccounts).forEach(subId => {
            const sub = acc.subAccounts[subId];

            (sub.positions || []).forEach(pos => {
                rows.push({
                    positionId: pos.id,
                    platform: 'topstep',
                    platformName: acc.name,
                    accountName: sub.name,
                    accountId: sub.id,
                    symbol: pos.contractId,
                    type: pos.type === 1 ? 'Long' : 'Short',
                    size: pos.size,
                    entryPrice: pos.averagePrice,
                    openedAt: pos.creationTimestamp,
                    unrealizedPnL: null,
                });
            });
        });
    });

    return rows;
}

function collectMT5Positions(mt5Accounts) {
    const rows = [];

    mt5Accounts.forEach(acc => {
        (acc.positions || []).forEach(pos => {
            rows.push({
                positionId: pos.id,
                platform: 'mt5',
                platformName: acc.name,
                accountName: acc.accountInfo?.name || acc.name,
                accountId: acc.accountId,
                symbol: pos.symbol,
                type: pos.type === 'POSITION_TYPE_BUY' ? 'Long' : 'Short',
                size: pos.volume,
                entryPrice: pos.openPrice,
                currentPrice: pos.currentPrice,
                openedAt: pos.openTime,
                unrealizedPnL: pos.profit,
                swap: pos.swap,
                commission: pos.commission,
                stopLoss: pos.stopLoss,
                takeProfit: pos.takeProfit,
            });
        });
    });

    return rows;
}

module.exports = { createBroadcaster };