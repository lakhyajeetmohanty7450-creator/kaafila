import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { connectPostgres, disconnectPostgres, runPostgresMigrations, queryOne } from '../src/config/pg.js';
import { seedDemoDataIfEmpty } from '../src/seed/seedData.js';

let server;
let baseUrl;

before(async () => {
  await connectPostgres({ usePglite: true });
  await runPostgresMigrations();
  await seedDemoDataIfEmpty({ force: true });

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

describe('KAAFILA Phase 1 MVP Integration Tests', () => {
  let riderToken = '';
  let orgToken = '';
  let createdOrgId = '';

  it('GET /api/health returns healthy status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.phase >= 1);
  });

  it('GET /api/organisations returns clearly labelled non-verified demo organisations with conditional ratings', async () => {
    const res = await fetch(`${baseUrl}/organisations`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.length, 4);

    for (const org of body.data) {
      assert.equal(org.isDemo, true);
      assert.equal(org.isVerified, false); // Fictional demo orgs are never presented as verified
    }

    const zanskar = body.data.find((o) => o.slug === 'zanskar-ridge-expeditions');
    assert.ok(zanskar);
    assert.equal(zanskar.reviewCount, 0);
    assert.equal(zanskar.ratingAverage, null);

    const karakoram = body.data.find((o) => o.slug === 'karakoram-throttle-co');
    assert.ok(karakoram);
    assert.ok(karakoram.availableRidesCount >= 2);
    assert.ok(karakoram.ratingAverage > 0);
  });

  it('GET /api/organisations supports search by name and filter by location', async () => {
    const searchRes = await fetch(`${baseUrl}/organisations?search=Karakoram`);
    const searchBody = await searchRes.json();
    assert.equal(searchRes.status, 200);
    assert.equal(searchBody.data.length, 1);
    assert.equal(searchBody.data[0].slug, 'karakoram-throttle-co');

    const locRes = await fetch(`${baseUrl}/organisations?location=Spiti`);
    const locBody = await locRes.json();
    assert.equal(locRes.status, 200);
    assert.equal(locBody.data.length, 1);
    assert.equal(locBody.data[0].slug, 'spiti-ridge-outlaws');
  });

  it('GET /api/organisations/:slug returns full detail with expeditions, itinerary, facilities & official booking URL', async () => {
    const res = await fetch(`${baseUrl}/organisations/karakoram-throttle-co`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.organisation.name, 'Karakoram Throttle Co.');
    assert.ok(body.data.organisation.bookingUrl.startsWith('https://'));
    assert.ok(body.data.organisation.officialWebsite.startsWith('https://'));
    assert.ok(body.data.expeditions.length >= 2);
    assert.ok(body.data.expeditions[0].startLocation);
    assert.ok(body.data.expeditions[0].durationDays >= 1);
    assert.ok(body.data.expeditions[0].itinerary.length >= 3);
  });

  it('POST /api/auth/register/rider validates confirmPassword, hashes password, and creates rider', async () => {
    const mismatchRes = await fetch(`${baseUrl}/auth/register/rider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Aarav Sharma',
        email: 'aarav@example.com',
        password: 'StrongPassword123!',
        confirmPassword: 'DifferentPassword!',
        city: 'Bengaluru',
      }),
    });
    assert.equal(mismatchRes.status, 400);

    const res = await fetch(`${baseUrl}/auth/register/rider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Aarav Sharma',
        email: 'aarav@example.com',
        password: 'StrongPassword123!',
        confirmPassword: 'StrongPassword123!',
        phoneNumber: '+91 98765 00001',
        city: 'Bengaluru',
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.ok(body.data.token);
    assert.equal(body.data.user.password, undefined);
    assert.equal(body.data.user.city, 'Bengaluru');
    assert.equal(body.data.user.phoneNumber, '+91 98765 00001');
    riderToken = body.data.token;

    const dbUser = await queryOne('SELECT password_hash FROM users WHERE email = $1', ['aarav@example.com']);
    assert.notEqual(dbUser.password_hash, 'StrongPassword123!');
    assert.ok(dbUser.password_hash.startsWith('$2'));
  });

  it('POST /api/auth/register/organisation registers organisation with official website & contact number', async () => {
    const res = await fetch(`${baseUrl}/auth/register/organisation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organisationName: 'Garhwal Summit Moto',
        officialEmail: 'devendra@garhwalmoto.example.com',
        password: 'OrgPassword123!',
        confirmPassword: 'OrgPassword123!',
        contactNumber: '+91 98160 12345',
        location: 'Rishikesh, Uttarakhand',
        officialWebsite: 'https://garhwalmoto.example.com',
        description: 'Small-group motorcycle tours through Garhwal and Kuari Pass.',
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.data.user.role, 'organisation');
    assert.equal(body.data.organisation.verificationStatus, 'pending');
    assert.equal(body.data.organisation.isVerified, false);
    assert.equal(body.data.organisation.contactNumber, '+91 98160 12345');
    assert.equal(body.data.organisation.officialWebsite, 'https://garhwalmoto.example.com');
    assert.equal(body.data.organisation.bookingUrl, 'https://garhwalmoto.example.com');
    orgToken = body.data.token;
    createdOrgId = body.data.organisation._id;
  });

  it('POST /api/auth/login enforces role-specific portal checks and GET /api/auth/me works', async () => {
    const wrongRoleRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'aarav@example.com',
        password: 'StrongPassword123!',
        expectedRole: 'organisation',
      }),
    });
    assert.equal(wrongRoleRes.status, 403);

    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'aarav@example.com',
        password: 'StrongPassword123!',
        expectedRole: 'rider',
      }),
    });
    const loginBody = await loginRes.json();
    assert.equal(loginRes.status, 200);
    assert.ok(loginBody.data.token);

    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${loginBody.data.token}` },
    });
    const meBody = await meRes.json();
    assert.equal(meRes.status, 200);
    assert.equal(meBody.data.user.email, 'aarav@example.com');
  });

  it('RBAC blocks rider from editing organisation and allows owner to update own organisation', async () => {
    const forbiddenRes = await fetch(`${baseUrl}/organisations/${createdOrgId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${riderToken}`,
      },
      body: JSON.stringify({ shortDescription: 'Unauthorized edit' }),
    });
    assert.equal(forbiddenRes.status, 403);

    const ownerRes = await fetch(`${baseUrl}/organisations/${createdOrgId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgToken}`,
      },
      body: JSON.stringify({
        shortDescription: 'Updated Garhwal & Valley of Flowers motorcycle expeditions.',
        verificationStatus: 'verified',
      }),
    });
    const ownerBody = await ownerRes.json();
    assert.equal(ownerRes.status, 200);
    assert.equal(ownerBody.data.verificationStatus, 'pending');
  });

  it('Rider can post a genuine review on an organisation and GET /api/rides returns featured rides', async () => {
    const [revRes, ridesRes] = await Promise.all([
      fetch(`${baseUrl}/organisations/${createdOrgId}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${riderToken}`,
        },
        body: JSON.stringify({
          rating: 5,
          title: 'Solid trail support',
          comment: 'Great briefing and route planning for Uttarakhand passes.',
        }),
      }),
      fetch(`${baseUrl}/rides?featured=true`),
    ]);

    const revBody = await revRes.json();
    const ridesBody = await ridesRes.json();

    assert.equal(revRes.status, 201);
    assert.equal(revBody.data.ratingAverage, 5);
    assert.equal(revBody.data.reviewCount, 1);

    assert.equal(ridesRes.status, 200);
    assert.ok(ridesBody.data.length >= 4);
  });

  it('Security: rejects duplicate email, invalid login, NoSQL object payloads, unauthenticated routes & bad image URLs', async () => {
    const dupRes = await fetch(`${baseUrl}/auth/register/rider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Duplicate User',
        email: 'aarav@example.com',
        password: 'StrongPassword123!',
        confirmPassword: 'StrongPassword123!',
        city: 'Delhi',
      }),
    });
    assert.equal(dupRes.status, 409);

    const badPassRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'aarav@example.com', password: 'WrongPassword!' }),
    });
    assert.equal(badPassRes.status, 401);

    const nosqlRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: { $ne: null }, password: { $ne: null } }),
    });
    assert.equal(nosqlRes.status, 400);

    const unauthMe = await fetch(`${baseUrl}/auth/me`);
    assert.equal(unauthMe.status, 401);

    const unauthReview = await fetch(`${baseUrl}/organisations/${createdOrgId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: 5, title: 'Unauth', comment: 'Should fail' }),
    });
    assert.equal(unauthReview.status, 401);

    const badImgRes = await fetch(`${baseUrl}/organisations/${createdOrgId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgToken}`,
      },
      body: JSON.stringify({ logoUrl: 'javascript:alert(1)' }),
    });
    assert.equal(badImgRes.status, 400);
  });
});
