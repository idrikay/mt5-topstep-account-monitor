'use strict';

require('dotenv').config();

const { app, io, server } = require('./app');
const logger              = require('./utils/logger');
const { topstepAccounts, mt5Accounts, metaApiToken } = require('./config/accounts');
const { createBroadcaster }         = require('./broadcast');
const { authenticate }              = require('./services/topstep/auth');
const { setupTopstepConnection }    = require('./services/topstep/connection');
const { initializeMetaApi, connectMT5Account } = require('./services/mt5/client');
const { fetchMT5AccountData, refreshMT5Data }  = require('./services/mt5/fetcher');
const { registerRoutes, registerMT5ReportsRoute } = require('./routes/accounts.router');
const { registerSocketHandlers }    = require('./socket/handlers');

const PORT = process.env.PORT || 3010;

// ─── Broadcaster ──────────────────────────────────────────────────────────────

const broadcast = createBroadcaster(io, topstepAccounts, mt5Accounts);

// ─── Routes & sockets ────────────────────────────────────────────────────────

registerRoutes(app, topstepAccounts, mt5Accounts);
registerMT5ReportsRoute(app, metaApiToken);
registerSocketHandlers(io, topstepAccounts, mt5Accounts, broadcast, refreshMT5Data);

// ─── Initialization ──────────────────────────────────────────────────────────

async function initializeAllAccounts() {
    logger.info('Starting account initialization…');

    if (topstepAccounts.length > 0) {
        logger.info('Authenticating TopStepX accounts…');

        for (const account of topstepAccounts) {
            account.jwt = await authenticate(account);
            if (!account.jwt) {
                logger.warn({ account: account.name }, 'Authentication failed');
            }
        }

        const authenticated = topstepAccounts.filter(acc => acc.jwt !== null);
        logger.info(`${authenticated.length}/${topstepAccounts.length} TopStepX accounts authenticated`);

        for (const account of authenticated) {
            await setupTopstepConnection(account, { io, broadcast });
        }
    }

    if (mt5Accounts.length > 0) {
        logger.info('Initializing MT5 accounts…');

        const metaApi = await initializeMetaApi(metaApiToken);

        if (metaApi) {
            for (const mt5Account of mt5Accounts) {
                await connectMT5Account(mt5Account, metaApi, { io, broadcast, fetchMT5AccountData });
            }

            const connected = mt5Accounts.filter(acc => acc.isConnected);
            logger.info(`${connected.length}/${mt5Accounts.length} MT5 accounts connected`);

            setInterval(() => refreshMT5Data(mt5Accounts, broadcast), 30_000);
        }
    }

    logger.info('All account initialization complete');
}

initializeAllAccounts().catch(err => {
    logger.fatal({ err }, 'Fatal error during initialization');
    process.exit(1);
});

server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Kubernetes sends SIGTERM before terminating a pod.  We stop accepting new
// connections, allow in-flight requests to drain, then cleanly disconnect
// MetaAPI streaming connections before exiting.  Without this, the pod would
// be killed mid-request and Socket.IO clients would see hard disconnects.

async function shutdown(signal) {
    logger.info(`${signal} received — starting graceful shutdown`);

    // Stop accepting new HTTP / Socket.IO connections
    server.close(() => logger.info('HTTP server closed'));

    // Disconnect MetaAPI streaming connections cleanly
    for (const acc of mt5Accounts) {
        if (acc.streamConnection) {
            try {
                await acc.streamConnection.close();
                logger.info({ account: acc.name }, 'MetaAPI connection closed');
            } catch (err) {
                logger.warn({ account: acc.name, err }, 'Error closing MetaAPI connection');
            }
        }
    }

    // Allow 5 s for any remaining in-flight work, then exit
    setTimeout(() => {
        logger.info('Graceful shutdown complete');
        process.exit(0);
    }, 5_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));