'use strict';

const axios  = require('axios');
const logger = require('../../utils/logger');

/**
 * Authenticates a TopStepX account and returns a JWT string, or null on
 * failure.
 */
async function authenticate(account) {
    const url = `${account.apiUrl}/api/Auth/loginKey`;
    logger.info({ account: account.name, url }, 'Authenticating');

    try {
        const { data } = await axios.post(
            url,
            { userName: account.username, apiKey: account.apiKey },
            { headers: { accept: 'text/plain', 'Content-Type': 'application/json' } }
        );

        if (data.success && data.errorCode === 0) {
            logger.info({ account: account.name }, 'Authentication successful');
            return data.token;
        }

        logger.error({ account: account.name, reason: data.errorMessage }, 'Authentication failed');
        return null;
    } catch (err) {
        logger.error({ account: account.name, err }, 'Authentication error');
        return null;
    }
}

module.exports = { authenticate };