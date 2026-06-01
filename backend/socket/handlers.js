'use strict';

const logger = require('../utils/logger');

/**
 * Registers Socket.IO connection/event handlers.
 */
function registerSocketHandlers(io, topstepAccounts, mt5Accounts, broadcast, refreshMT5Data) {
    io.on('connection', socket => {
        logger.info({ socketId: socket.id }, 'Frontend client connected');

        const snapshot = buildSnapshot(topstepAccounts, mt5Accounts);
        logger.info({ accounts: snapshot.length }, 'Sending initial snapshot to client');
        socket.emit('initialData', snapshot);
        broadcast.broadcastPositionsSummary();

        socket.on('refreshMT5', async () => {
            logger.info({ socketId: socket.id }, 'Manual MT5 refresh requested');
            await refreshMT5Data(mt5Accounts, broadcast);
        });

        socket.on('disconnect', () => {
            logger.info({ socketId: socket.id }, 'Frontend client disconnected');
        });
    });
}

// ─── Private ──────────────────────────────────────────────────────────────────

function buildSnapshot(topstepAccounts, mt5Accounts) {
    const rows = [];

    topstepAccounts.forEach(acc => {
        Object.keys(acc.subAccounts).forEach(subId => {
            const sub = acc.subAccounts[subId];
            rows.push({
                id: `${acc.id}-${subId}`,
                platform:   'topstep',
                parentId:   acc.id,
                parentName: acc.name,
                name:       sub.name || `${acc.name} - Account ${subId}`,
                accountId:  sub.id,
                balance:    sub.balance    || 0,
                trades:     sub.trades     || [],
                positions:  sub.positions  || [],
                orders:     sub.orders     || [],
            });
        });
    });

    mt5Accounts
        .filter(acc => acc.isConnected && acc.accountInfo)
        .forEach(acc => {
            rows.push({
                id:         acc.id,
                platform:   'mt5',
                parentId:   acc.id,
                parentName: acc.name,
                name:       acc.accountInfo.name || acc.name,
                accountId:  acc.accountId,
                balance:    acc.accountInfo.balance || 0,
                equity:     acc.accountInfo.equity  || 0,
                profit:     acc.accountInfo.profit  || 0,
                currency:   acc.accountInfo.currency,
                trades:     acc.deals     || [],
                positions:  acc.positions || [],
                orders:     acc.orders    || [],
            });
        });

    return rows;
}

module.exports = { registerSocketHandlers };