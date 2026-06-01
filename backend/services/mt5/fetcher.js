'use strict';

const logger = require('../../utils/logger');
const { mapPosition, mapOrder, mapDeal } = require('./mappers');

/**
 * Reads the initial account snapshot from the streaming connection's
 * terminalState after synchronization.
 *
 * MetaAPI SDK v27 removed RPC methods (getAccountInformation, getPositions,
 * etc.) from streaming connections.  All synchronized data is available via
 * connection.terminalState once waitSynchronized() has resolved.
 */
function fetchMT5AccountData(mt5Account, broadcast) {
    if (!mt5Account.connection || !mt5Account.isConnected) return;

    const log = logger.child({ account: mt5Account.name });
    log.info('Reading account snapshot from terminalState…');

    try {
        const ts = mt5Account.connection.terminalState;

        if (!ts) {
            log.warn('terminalState not available yet');
            return;
        }

        readAccountInfo(mt5Account, ts, log);
        readPositions(mt5Account, ts, log);
        readOrders(mt5Account, ts, log);

        mt5Account.lastUpdate = new Date();
        log.info('Snapshot read complete');
        broadcast.broadcastAllData();
    } catch (err) {
        log.error({ err }, 'Error reading snapshot');
    }
}

/**
 * Re-reads terminalState for all connected MT5 accounts.
 * Called on a 30 s timer as a fallback for missed streaming events.
 */
function refreshMT5Data(mt5Accounts, broadcast) {
    for (const acc of mt5Accounts) {
        if (acc.isConnected) {
            fetchMT5AccountData(acc, broadcast);
        }
    }
}

// ─── Private ──────────────────────────────────────────────────────────────────

function readAccountInfo(mt5Account, ts, log) {
    const raw = ts.accountInformation;
    if (!raw) return;

    mt5Account.accountInfo = {
        balance:     raw.balance     || 0,
        equity:      raw.equity      || 0,
        margin:      raw.margin      || 0,
        freeMargin:  raw.freeMargin  || 0,
        profit:      raw.profit      || 0,
        marginLevel: raw.marginLevel,
        currency:    raw.currency    || 'USD',
        leverage:    raw.leverage,
        platform:    raw.platform,
        server:      raw.server,
        name:        raw.name,
        login:       raw.login,
    };

    const { currency: c, balance, equity, profit } = mt5Account.accountInfo;
    log.info({ balance, equity, profit, currency: c }, 'Account info loaded');
}

function readPositions(mt5Account, ts, log) {
    mt5Account.positions = (ts.positions || []).map(mapPosition);
    log.info({ count: mt5Account.positions.length }, 'Positions loaded');
}

function readOrders(mt5Account, ts, log) {
    mt5Account.orders = (ts.orders || []).map(mapOrder);
    log.info({ count: mt5Account.orders.length }, 'Orders loaded');
}

module.exports = { fetchMT5AccountData, refreshMT5Data };