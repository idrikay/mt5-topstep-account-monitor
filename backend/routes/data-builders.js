'use strict';

// ─── TopStepX builders ────────────────────────────────────────────────────────

function listTopstepAccounts(topstepAccounts) {
    return flatSubAccounts(topstepAccounts, (acc, sub) => ({
        id: `${acc.id}-${sub.id}`,
        platform: 'topstep',
        parentName: acc.name,
        name: sub.name,
        accountId: sub.id,
        balance: sub.balance,
        tradesCount: sub.trades.length,
        positionsCount: sub.positions.length,
        ordersCount: sub.orders.length,
    }));
}

function fullTopstepData(topstepAccounts) {
    return flatSubAccounts(topstepAccounts, (acc, sub) => ({
        id: `${acc.id}-${sub.id}`,
        platform: 'topstep',
        parentId: acc.id,
        parentName: acc.name,
        name: sub.name,
        accountId: sub.id,
        balance: sub.balance,
        trades: sub.trades,
        positions: sub.positions,
        orders: sub.orders,
    }));
}

function topstepPositionsSummary(topstepAccounts) {
    const rows = [];
    flatSubAccounts(topstepAccounts, (acc, sub) => {
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
            });
        });
    });
    return rows;
}

// ─── MT5 builders ─────────────────────────────────────────────────────────────

function listMT5Accounts(mt5Accounts) {
    return mt5Accounts
        .filter(acc => acc.isConnected)
        .map(acc => ({
            id: acc.id,
            platform: 'mt5',
            parentName: acc.name,
            name: acc.accountInfo?.name || acc.name,
            accountId: acc.accountId,
            balance: acc.accountInfo?.balance ?? 0,
            equity: acc.accountInfo?.equity ?? 0,
            profit: acc.accountInfo?.profit ?? 0,
            tradesCount: acc.deals.length,
            positionsCount: acc.positions.length,
            ordersCount: acc.orders.length,
        }));
}

function fullMT5Data(mt5Accounts) {
    return mt5Accounts
        .filter(acc => acc.isConnected)
        .map(acc => ({
            id: acc.id,
            platform: 'mt5',
            parentId: acc.id,
            parentName: acc.name,
            name: acc.accountInfo?.name || acc.name,
            accountId: acc.accountId,
            balance: acc.accountInfo?.balance ?? 0,
            equity: acc.accountInfo?.equity ?? 0,
            profit: acc.accountInfo?.profit ?? 0,
            currency: acc.accountInfo?.currency,
            trades: acc.deals,
            positions: acc.positions,
            orders: acc.orders,
        }));
}

function mt5PositionsSummary(mt5Accounts) {
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

// ─── Aggregated summary ───────────────────────────────────────────────────────

function buildSummary(topstepAccounts, mt5Accounts) {
    const summary = {
        totalAccounts: 0,
        totalBalance: 0,
        totalEquity: 0,
        totalProfit: 0,
        totalPositions: 0,
        totalTrades: 0,
        byPlatform: {
            topstep: { accounts: 0, balance: 0, positions: 0, trades: 0 },
            mt5:     { accounts: 0, balance: 0, equity: 0, profit: 0, positions: 0, trades: 0 },
        },
        accounts: [],
    };

    flatSubAccounts(topstepAccounts, (acc, sub) => {
        summary.totalAccounts++;
        summary.totalBalance    += sub.balance || 0;
        summary.totalEquity     += sub.balance || 0;
        summary.totalPositions  += (sub.positions || []).length;
        summary.totalTrades     += (sub.trades || []).length;

        const p = summary.byPlatform.topstep;
        p.accounts++;
        p.balance   += sub.balance || 0;
        p.positions += (sub.positions || []).length;
        p.trades    += (sub.trades || []).length;

        summary.accounts.push({
            platform: 'topstep',
            platformName: acc.name,
            accountName: sub.name,
            accountId: sub.id,
            balance: sub.balance || 0,
            positionsCount: (sub.positions || []).length,
            tradesCount: (sub.trades || []).length,
            ordersCount: (sub.orders || []).length,
        });
    });

    mt5Accounts.filter(acc => acc.isConnected && acc.accountInfo).forEach(acc => {
        summary.totalAccounts++;
        summary.totalBalance    += acc.accountInfo.balance || 0;
        summary.totalEquity     += acc.accountInfo.equity  || 0;
        summary.totalProfit     += acc.accountInfo.profit  || 0;
        summary.totalPositions  += (acc.positions || []).length;
        summary.totalTrades     += (acc.deals || []).length;

        const p = summary.byPlatform.mt5;
        p.accounts++;
        p.balance   += acc.accountInfo.balance || 0;
        p.equity    += acc.accountInfo.equity  || 0;
        p.profit    += acc.accountInfo.profit  || 0;
        p.positions += (acc.positions || []).length;
        p.trades    += (acc.deals || []).length;

        summary.accounts.push({
            platform: 'mt5',
            platformName: acc.name,
            accountName: acc.accountInfo.name || acc.name,
            accountId: acc.accountId,
            balance: acc.accountInfo.balance || 0,
            equity: acc.accountInfo.equity   || 0,
            profit: acc.accountInfo.profit   || 0,
            currency: acc.accountInfo.currency,
            leverage: acc.accountInfo.leverage,
            positionsCount: (acc.positions || []).length,
            tradesCount: (acc.deals || []).length,
            ordersCount: (acc.orders || []).length,
        });
    });

    return summary;
}

// ─── Shared utilities ─────────────────────────────────────────────────────────

/**
 * Iterates over every sub-account in every TopStepX parent account.
 * When `fn` returns a value it is collected; otherwise used for side-effects.
 */
function flatSubAccounts(topstepAccounts, fn) {
    const results = [];
    topstepAccounts.forEach(acc => {
        Object.values(acc.subAccounts).forEach(sub => {
            const r = fn(acc, sub);
            if (r !== undefined) results.push(r);
        });
    });
    return results;
}

module.exports = {
    listTopstepAccounts,
    listMT5Accounts,
    fullTopstepData,
    fullMT5Data,
    topstepPositionsSummary,
    mt5PositionsSummary,
    buildSummary,
    flatSubAccounts,
};