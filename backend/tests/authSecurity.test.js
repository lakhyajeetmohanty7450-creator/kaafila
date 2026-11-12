import crypto from 'crypto';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { connectPostgres, disconnectPostgres, query, queryOne, runPostgresMigrations } from '../src/config/pg.js';
import { JWT_AUDIENCE, JWT_ISSUER, signToken, verifyToken } from '../src/middleware/auth.js';
import { setDevEmailSink } from '../src/utils/emailAdapter.js';

let server;
let baseUrl;
let riderToken = '';
let riderId = '';

before(async () => {
  await connectPostgres({ usePglite: true });
  await runPostgresMigrations();

  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}/api`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectPostgres();
});

describe('KAAFILA Phase 5.1 Stage 2A — JWT & Password Security', () => {
  it('enforces password length limits (8-128 chars) on rider and organisation registration and login', async () => {
    const shortRes = await fetch(`${baseUrl}/auth/register/rider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Short Pass',
        email: 'shortpass@kaafila.test',
        password: 'short',
        city: 'Leh',
      }),
    });
    assert.equal(shortRes.status, 400);

    const tooLongPassword = 'A'.repeat(129);
    const longRiderRes = await fetch(`${baseUrl}/auth/register/rider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Long Pass',
        email: 'longpass@kaafila.test',
        password: tooLongPassword,
        city: 'Leh',
      }),
    });
    assert.equal(longRiderRes.status, 400);

    const longOrgRes = await fetch(`${baseUrl}/auth/register/organisation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organisationName: 'Long Pass Expeditions',
        email: 'longorg@kaafila.test',
        password: tooLongPassword,
        location: 'Manali, Himachal Pradesh',
      }),
    });
    assert.equal(longOrgRes.status, 400);

    const longLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'longpass@kaafila.test',
        password: tooLongPassword,
      }),
    });
    assert.equal(longLoginRes.status, 400);
  });

  it('registers and logs in rider and organisation accounts and issues pinned HS256 JWTs without PII', async () => {
    const regRiderRes = await fetch(`${baseUrl}/auth/register/rider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Aarav Rider',
        email: 'aarav.stage2@kaafila.test',
        password: 'ValidPassword123!',
        city: 'Manali',
      }),
    });
    assert.equal(regRiderRes.status, 201);
    const regRiderBody = await regRiderRes.json();
    riderToken = regRiderBody.data.token;
    riderId = regRiderBody.data.user.id;

    const decoded = verifyToken(riderToken);
    assert.equal(decoded.id, riderId);
    assert.equal(decoded.role, 'rider');
    assert.equal(decoded.iss, JWT_ISSUER);
    assert.equal(decoded.aud, JWT_AUDIENCE);
    assert.equal(decoded.email, undefined);
    assert.equal(decoded.phoneNumber, undefined);

    const header = JSON.parse(Buffer.from(riderToken.split('.')[0], 'base64url').toString('utf8'));
    assert.equal(header.alg, 'HS256');

    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${riderToken}` },
    });
    assert.equal(meRes.status, 200);

    const regOrgRes = await fetch(`${baseUrl}/auth/register/organisation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organisationName: 'Spiti Moto Collective',
        email: 'spiti.stage2@kaafila.test',
        password: 'ValidOrgPassword123!',
        location: 'Kaza, Himachal Pradesh',
      }),
    });
    assert.equal(regOrgRes.status, 201);

    const loginOrgRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'spiti.stage2@kaafila.test',
        password: 'ValidOrgPassword123!',
        expectedRole: 'organisation',
      }),
    });
    assert.equal(loginOrgRes.status, 200);
    const loginOrgBody = await loginOrgRes.json();
    assert.ok(loginOrgBody.data.token);
  });

  it('rejects invalid JWTs, wrong signing algorithms (HS512 / none), expired tokens, and wrong issuer/audience', async () => {
    const hs512Token = jwt.sign(
      { id: riderId, role: 'rider' },
      env.jwtSecret,
      { algorithm: 'HS512', expiresIn: '1h', issuer: JWT_ISSUER, audience: JWT_AUDIENCE }
    );
    assert.throws(() => verifyToken(hs512Token));

    const headerNone = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payloadNone = Buffer.from(
      JSON.stringify({ id: riderId, role: 'rider', iss: JWT_ISSUER, aud: JWT_AUDIENCE })
    ).toString('base64url');
    const unsignedToken = `${headerNone}.${payloadNone}.`;
    assert.throws(() => verifyToken(unsignedToken));

    const expiredToken = jwt.sign(
      { id: riderId, role: 'rider' },
      env.jwtSecret,
      { algorithm: 'HS256', expiresIn: -10, issuer: JWT_ISSUER, audience: JWT_AUDIENCE }
    );
    assert.throws(() => verifyToken(expiredToken));

    const wrongIssuerToken = jwt.sign(
      { id: riderId, role: 'rider' },
      env.jwtSecret,
      { algorithm: 'HS256', expiresIn: '1h', issuer: 'wrong-issuer', audience: JWT_AUDIENCE }
    );
    assert.throws(() => verifyToken(wrongIssuerToken));

    for (const badToken of [hs512Token, unsignedToken, expiredToken, wrongIssuerToken, 'not.a.jwt']) {
      const res = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${badToken}` },
      });
      assert.equal(res.status, 401);
    }

    const validSigned = signToken({ id: riderId, role: 'rider' });
    assert.equal(verifyToken(validSigned).id, riderId);
  });

  it('revokes tokens on logout and password change via token_version', async () => {
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'aarav.stage2@kaafila.test',
        password: 'ValidPassword123!',
      }),
    });
    assert.equal(loginRes.status, 200);
    const { data: loginData } = await loginRes.json();
    const sessionToken = loginData.token;

    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert.equal(logoutRes.status, 200);

    const afterLogoutMe = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert.equal(afterLogoutMe.status, 401);

    const reLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'aarav.stage2@kaafila.test',
        password: 'ValidPassword123!',
      }),
    });
    assert.equal(reLoginRes.status, 200);
    const { data: reLoginData } = await reLoginRes.json();
    const oldSessionToken = reLoginData.token;

    const changePassRes = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oldSessionToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'ValidPassword123!',
        newPassword: 'UpdatedPassword456!',
        confirmPassword: 'UpdatedPassword456!',
      }),
    });
    assert.equal(changePassRes.status, 200);
    const { data: changeData } = await changePassRes.json();
    assert.ok(changeData.token);

    const oldTokenMe = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${oldSessionToken}` },
    });
    assert.equal(oldTokenMe.status, 401);

    const newTokenMe = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${changeData.token}` },
    });
    assert.equal(newTokenMe.status, 200);
  });

  it('enforces secure hashed single-use expiring password reset and rate limiting', async () => {
    const captured = [];
    setDevEmailSink((payload) => {
      captured.push(payload);
    });

    try {
      // Non-existent email returns generic 200 and sends no reset token
      const unknownRes = await fetch(`${baseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@kaafila.test' }),
      });
      assert.equal(unknownRes.status, 200);
      assert.equal(captured.length, 0);

      // Existing email generates hashed token in DB
      const knownRes = await fetch(`${baseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'aarav.stage2@kaafila.test' }),
      });
      assert.equal(knownRes.status, 200);
      assert.equal(captured.length, 1);

      const rawToken = captured[0].resetToken;
      assert.ok(rawToken && rawToken.length >= 64);

      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const storedRow = await queryOne(
        'SELECT id, token_hash, used_at FROM password_reset_tokens WHERE token_hash = $1',
        [expectedHash]
      );
      assert.ok(storedRow);
      assert.notEqual(storedRow.token_hash, rawToken);
      assert.equal(storedRow.used_at, null);

      // Expired token must fail
      const expiredRaw = crypto.randomBytes(32).toString('hex');
      const expiredHash = crypto.createHash('sha256').update(expiredRaw).digest('hex');
      await query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() - INTERVAL '5 minutes')`,
        [riderId, expiredHash]
      );
      const expiredRes = await fetch(`${baseUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: expiredRaw,
          password: 'ResetPassword789!',
          confirmPassword: 'ResetPassword789!',
        }),
      });
      assert.equal(expiredRes.status, 400);

      // Valid reset succeeds and invalidates active session
      const loginBeforeReset = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'aarav.stage2@kaafila.test',
          password: 'UpdatedPassword456!',
        }),
      });
      assert.equal(loginBeforeReset.status, 200);
      const activeTokenBeforeReset = (await loginBeforeReset.json()).data.token;

      const resetRes = await fetch(`${baseUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: rawToken,
          password: 'ResetPassword789!',
          confirmPassword: 'ResetPassword789!',
        }),
      });
      assert.equal(resetRes.status, 200);

      // Session before reset is invalidated
      const staleSessionRes = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${activeTokenBeforeReset}` },
      });
      assert.equal(staleSessionRes.status, 401);

      // Reuse of same reset token must fail
      const reuseRes = await fetch(`${baseUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: rawToken,
          password: 'AnotherPassword789!',
          confirmPassword: 'AnotherPassword789!',
        }),
      });
      assert.equal(reuseRes.status, 400);

      // Rate limit on password reset endpoints (max 10 per 15 min)
      let hitRateLimit = false;
      for (let i = 0; i < 12; i += 1) {
        const res = await fetch(`${baseUrl}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'nobody@kaafila.test' }),
        });
        if (res.status === 429) {
          hitRateLimit = true;
          break;
        }
      }
      assert.equal(hitRateLimit, true);
    } finally {
      setDevEmailSink(null);
    }
  });
});

