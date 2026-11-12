import fs from 'fs';
import path from 'path';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { connectPostgres, disconnectPostgres, runPostgresMigrations } from '../src/config/pg.js';
import { seedDemoDataIfEmpty } from '../src/seed/seedData.js';
import { UPLOADS_ROOT } from '../src/middleware/upload.js';

let server;
let baseUrl;
let originUrl;

before(async () => {
  await connectPostgres({ usePglite: true });
  await runPostgresMigrations();
  await seedDemoDataIfEmpty({ force: true });

  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      originUrl = `http://127.0.0.1:${port}`;
      baseUrl = `${originUrl}/api`;
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

describe('KAAFILA Phase 2 — Rider & Organisation Dashboards Integration Tests', () => {
  let riderToken = '';
  let riderHandle = '';
  let orgAToken = '';
  let orgAId = '';
  let orgASlug = '';
  let orgBToken = '';
  let publishedRideId = '';
  let publishedRideSlug = '';
  let draftRideId = '';
  let draftRideSlug = '';
  let memberId = '';

  it('registers two distinct organisations and a rider', async () => {
    const riderRes = await fetch(`${baseUrl}/auth/register/rider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Vikram Negi',
        email: 'vikram.phase2@kaafila.in',
        password: 'Password@123',
        confirmPassword: 'Password@123',
        phoneNumber: '+91 9811100022',
        city: 'Dehradun',
      }),
    });
    const riderBody = await riderRes.json();
    assert.equal(riderRes.status, 201);
    riderToken = riderBody.data.token;
    riderHandle = riderBody.data.riderProfile.handle;

    const orgARes = await fetch(`${baseUrl}/auth/register/organisation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organisationName: 'Zanskar Ridge Expeditions',
        officialEmail: 'ops@zanskarridge.in',
        password: 'Password@123',
        confirmPassword: 'Password@123',
        contactNumber: '+91 9816000011',
        location: 'Leh, Ladakh, Ladakh',
        officialWebsite: 'https://zanskarridge.in',
        description: 'High altitude expeditions in Zanskar and Changthang.',
      }),
    });
    const orgABody = await orgARes.json();
    assert.equal(orgARes.status, 201);
    orgAToken = orgABody.data.token;
    orgAId = orgABody.data.organisation._id;
    orgASlug = orgABody.data.organisation.slug;

    const orgBRes = await fetch(`${baseUrl}/auth/register/organisation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organisationName: 'Garhwal Trail Outfitters',
        officialEmail: 'ops@garhwaltrail.in',
        password: 'Password@123',
        confirmPassword: 'Password@123',
        contactNumber: '+91 9816000099',
        location: 'Rishikesh, Uttarakhand, Garhwal',
        officialWebsite: 'https://garhwaltrail.in',
        description: 'Garhwal Himalayan touring team.',
      }),
    });
    const orgBBody = await orgBRes.json();
    assert.equal(orgBRes.status, 201);
    orgBToken = orgBBody.data.token;
  });

  it('enforces role isolation on rider and organisation dashboard endpoints', async () => {
    const unauthRider = await fetch(`${baseUrl}/riders/me/dashboard`);
    assert.equal(unauthRider.status, 401);

    const orgToRiderDash = await fetch(`${baseUrl}/riders/me/dashboard`, {
      headers: { Authorization: `Bearer ${orgAToken}` },
    });
    assert.equal(orgToRiderDash.status, 403);

    const riderToOrgDash = await fetch(`${baseUrl}/organisations/me/dashboard`, {
      headers: { Authorization: `Bearer ${riderToken}` },
    });
    assert.equal(riderToOrgDash.status, 403);

    const riderToOrgAnalytics = await fetch(`${baseUrl}/organisations/me/analytics`, {
      headers: { Authorization: `Bearer ${riderToken}` },
    });
    assert.equal(riderToOrgAnalytics.status, 403);
  });

  it('allows rider profile editing with emergency contact privacy while keeping verifiedKilometres & rank immutable', async () => {
    const updateRes = await fetch(`${baseUrl}/riders/me/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${riderToken}`,
      },
      body: JSON.stringify({
        fullName: 'Vikram Singh Negi',
        homeCity: 'Shimla',
        primaryMotorcycle: 'Royal Enfield Himalayan 450',
        ridingExperience: 'advanced',
        bio: 'High-altitude rider across Spiti and Zanskar.',
        verifiedKilometres: 999999, // Attempted privilege tamper — must be ignored
        rank: 'Legend', // Attempted rank tamper — must be ignored
        emergencyContact: {
          name: 'Meera Negi',
          relationship: 'Spouse',
          phone: '+91 9811199988',
          bloodGroup: 'O+',
          shareWithOrganisers: true,
        },
      }),
    });
    const updateBody = await updateRes.json();
    assert.equal(updateRes.status, 200);
    assert.equal(updateBody.data.user.fullName, 'Vikram Singh Negi');
    assert.equal(updateBody.data.riderProfile.verifiedKilometres, 0);
    assert.equal(updateBody.data.riderProfile.rank, 'Beginner');
    assert.equal(updateBody.data.riderProfile.emergencyContact.shareWithOrganisers, true);

    // Public profile must never leak email, phoneNumber, or emergencyContact
    const publicRes = await fetch(`${baseUrl}/riders/${riderHandle}`);
    const publicBody = await publicRes.json();
    assert.equal(publicRes.status, 200);
    assert.equal(publicBody.data.rider.email, undefined);
    assert.equal(publicBody.data.rider.phoneNumber, undefined);
    assert.equal(publicBody.data.rider.emergencyContact, undefined);
  });

  it('allows organisation profile editing while blocking self-verification and cross-org edits', async () => {
    const selfUpdateRes = await fetch(`${baseUrl}/organisations/${orgAId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgAToken}`,
      },
      body: JSON.stringify({
        shortDescription: 'Updated high-altitude specialist operator.',
        verificationStatus: 'verified', // Must be ignored for non-admin owner
        facilities: {
          bikeRental: {
            available: true,
            summary: 'Himalayan 450 fleet available',
            fleetModels: ['Himalayan 450'],
          },
        },
      }),
    });
    const selfUpdateBody = await selfUpdateRes.json();
    assert.equal(selfUpdateRes.status, 200);
    assert.equal(selfUpdateBody.data.verificationStatus, 'pending');
    assert.equal(selfUpdateBody.data.isVerified, false);

    // Cross-organisation edit must be rejected with 403
    const crossOrgRes = await fetch(`${baseUrl}/organisations/${orgAId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgBToken}`,
      },
      body: JSON.stringify({ shortDescription: 'Hijacked description' }),
    });
    assert.equal(crossOrgRes.status, 403);
  });

  it('supports organisation expedition CRUD, draft isolation, and cross-org protection', async () => {
    // 1. Create a draft expedition (private)
    const draftRes = await fetch(`${baseUrl}/rides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgAToken}`,
      },
      body: JSON.stringify({
        title: 'Secret Changthang Draft',
        region: 'Ladakh',
        startLocation: 'Leh',
        endLocation: 'Hanle',
        startDate: '2026-08-01',
        endDate: '2026-08-07',
        durationDays: 7,
        distanceKm: 750,
        priceInr: 32000,
        maxRiders: 10,
        status: 'draft',
      }),
    });
    const draftBody = await draftRes.json();
    assert.equal(draftRes.status, 201);
    draftRideId = draftBody.data._id;
    draftRideSlug = draftBody.data.slug;

    // Draft must not appear in public /api/rides or /api/rides/:slug
    const publicDraftCheck = await fetch(`${baseUrl}/rides/${draftRideSlug}`);
    assert.equal(publicDraftCheck.status, 404);

    // Owner CAN view own draft
    const ownerDraftCheck = await fetch(`${baseUrl}/rides/${draftRideSlug}`, {
      headers: { Authorization: `Bearer ${orgAToken}` },
    });
    assert.equal(ownerDraftCheck.status, 200);

    // 2. Create a published expedition
    const pubRes = await fetch(`${baseUrl}/rides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgAToken}`,
      },
      body: JSON.stringify({
        title: 'Zanskar Autumn Crossing 2026',
        tagline: 'Shinkula to Padum via Gonbo Rangjon',
        description: 'Full expedition with 4x4 sweep support.',
        region: 'Ladakh',
        startLocation: 'Manali',
        endLocation: 'Leh',
        startDate: '2026-09-10',
        endDate: '2026-09-18',
        durationDays: 9,
        distanceKm: 1120,
        maxAltitudeMeters: 5091,
        priceInr: 42000,
        maxRiders: 12,
        bookingUrl: 'https://zanskarridge.in/book/autumn-crossing',
        bikeRentalAvailable: true,
        facilitiesSummary: 'Heated tents, MAP meals, oxygen & sweep 4x4',
        itinerary: [
          { dayNumber: 1, title: 'Manali Briefing', description: 'Acclimatisation & bike checks', altitudeMeters: 2050 },
        ],
        status: 'published',
      }),
    });
    const pubBody = await pubRes.json();
    assert.equal(pubRes.status, 201);
    publishedRideId = pubBody.data._id;
    publishedRideSlug = pubBody.data.slug;

    // Published expedition must appear in public listing and org detail
    const publicListRes = await fetch(`${baseUrl}/rides?search=Zanskar%20Autumn`);
    const publicListBody = await publicListRes.json();
    assert.equal(publicListRes.status, 200);
    assert.ok(publicListBody.data.some((r) => r._id === publishedRideId));

    const orgPublicRes = await fetch(`${baseUrl}/organisations/${orgASlug}`);
    const orgPublicBody = await orgPublicRes.json();
    assert.equal(orgPublicRes.status, 200);
    assert.equal(orgPublicBody.data.expeditions.length, 1); // draft excluded

    // Cross-org update/delete must be rejected with 403
    const crossUpdateRes = await fetch(`${baseUrl}/rides/${publishedRideId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgBToken}`,
      },
      body: JSON.stringify({ title: 'Stolen Ride' }),
    });
    assert.equal(crossUpdateRes.status, 403);

    const crossDeleteRes = await fetch(`${baseUrl}/rides/${publishedRideId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${orgBToken}` },
    });
    assert.equal(crossDeleteRes.status, 403);

    // Owner updates published ride
    const ownerUpdateRes = await fetch(`${baseUrl}/rides/${publishedRideId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgAToken}`,
      },
      body: JSON.stringify({ priceInr: 44000 }),
    });
    const ownerUpdateBody = await ownerUpdateRes.json();
    assert.equal(ownerUpdateRes.status, 200);
    assert.equal(ownerUpdateBody.data.priceInr, 44000);
  });

  it('tracks rider participation, enforces privacy gating until confirmed+consented, and computes real org analytics', async () => {
    // Rider records interest without sharing contact first
    const partRes = await fetch(`${baseUrl}/rides/${publishedRideId}/participate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${riderToken}`,
      },
      body: JSON.stringify({
        status: 'interested',
        bikeChoice: 'rental',
        shareContactWithOrganisation: false,
      }),
    });
    const partBody = await partRes.json();
    assert.equal(partRes.status, 201);
    memberId = partBody.data._id;

    // Rider sees it in Rider Dashboard & My Rides
    const riderDashRes = await fetch(`${baseUrl}/riders/me/dashboard`, {
      headers: { Authorization: `Bearer ${riderToken}` },
    });
    const riderDashBody = await riderDashRes.json();
    assert.equal(riderDashRes.status, 200);
    assert.equal(riderDashBody.data.stats.upcomingRidesCount, 1);
    assert.equal(riderDashBody.data.stats.joinedOrganisationsCount, 1);

    const riderRidesRes = await fetch(`${baseUrl}/riders/me/rides?category=upcoming`, {
      headers: { Authorization: `Bearer ${riderToken}` },
    });
    const riderRidesBody = await riderRidesRes.json();
    assert.equal(riderRidesRes.status, 200);
    assert.equal(riderRidesBody.data.length, 1);

    // Org views riders BEFORE confirmation -> contactAuthorized MUST be false and phone/email redacted
    const orgRidersBeforeRes = await fetch(`${baseUrl}/organisations/me/riders`, {
      headers: { Authorization: `Bearer ${orgAToken}` },
    });
    const orgRidersBeforeBody = await orgRidersBeforeRes.json();
    assert.equal(orgRidersBeforeRes.status, 200);
    assert.equal(orgRidersBeforeBody.data.length, 1);
    assert.equal(orgRidersBeforeBody.data[0].contactAuthorized, false);
    assert.equal(orgRidersBeforeBody.data[0].user.email, undefined);
    assert.equal(orgRidersBeforeBody.data[0].user.phoneNumber, undefined);

    // Org confirms rider participation -> since rider profile has emergencyContact.shareWithOrganisers: true, contact becomes authorized
    const confirmRes = await fetch(`${baseUrl}/rides/${publishedRideId}/participants/${memberId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgAToken}`,
      },
      body: JSON.stringify({ status: 'confirmed' }),
    });
    assert.equal(confirmRes.status, 200);

    const orgRidersAfterRes = await fetch(`${baseUrl}/organisations/me/riders`, {
      headers: { Authorization: `Bearer ${orgAToken}` },
    });
    const orgRidersAfterBody = await orgRidersAfterRes.json();
    assert.equal(orgRidersAfterRes.status, 200);
    assert.equal(orgRidersAfterBody.data[0].contactAuthorized, true);
    assert.equal(orgRidersAfterBody.data[0].user.email, 'vikram.phase2@kaafila.in');

    // Org analytics reflects real MongoDB aggregations
    const analyticsRes = await fetch(`${baseUrl}/organisations/me/analytics`, {
      headers: { Authorization: `Bearer ${orgAToken}` },
    });
    const analyticsBody = await analyticsRes.json();
    assert.equal(analyticsRes.status, 200);
    assert.equal(analyticsBody.data.summary.totalPublishedExpeditions, 1);
    assert.equal(analyticsBody.data.summary.draftExpeditions, 1);
    assert.equal(analyticsBody.data.summary.recordedRegistrations, 1);
    assert.equal(analyticsBody.data.summary.confirmedRegistrations, 1);

    // Org deletes draft ride
    const deleteDraftRes = await fetch(`${baseUrl}/rides/${draftRideId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${orgAToken}` },
    });
    assert.equal(deleteDraftRes.status, 200);
  });

  it('validates and serves authenticated image uploads via /api/uploads/image and /uploads', async () => {
    const unauthUpload = await fetch(`${baseUrl}/uploads/image`, { method: 'POST' });
    assert.equal(unauthUpload.status, 401);

    // Reject non-image mime type
    const badForm = new FormData();
    badForm.append('image', new Blob(['hello'], { type: 'text/plain' }), 'notes.txt');
    const badUpload = await fetch(`${baseUrl}/uploads/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}` },
      body: badForm,
    });
    assert.equal(badUpload.status, 400);

    // Accept tiny 1x1 PNG
    const pngBytes = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
      'hex'
    );
    const goodForm = new FormData();
    goodForm.append('image', new Blob([pngBytes], { type: 'image/png' }), 'avatar.png');
    const goodUpload = await fetch(`${baseUrl}/uploads/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}` },
      body: goodForm,
    });
    const goodBody = await goodUpload.json();
    assert.equal(goodUpload.status, 201);
    assert.ok(goodBody.data.url.startsWith('/uploads/'));

    const staticFetch = await fetch(`${originUrl}${goodBody.data.url}`);
    assert.equal(staticFetch.status, 200);

    // Cleanup uploaded test file
    const uploadedFilePath = path.join(UPLOADS_ROOT, goodBody.data.filename);
    if (fs.existsSync(uploadedFilePath)) {
      fs.unlinkSync(uploadedFilePath);
    }
  });
});

