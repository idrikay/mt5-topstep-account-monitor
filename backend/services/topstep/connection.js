'use strict';

const { HubConnectionBuilder, HttpTransportType } = require('@microsoft/signalr');
const logger = require('../../utils/logger');
const {
    isSubAccountAllowed,
    searchOpenPositions,
    searchTrades,
    searchOrders,
    subscribeToSubAccount,
    fetchInitialData,
} = require('./fetcher');
const { isToday } = require('../../utils/date');

const MAX_TRADES_CACHED = 50;

async function setupTopstepConnection(account, { io, broadcast }) {
    if (!account.jwt) {
        logger.error({ account: account.name }, 'Cannot connect: no JWT available');
        return;
    }

    const log    = logger.child({ account: account.name });
    const hubUrl = `${account.rtcUrl}/hubs/user?access_token=${account.jwt}`;
    log.info('Connecting to SignalR…');

    const connection = new HubConnectionBuilder()
        .withUrl(hubUrl, {
            skipNegotiation: true,
            transport: HttpTransportType.WebSockets,
            accessTokenFactory: () => account.jwt,
            timeout: 10_000,
        })
        .withAutomaticReconnect()
        .build();

    const subscribeAll = async () => {
        try {
            await connection.invoke('SubscribeAccounts');
            log.info('Subscribed to account updates');
        } catch (err) {
            log.error({ err }, 'SubscribeAccounts failed');
        }
    };

    const resubscribeAll = async () => {
        account.subscribedAccounts.clear();
        await subscribeAll();
        for (const subId of Object.keys(account.subAccounts)) {
            await subscribeToSubAccount(account, parseInt(subId, 10));
        }
    };

    connection.onclose(err => {
        log.info({ err: err?.message }, 'Connection closed');
        account.subscribedAccounts.clear();
    });

    connection.onreconnecting(() => log.info('Reconnecting…'));

    connection.onreconnected(async () => {
        log.info('Reconnected');
        await resubscribeAll();
    });

    connection.on('GatewayUserAccount', async ({ data: accountData }) => {
        if (!isSubAccountAllowed(account, accountData)) return;

        const subId = accountData.id;
        log.info({ subAccount: accountData.name }, 'Account update received');

        if (!account.subAccounts[subId]) {
            account.subAccounts[subId] = {
                id: subId,
                name: accountData.name || `Account ${subId}`,
                balance: accountData.balance || 0,
                canTrade: accountData.canTrade,
                isVisible: accountData.isVisible,
                simulated: accountData.simulated,
                trades: [],
                positions: [],
                orders: [],
                rawData: accountData,
            };
            await searchOpenPositions(account, subId);
            await searchTrades(account, subId);
            await searchOrders(account, subId);
            await subscribeToSubAccount(account, subId);
        } else {
            Object.assign(account.subAccounts[subId], {
                name:      accountData.name || account.subAccounts[subId].name,
                balance:   accountData.balance,
                canTrade:  accountData.canTrade,
                isVisible: accountData.isVisible,
                simulated: accountData.simulated,
                rawData:   accountData,
            });
        }

        io.emit('accountUpdate', {
            platform:     'topstep',
            accountName:  account.name,
            accountId:    account.id,
            subAccountId: subId,
            data:         accountData,
        });
        broadcast.broadcastAllData();
    });

    connection.on('GatewayUserOrder', ({ data: orderData }) => {
        const subId = orderData.accountId;
        if (!account.subAccounts[subId]) return;
        upsertById(account.subAccounts[subId].orders, orderData);
        io.emit('orderUpdate', { platform: 'topstep', accountName: account.name, accountId: account.id, subAccountId: subId, data: orderData });
        broadcast.broadcastAllData();
    });

    connection.on('GatewayUserPosition', ({ data: positionData }) => {
        const subId    = positionData.accountId;
        if (!account.subAccounts[subId]) return;
        const positions = account.subAccounts[subId].positions;
        const idx       = positions.findIndex(p => p.id === positionData.id);
        if (positionData.size === 0 || positionData.size === null) {
            if (idx >= 0) positions.splice(idx, 1);
        } else {
            idx >= 0 ? (positions[idx] = positionData) : positions.push(positionData);
        }
        io.emit('positionUpdate', { platform: 'topstep', accountName: account.name, accountId: account.id, subAccountId: subId, data: positionData });
        broadcast.broadcastAllData();
    });

    connection.on('GatewayUserTrade', ({ data: tradeData }) => {
        const subId = tradeData.accountId;
        if (!account.subAccounts[subId]) return;
        if (!isToday(tradeData.creationTimestamp)) return;
        const trades = account.subAccounts[subId].trades;
        const idx    = trades.findIndex(t => t.id === tradeData.id);
        idx >= 0 ? (trades[idx] = tradeData) : trades.unshift(tradeData);
        if (trades.length > MAX_TRADES_CACHED) {
            account.subAccounts[subId].trades = trades.slice(0, MAX_TRADES_CACHED);
        }
        io.emit('tradeUpdate', { platform: 'topstep', accountName: account.name, accountId: account.id, subAccountId: subId, data: tradeData });
        broadcast.broadcastAllData();
    });

    try {
        await connection.start();
        log.info('Connected to SignalR');
        account.connection = connection;
        await subscribeAll();
        await fetchInitialData(account, broadcast);
    } catch (err) {
        log.error({ err }, 'Connection error');
    }
}

function upsertById(array, item) {
    const idx = array.findIndex(el => el.id === item.id);
    idx >= 0 ? (array[idx] = item) : array.push(item);
}

module.exports = { setupTopstepConnection };