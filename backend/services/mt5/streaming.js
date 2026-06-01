'use strict';

const logger = require('../../utils/logger');
const { startOfUtcDay } = require('../../utils/date');
const { mapPosition, mapOrder, mapDeal } = require('./mappers');

const MAX_DEALS_CACHED = 100;

/**
 * Creates a MetaApi streaming connection for `mt5Account`, registers
 * synchronization listeners and waits for initial synchronization.
 *
 * Sets mt5Account.connection so that fetcher.js can read terminalState.
 */
async function setupMT5Streaming(mt5Account, { io, broadcast }) {
    if (!mt5Account.metaAccount) return;

    const log = logger.child({ account: mt5Account.name });
    log.info('Setting up streaming connection…');

    try {
        const streamConnection = mt5Account.metaAccount.getStreamingConnection();

        // Register listeners before connecting so no events are missed during
        // the synchronization window.
        streamConnection.addSynchronizationListener(buildListener(mt5Account, io, broadcast));

        await streamConnection.connect();
        await streamConnection.waitSynchronized();

        mt5Account.connection       = streamConnection;
        mt5Account.streamConnection = streamConnection;
        log.info('Streaming connection established');
    } catch (err) {
        log.error({ err }, 'Streaming setup error');
    }
}

// ─── Listener factory ─────────────────────────────────────────────────────────

function buildListener(acc, io, broadcast) {
    // Child logger binds the account name to every line emitted from this listener.
    const log  = logger.child({ account: acc.name });
    const name = acc.name;

    return {
        // ── Lifecycle ─────────────────────────────────────────────────────────

        onConnected:    () => log.info('Streaming connected'),
        onDisconnected: () => log.info('Streaming disconnected'),
        onStreamClosed: () => log.info('Stream closed'),
        onSynchronizationStarted: () => log.info('Synchronization started'),

        onBrokerConnectionStatusChanged: (_, connected) =>
            log.info({ connected }, 'Broker connection status changed'),

        onHealthStatus: (_, status) => {
            if (status?.status && status.status !== 'ok') {
                log.warn({ status }, 'Health status degraded');
            }
        },

        // ── Account info ──────────────────────────────────────────────────────

        onAccountInformationUpdated: (_, info) => {
            if (!info || info.balance === undefined) return;
            log.info({ equity: info.equity, profit: info.profit }, 'Account info updated');

            acc.accountInfo = {
                ...(acc.accountInfo ?? {}),
                balance:     info.balance,
                equity:      info.equity,
                margin:      info.margin,
                freeMargin:  info.freeMargin,
                profit:      info.profit || 0,
                marginLevel: info.marginLevel,
            };
            acc.lastUpdate = new Date();

            io.emit('mt5AccountUpdate', { accountId: acc.id, accountName: name, data: acc.accountInfo });
            broadcast.broadcastAllData();
        },

        // ── Positions ─────────────────────────────────────────────────────────

        onPositionsReplaced: (_, positions) => {
            if (!Array.isArray(positions)) return;
            log.info({ count: positions.length }, 'Positions replaced');
            acc.positions  = positions.map(mapPosition);
            acc.lastUpdate = new Date();
            broadcast.broadcastAllData();
        },

        onPositionUpdated: (_, position) => {
            if (!position?.id) return;
            log.debug({ symbol: position.symbol, type: position.type }, 'Position updated');
            const data = mapPosition(position);
            upsertById(acc.positions, data);
            acc.lastUpdate = new Date();
            io.emit('mt5PositionUpdate', { accountId: acc.id, accountName: name, data });
            broadcast.broadcastAllData();
        },

        onPositionRemoved: (_, positionId) => {
            if (!positionId) return;
            log.debug({ positionId }, 'Position closed');
            acc.positions  = acc.positions.filter(p => p.id !== positionId);
            acc.lastUpdate = new Date();
            io.emit('mt5PositionClosed', { accountId: acc.id, accountName: name, positionId });
            broadcast.broadcastAllData();
        },

        // Batch update — upserts changed positions and removes closed ones.
        // Distinct from onPositionsReplaced (full replacement) and
        // onPositionUpdated (single position).
        onPositionsUpdated: (_, positions, removedPositionIds) => {
            let changed = false;

            if (Array.isArray(positions) && positions.length > 0) {
                positions.forEach(pos => upsertById(acc.positions, mapPosition(pos)));
                changed = true;
            }

            if (Array.isArray(removedPositionIds) && removedPositionIds.length > 0) {
                acc.positions = acc.positions.filter(p => !removedPositionIds.includes(p.id));
                removedPositionIds.forEach(id =>
                    io.emit('mt5PositionClosed', { accountId: acc.id, accountName: name, positionId: id })
                );
                changed = true;
            }

            if (changed) {
                acc.lastUpdate = new Date();
                broadcast.broadcastAllData();
            }
        },

        onPositionsSynchronized:  () => log.info('Positions synchronized'),

        // ── Orders ────────────────────────────────────────────────────────────

        onPendingOrdersReplaced: (_, orders) => {
            if (!Array.isArray(orders)) return;
            log.info({ count: orders.length }, 'Orders replaced');
            acc.orders     = orders.map(mapOrder);
            acc.lastUpdate = new Date();
            broadcast.broadcastAllData();
        },

        onOrderUpdated: (_, order) => {
            if (!order?.id) return;
            log.debug({ symbol: order.symbol, type: order.type }, 'Order updated');
            const data = mapOrder(order);
            upsertById(acc.orders, data);
            acc.lastUpdate = new Date();
            io.emit('mt5OrderUpdate', { accountId: acc.id, accountName: name, data });
            broadcast.broadcastAllData();
        },

        onOrderCompleted: (_, orderId) => {
            if (!orderId) return;
            log.debug({ orderId }, 'Order completed');
            acc.orders     = acc.orders.filter(o => o.id !== orderId);
            acc.lastUpdate = new Date();
            io.emit('mt5OrderCompleted', { accountId: acc.id, accountName: name, orderId });
            broadcast.broadcastAllData();
        },

        onPendingOrdersSynchronized: () => log.info('Orders synchronized'),

        // ── Deals ─────────────────────────────────────────────────────────────

        onDealAdded: (_, deal) => {
            if (!deal?.id) return;
            const today = startOfUtcDay();
            if (new Date(deal.time) < today) return;

            log.debug({ symbol: deal.symbol, profit: deal.profit }, 'New deal');
            const data = mapDeal(deal);

            if (!acc.deals.some(d => d.id === deal.id)) {
                acc.deals.unshift(data);
                if (acc.deals.length > MAX_DEALS_CACHED) {
                    acc.deals = acc.deals.slice(0, MAX_DEALS_CACHED);
                }
            }
            acc.lastUpdate = new Date();
            io.emit('mt5DealUpdate', { accountId: acc.id, accountName: name, data });
            broadcast.broadcastAllData();
        },

        onDealsSynchronized: () => log.info('Deals synchronized'),

        // ── Prices ────────────────────────────────────────────────────────────

        onSymbolPriceUpdated: (_, price) => {
            if (!price?.symbol) return;
            acc.positions.forEach(pos => {
                if (pos.symbol !== price.symbol) return;
                pos.currentPrice = pos.type === 'POSITION_TYPE_BUY' ? price.bid : price.ask;
            });
        },

        onSymbolPricesUpdated: (_, _prices, equity, margin, freeMargin, marginLevel) => {
            if (equity === undefined || !acc.accountInfo) return;

            // profit = equity - balance by definition (unrealized P&L).
            // onAccountInformationUpdated fires once at sync then goes quiet;
            // this handler is the only reliable source for live equity/profit.
            const profit = equity - (acc.accountInfo.balance ?? 0);
            Object.assign(acc.accountInfo, { equity, margin, freeMargin, marginLevel, profit });

            // Throttle to once per second — this fires on every price tick
            // and emitting on each would flood connected clients on active markets.
            const now = Date.now();
            if (!acc._lastEquityEmit || now - acc._lastEquityEmit >= 1000) {
                acc._lastEquityEmit = now;
                io.emit('mt5AccountUpdate', {
                    accountId:   acc.id,
                    accountName: name,
                    data:        acc.accountInfo,
                });
            }
        },

        // ── No-op stubs required by MetaApi interface ─────────────────────────

        onHistoryOrderAdded:           () => {},
        onHistoryOrdersSynchronized:   () => log.info('History orders synchronized'),
        onSymbolSpecificationUpdated:  () => {},
        onSymbolSpecificationsUpdated: () => {},
    };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function upsertById(array, item) {
    const idx = array.findIndex(el => el.id === item.id);
    idx >= 0 ? (array[idx] = item) : array.push(item);
}

module.exports = { setupMT5Streaming };