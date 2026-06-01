'use strict';

const MetaApi = require('metaapi.cloud-sdk').default;
const logger  = require('../../utils/logger');
const { setupMT5Streaming } = require('./streaming');

async function initializeMetaApi(token) {
    if (!token) {
        logger.warn('No METAAPI_TOKEN found in .env — MT5 accounts will not be monitored');
        return null;
    }

    try {
        logger.info('Initializing MetaApi SDK…');
        const metaApi = new MetaApi(token);
        logger.info('MetaApi SDK initialized');
        return metaApi;
    } catch (err) {
        logger.error({ err }, 'Failed to initialize MetaApi — verify METAAPI_TOKEN');
        return null;
    }
}

/**
 * Connects a single MT5 account via MetaApi.
 *
 * A single streaming connection is used for both real-time event delivery and
 * data access via terminalState.  Creating a separate RPC connection alongside
 * a streaming connection causes the second waitSynchronized() to time out
 * because MetaApi does not expect two concurrent connections per account.
 */
async function connectMT5Account(mt5Account, metaApi, { io, broadcast, fetchMT5AccountData }) {
    const log = logger.child({ account: mt5Account.name });
    log.info({ accountId: mt5Account.accountId }, 'Connecting to MT5 account…');

    try {
        const account = await metaApi.metatraderAccountApi.getAccount(mt5Account.accountId);

        log.info('Waiting for API server to connect…');
        await account.waitConnected();

        mt5Account.metaAccount = account;

        await setupMT5Streaming(mt5Account, { io, broadcast });

        mt5Account.isConnected = true;
        log.info('Connected to MT5');

        await fetchMT5AccountData(mt5Account, broadcast);
    } catch (err) {
        log.error({ err }, 'Connection error');
        mt5Account.isConnected = false;
    }
}

module.exports = { initializeMetaApi, connectMT5Account };