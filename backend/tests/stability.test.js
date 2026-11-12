import { EventEmitter } from 'events';
import http from 'http';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { attachPoolErrorListener, buildPgPoolConfig, sanitizePgErrorMessage } from '../src/config/pg.js';
import { env, parseTrustProxy } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { createGracefulShutdown } from '../src/utils/shutdown.js';

describe('KAAFILA Phase 5.1 Stage 1 — Backend Stability & Proxy Security', () => {
  it('registers pg pool error listener, redacts URIs, and configures keepalive/timeouts', () => {
    const cfg = buildPgPoolConfig('postgresql://user:secret@db.supabase.co:5432/postgres');
    assert.equal(cfg.idleTimeoutMillis, 20000);
    assert.equal(cfg.connectionTimeoutMillis, 10000);
    assert.equal(cfg.keepAlive, true);
    assert.equal(cfg.keepAliveInitialDelayMillis, 10000);
    assert.ok(cfg.ssl);

    const sanitized = sanitizePgErrorMessage(
      'Failed connecting to postgresql://postgres.abc:supersecret@aws-1.pooler.supabase.com:5432/postgres'
    );
    assert.equal(sanitized.includes('supersecret'), false);
    assert.ok(sanitized.includes('postgresql://[REDACTED]'));

    const fakePool = new EventEmitter();
    const logged = [];
    attachPoolErrorListener(fakePool, { error: (msg) => logged.push(msg) });

    // Emitting 'error' must not throw unhandled error
    fakePool.emit('error', Object.assign(new Error('Client terminated postgresql://u:p@host/db'), { code: '57P01' }));
    assert.equal(logged.length, 1);
    const parsed = JSON.parse(logged[0]);
    assert.equal(parsed.event, 'pg_pool_idle_client_error');
    assert.equal(parsed.code, '57P01');
    assert.equal(parsed.message.includes(':p@'), false);
  });

  it('executes graceful shutdown once, closes Socket.IO, HTTP, and DB, and enforces bounded timeout', async () => {
    const order = [];
    const exits = [];
    const fakeIo = {
      close(cb) {
        order.push('io');
        cb();
      },
    };
    const fakeServer = {
      close(cb) {
        order.push('http');
        cb();
      },
      closeIdleConnections() {
        order.push('http_idle');
      },
    };
    const disconnectDb = async () => {
      order.push('db');
    };

    const shutdown = createGracefulShutdown({
      httpServer: fakeServer,
      io: fakeIo,
      disconnectDb,
      timeoutMs: 2000,
      logger: { error: () => {} },
      onExit: (code) => exits.push(code),
    });

    const [first, second] = await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
    assert.equal(first.alreadyShuttingDown, false);
    assert.equal(first.exitCode, 0);
    assert.equal(second.alreadyShuttingDown, true);
    assert.deepEqual(order, ['io', 'http', 'http_idle', 'db']);
    assert.deepEqual(exits, [0]);

    // Bounded timeout test when HTTP close hangs
    const timeoutExits = [];
    const hangingShutdown = createGracefulShutdown({
      httpServer: { close() {} },
      io: null,
      disconnectDb: async () => {},
      timeoutMs: 40,
      logger: { error: () => {} },
      onExit: (code) => timeoutExits.push(code),
    });
    void hangingShutdown('SIGTERM');
    await new Promise((r) => setTimeout(r, 90));
    assert.deepEqual(timeoutExits, [1]);
  });

  it('parses TRUST_PROXY safely without permissive wildcard trust and configures Express app', () => {
    assert.equal(parseTrustProxy(undefined), false);
    assert.equal(parseTrustProxy(''), false);
    assert.equal(parseTrustProxy('false'), false);
    assert.equal(parseTrustProxy('0'), false);
    assert.equal(parseTrustProxy('true'), 1);
    assert.equal(parseTrustProxy('1'), 1);
    assert.equal(parseTrustProxy('2'), 2);
    assert.equal(parseTrustProxy('loopback'), 'loopback');
    assert.throws(() => parseTrustProxy('0.0.0.0/0'), /not allowed/i);
    assert.throws(() => parseTrustProxy('::/0'), /not allowed/i);
    assert.throws(() => parseTrustProxy('*'), /not allowed/i);
    assert.throws(() => parseTrustProxy('99'), /cannot exceed 10/i);

    const prev = env.trustProxy;
    try {
      env.trustProxy = parseTrustProxy('1');
      const appWithProxy = createApp();
      assert.equal(appWithProxy.get('trust proxy'), 1);

      env.trustProxy = parseTrustProxy('false');
      const appNoProxy = createApp();
      assert.equal(appNoProxy.get('trust proxy'), false);
    } finally {
      env.trustProxy = prev;
    }
  });

  it('applies express-rate-limit per forwarded client IP when trust proxy is 1 and ignores X-Forwarded-For when disabled', async () => {
    const makeLimitedServer = async (trustProxySetting) => {
      const app = express();
      app.set('trust proxy', trustProxySetting);
      app.use(
        rateLimit({
          windowMs: 60 * 1000,
          max: 2,
          standardHeaders: true,
          legacyHeaders: false,
        })
      );
      app.get('/ping', (req, res) => res.json({ ip: req.ip }));
      const server = http.createServer(app);
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const { port } = server.address();
      return { server, url: `http://127.0.0.1:${port}/ping` };
    };

    // 1. With trust proxy = 1: different X-Forwarded-For IPs get independent buckets
    const trusted = await makeLimitedServer(1);
    try {
      const r1 = await fetch(trusted.url, { headers: { 'X-Forwarded-For': '203.0.113.10' } });
      const r2 = await fetch(trusted.url, { headers: { 'X-Forwarded-For': '203.0.113.10' } });
      const r3 = await fetch(trusted.url, { headers: { 'X-Forwarded-For': '203.0.113.10' } });
      const rOther = await fetch(trusted.url, { headers: { 'X-Forwarded-For': '203.0.113.11' } });
      assert.equal(r1.status, 200);
      assert.equal(r2.status, 200);
      assert.equal(r3.status, 429);
      assert.equal(rOther.status, 200);
      const body = await rOther.json();
      assert.equal(body.ip, '203.0.113.11');
    } finally {
      await new Promise((r) => trusted.server.close(r));
    }

    // 2. With trust proxy = false: X-Forwarded-For is ignored, local socket IP is used
    const untrusted = await makeLimitedServer(false);
    try {
      const u1 = await fetch(untrusted.url, { headers: { 'X-Forwarded-For': '203.0.113.50' } });
      const u2 = await fetch(untrusted.url, { headers: { 'X-Forwarded-For': '203.0.113.51' } });
      const u3 = await fetch(untrusted.url, { headers: { 'X-Forwarded-For': '203.0.113.52' } });
      assert.equal(u1.status, 200);
      assert.equal(u2.status, 200);
      assert.equal(u3.status, 429);
    } finally {
      await new Promise((r) => untrusted.server.close(r));
    }
  });
});

