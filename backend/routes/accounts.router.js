'use strict';

const { Router } = require('express');
const { z }      = require('zod');
const logger     = require('../utils/logger');
const {
    listTopstepAccounts, listMT5Accounts,
    fullTopstepData, fullMT5Data,
    topstepPositionsSummary, mt5PositionsSummary,
    buildSummary,
} = require('./data-builders');

/**
 * Registers all REST API routes on `app`.
 *
 * @param {import('express').Application} app
 * @param {object[]} topstepAccounts
 * @param {object[]} mt5Accounts
 */
function registerRoutes(app, topstepAccounts, mt5Accounts) {
    const router = Router();

    // Liveness / readiness probe target — no auth, no business logic.
    // Returns connected account counts and process uptime so the endpoint
    // is useful during incident investigation, not just for Kubernetes probes.
    router.get('/health', (req, res) => {
        res.json({
            status:    'ok',
            timestamp: new Date().toISOString(),
            uptime:    Math.floor(process.uptime()),
            accounts: {
                topstep: {
                    connected: topstepAccounts.filter(acc => acc.jwt).length,
                    total:     topstepAccounts.length,
                },
                mt5: {
                    connected: mt5Accounts.filter(acc => acc.isConnected).length,
                    total:     mt5Accounts.length,
                },
            },
        });
    });


    router.get('/accounts', (req, res) => {
        res.json([
            ...listTopstepAccounts(topstepAccounts),
            ...listMT5Accounts(mt5Accounts),
        ]);
    });

    router.get('/all-data', (req, res) => {
        res.json([
            ...fullTopstepData(topstepAccounts),
            ...fullMT5Data(mt5Accounts),
        ]);
    });

    router.get('/positions/summary', (req, res) => {
        res.json([
            ...topstepPositionsSummary(topstepAccounts),
            ...mt5PositionsSummary(mt5Accounts),
        ]);
    });

    router.get('/accounts/summary', (req, res) => {
        res.json(buildSummary(topstepAccounts, mt5Accounts));
    });

    router.get('/mt5/:accountId/info', (req, res) => {
        const acc = findMT5Account(mt5Accounts, req.params.accountId);
        if (!acc) return res.status(404).json({ error: 'MT5 account not found or not connected' });

        res.json({
            accountInfo: acc.accountInfo,
            positions:   acc.positions,
            orders:      acc.orders,
            deals:       acc.deals,
            lastUpdate:  acc.lastUpdate,
        });
    });

    router.get('/mt5/:accountId/positions', (req, res) => {
        const acc = findMT5Account(mt5Accounts, req.params.accountId);
        if (!acc) return res.status(404).json({ error: 'MT5 account not found or not connected' });
        res.json(acc.positions);
    });

    router.get('/mt5/:accountId/deals', (req, res) => {
        const acc = findMT5Account(mt5Accounts, req.params.accountId);
        if (!acc) return res.status(404).json({ error: 'MT5 account not found or not connected' });
        res.json(acc.deals);
    });

    // Protected diagnostic endpoint.
    // Requires the X-Debug-Token header to match the DEBUG_TOKEN env var.
    // In production, leave DEBUG_TOKEN unset to disable the endpoint entirely.
    // Locally, set DEBUG_TOKEN=dev in .env for easy access.
    router.get('/debug', (req, res) => {
        const token = process.env.DEBUG_TOKEN;
        if (!token || req.headers['x-debug-token'] !== token) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        res.json({
            topstep: topstepAccounts.map(acc => ({
                id: acc.id,
                name: acc.name,
                hasJWT: !!acc.jwt,
                connectionState: acc.connection?.state,
                subAccountsCount: Object.keys(acc.subAccounts).length,
                subscribedAccountsCount: acc.subscribedAccounts.size,
            })),
            mt5: mt5Accounts.map(acc => ({
                id: acc.id,
                name: acc.name,
                accountId: acc.accountId,
                isConnected: acc.isConnected,
                hasStreamConnection: !!acc.streamConnection,
                positionsCount: acc.positions?.length ?? 0,
                ordersCount:    acc.orders?.length    ?? 0,
                dealsCount:     acc.deals?.length     ?? 0,
                lastUpdate:     acc.lastUpdate,
            })),
        });
    });

    app.use('/api', router);
}

/**
 * Registers the `/api/mt5-reports` POST endpoint separately because it
 * depends on the MT5ReportService which is not required by any other route.
 *
 * @param {import('express').Application} app
 * @param {string|null} metaApiToken
 */
function registerMT5ReportsRoute(app, metaApiToken) {
    const { MT5ReportService } = require('../mt5-report-service');

    const reportSchema = z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
        endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
    }).refine(
        data => new Date(data.startDate) <= new Date(data.endDate),
        { message: 'startDate must be before or equal to endDate', path: ['startDate'] }
    );

    app.post('/api/mt5-reports', async (req, res) => {
        const parsed = reportSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error:   parsed.error.errors.map(e => e.message).join('; '),
            });
        }

        const { startDate, endDate } = parsed.data;

        if (!metaApiToken) {
            return res.status(500).json({ success: false, error: 'METAAPI_TOKEN is not configured' });
        }

        try {
            logger.info({ startDate, endDate }, 'Generating MT5 reports');

            const reports     = await new MT5ReportService(metaApiToken).getAllAccountReports(startDate, endDate);
            const totalTrades = reports.reduce((sum, r) => sum + r.report.length, 0);

            logger.info({ accounts: reports.length, totalTrades }, 'MT5 reports generated');

            res.json({
                success: true,
                data: reports,
                summary: {
                    accountsProcessed: reports.length,
                    totalTrades,
                    dateRange: { from: startDate, to: endDate },
                },
                timestamp: new Date().toISOString(),
            });
        } catch (err) {
            logger.error({ err, startDate, endDate }, 'Error generating MT5 reports');

            const status =
                err.message?.includes('Not authenticated') ? 401 :
                err.message?.includes('Account not found') ? 404 :
                err.message?.includes('rate limit')        ? 429 : 500;

            res.status(status).json({
                success: false,
                error: err.message || 'Failed to generate MT5 reports',
                ...(process.env.NODE_ENV === 'development' && { details: err.stack }),
            });
        }
    });
}

// ─── Private ──────────────────────────────────────────────────────────────────

function findMT5Account(mt5Accounts, accountId) {
    return mt5Accounts.find(acc => acc.accountId === accountId && acc.isConnected) ?? null;
}

module.exports = { registerRoutes, registerMT5ReportsRoute };