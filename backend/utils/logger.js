'use strict';

const pino = require('pino');

// Use pretty-print in development only.  pino-pretty is a devDependency and
// is not installed in the production container (npm ci --omit=dev).
// We guard with a require.resolve check so the logger degrades gracefully to
// plain JSON if NODE_ENV is misconfigured or pino-pretty is absent.
const isProduction    = process.env.NODE_ENV === 'production';
const prettyAvailable = !isProduction && (() => {
    try {
        require.resolve('pino-pretty');
        return true;
    } catch {
        return false;
    }
})();

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    ...(prettyAvailable && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize:      true,
                translateTime: 'HH:MM:ss',
                ignore:        'pid,hostname',
            },
        },
    }),
});

module.exports = logger;