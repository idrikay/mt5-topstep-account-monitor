'use strict';

const express   = require('express');
const http      = require('http');
const socketIO  = require('socket.io');
const cors      = require('cors');
const helmet    = require('helmet');
const pinoHttp  = require('pino-http');
const logger    = require('./utils/logger');

const app    = express();
const server = http.createServer(app);

const io = socketIO(server, {
    cors: {
        origin:  process.env.FRONTEND_URL || 'http://localhost:4210',
        methods: ['GET', 'POST'],
    },
});

// ── Security headers ──────────────────────────────────────────────────────────
// Helmet sets a sensible baseline of HTTP security headers (CSP, HSTS,
// X-Frame-Options, X-Content-Type-Options, etc.) in a single call.
app.use(helmet());

// ── Request logging ───────────────────────────────────────────────────────────
// pino-http logs every inbound request as structured JSON, including method,
// url, status code and response time.  Uses the shared logger so the format
// is consistent with application-level log lines.
app.use(pinoHttp({ logger }));

app.use(cors());
app.use(express.json());

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Intentionally omitted.  This service is a private dashboard — all REST
// endpoints are consumed only by the Angular frontend, not by arbitrary
// clients.  More importantly, a single-process in-memory rate limiter would
// be misleading at scale: each replica would enforce its own independent
// counter, so ten instances would allow ten times the intended traffic.
// The correct implementation requires a shared store (Redis), which would
// also be needed for Socket.IO sticky-session scaling.  Both will be added
// together when horizontal scaling becomes a requirement.

module.exports = { app, io, server };