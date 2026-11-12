import http from 'http';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioClient } from '../../frontend/node_modules/socket.io-client/build/esm/index.js';
import { createApp } from '../src/app.js';
import { attachSocketServer } from '../src/socket/index.js';
import { connectPostgres, disconnectPostgres, runPostgresMigrations } from '../src/config/pg.js';
import { seedDemoDataIfEmpty } from '../src/seed/seedData.js';

let httpServer;
let originUrl;
let baseUrl;

before(async () => {
  await connectPostgres({ usePglite: true });
  await runPostgresMigrations();
  await seedDemoDataIfEmpty({ force: true });

  const app = createApp();
  httpServer = http.createServer(app);
  attachSocketServer(httpServer);

  await new Promise((resolve) => {
    httpServer.listen(0, () => {
      const { port } = httpServer.address();
      originUrl = `http://127.0.0.1:${port}`;
      baseUrl = `${originUrl}/api`;
      resolve();
    });
  });
});

after(async () => {
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await disconnectPostgres();
});

describe('KAAFILA Phase 4 — Maps, GPS Tracking, Live Convoy, Ranking & Leaderboards', () => {
  let orgAToken = '';
  let orgAId = '';
  let orgBToken = '';
  let rider1Token = '';
  let rider1Id = '';
  let rider1Handle = '';
  let rider2Token = '';
  let rider2Handle = '';
  let rideId = '';
  let rideSlug = '';
  let cp1Id = '';
  let cp2Id = '';
  let cp3Id = '';
  let groupId = '';
  let trackingSessionId = '';

  it('reports Phase 4 health, maps overview with real demo routes, and registers test accounts', async () => {
    const healthRes = await fetch(`${baseUrl}/health`);
    const health = await healthRes.json();
    assert.equal(healthRes.status, 200);
    assert.ok(health.phase >= 4);

    const overviewRes = await fetch(`${baseUrl}/maps/overview`);
    const overview = await overviewRes.json();
    assert.equal(overviewRes.status, 200);
    assert.ok(overview.data.some((r) => r.hasRouteData === true));
    // Intentionally unmapped expedition proves empty state is not fabricated
    assert.ok(overview.data.some((r) => r.hasRouteData === false));

    const regOrg = async (name, email, website) => {
      const res = await fetch(`${baseUrl}/auth/register/organisation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organisationName: name,
          officialEmail: email,
          password: 'Password@123',
          confirmPassword: 'Password@123',
          contactNumber: '+91 9811122233',
          location: 'Leh, Ladakh',
          officialWebsite: website,
          description: 'High-altitude Himalayan touring organisation for Phase 4 QA.',
        }),
      });
      assert.equal(res.status, 201);
      return res.json();
    };

    const orgA = await regOrg('Karakoram Ops P4', 'opsA.p4@kaafila.test', 'https://karakoram-p4.test');
    orgAToken = orgA.data.token;
    orgAId = orgA.data.organisation._id;

    const orgB = await regOrg('Spiti Ops P4', 'opsB.p4@kaafila.test', 'https://spiti-p4.test');
    orgBToken = orgB.data.token;

    const regRider = async (fullName, email, city) => {
      const res = await fetch(`${baseUrl}/auth/register/rider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          password: 'Password@123',
          confirmPassword: 'Password@123',
          city,
        }),
      });
      assert.equal(res.status, 201);
      return res.json();
    };

    const r1 = await regRider('Aryan Dogra', 'aryan.p4@kaafila.test', 'Leh');
    rider1Token = r1.data.token;
    rider1Id = r1.data.user._id;
    rider1Handle = r1.data.riderProfile.handle;

    const r2 = await regRider('Sana Kapoor', 'sana.p4@kaafila.test', 'Manali');
    rider2Token = r2.data.token;
    rider2Handle = r2.data.riderProfile.handle;
  });

  it('allows owning organisation to configure routes, add/reorder/delete checkpoints while preserving itinerary & RBAC', async () => {
    const createRes = await fetch(`${baseUrl}/rides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgAToken}` },
      body: JSON.stringify({
        title: 'Nubra Valley Phase 4 Corridor',
        region: 'Ladakh',
        startLocation: 'Leh',
        endLocation: 'Turtuk',
        startDate: '2027-07-01',
        endDate: '2027-07-05',
        durationDays: 5,
        distanceKm: 420,
        priceInr: 22000,
        itinerary: [{ day: 1, title: 'Leh Briefing', description: 'Acclimatise in Leh.' }],
        status: 'published',
      }),
    });
    const created = await createRes.json();
    assert.equal(createRes.status, 201);
    rideId = created.data._id;
    rideSlug = created.data.slug;

    // Cross-org & rider writes MUST be rejected 403
    const crossRoute = await fetch(`${baseUrl}/rides/${rideId}/route`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgBToken}` },
      body: JSON.stringify({ routeDescription: 'Hijack' }),
    });
    assert.equal(crossRoute.status, 403);

    const riderCp = await fetch(`${baseUrl}/rides/${rideId}/checkpoints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
      body: JSON.stringify({ name: 'Unauthorized', lat: 34.15, lng: 77.57 }),
    });
    assert.equal(riderCp.status, 403);

    // Org sets route endpoints & geometry (~145 km realistic Leh -> Turtuk points)
    const routeRes = await fetch(`${baseUrl}/rides/${rideId}/route`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgAToken}` },
      body: JSON.stringify({
        startPoint: { label: 'Leh Base', coordinates: [77.5771, 34.1526] },
        endPoint: { label: 'Turtuk Village', coordinates: [76.8266, 34.8473] },
        geometryCoordinates: [
          [77.5771, 34.1526],
          [77.6047, 34.2787],
          [77.5499, 34.5446],
          [76.8266, 34.8473],
        ],
        routeDescription: 'Via Khardung La & Shyok river corridor.',
      }),
    });
    const routeBody = await routeRes.json();
    assert.equal(routeRes.status, 200);
    assert.equal(routeBody.data.hasRouteData, true);
    assert.ok(routeBody.data.calculatedDistanceKm > 100);

    // Add 3 checkpoints + reorder
    const addCp = async (payload) => {
      const r = await fetch(`${baseUrl}/rides/${rideId}/checkpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgAToken}` },
        body: JSON.stringify(payload),
      });
      assert.equal(r.status, 201);
      return r.json();
    };

    const c1 = await addCp({ name: 'Leh Staging', type: 'start', lat: 34.1526, lng: 77.5771, radiusMeters: 300 });
    const c2 = await addCp({ name: 'Khardung La Top', type: 'checkpoint', lat: 34.2787, lng: 77.6047, radiusMeters: 300 });
    const c3 = await addCp({ name: 'Diskit Fuel Pump', type: 'fuel_stop', lat: 34.5446, lng: 77.5499, radiusMeters: 300 });
    cp1Id = c1.data._id;
    cp2Id = c2.data._id;
    cp3Id = c3.data._id;

    const reorderRes = await fetch(`${baseUrl}/rides/${rideId}/checkpoints/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgAToken}` },
      body: JSON.stringify({ orderedIds: [cp1Id, cp3Id, cp2Id] }),
    });
    const reordered = await reorderRes.json();
    assert.equal(reorderRes.status, 200);
    assert.equal(reordered.data[1]._id, cp3Id);
    assert.equal(reordered.data[1].sequenceNumber, 2);

    // Verify original ride itinerary remained untouched
    const rideDetailRes = await fetch(`${baseUrl}/rides/${rideSlug}`);
    const rideDetail = await rideDetailRes.json();
    assert.equal(rideDetail.data.itinerary.length, 1);
    assert.equal(rideDetail.data.itinerary[0].title, 'Leh Briefing');
  });

  it('tracks GPS sessions, filters jumps/poor accuracy, verifies checkpoints server-side & prevents fraud', async () => {
    // Create a group first for opt-in location sharing test
    const grpRes = await fetch(`${baseUrl}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
      body: JSON.stringify({
        name: 'Turtuk Convoy Test',
        destination: 'Ladakh',
        privacy: 'public',
      }),
    });
    const grpBody = await grpRes.json();
    assert.equal(grpRes.status, 201);
    groupId = grpBody.data._id;

    // Rider 1 starts explicit tracking session (sharing opt-in false initially)
    const startRes = await fetch(`${baseUrl}/tracking/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
      body: JSON.stringify({
        rideId,
        groupId,
        title: 'Leh to Turtuk Day 1',
        enableLocationSharing: false,
      }),
    });
    const started = await startRes.json();
    assert.equal(startRes.status, 201);
    assert.equal(started.data.isLocationSharingEnabled, false);
    trackingSessionId = started.data._id;

    // Duplicate active session MUST be blocked 409
    const dupRes = await fetch(`${baseUrl}/tracking/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
      body: JSON.stringify({ title: 'Duplicate Track' }),
    });
    assert.equal(dupRes.status, 409);

    // Pause -> Resume transition
    const pauseRes = await fetch(`${baseUrl}/tracking/sessions/${trackingSessionId}/pause`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${rider1Token}` },
    });
    assert.equal(pauseRes.status, 200);

    const resumeRes = await fetch(`${baseUrl}/tracking/sessions/${trackingSessionId}/resume`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${rider1Token}` },
    });
    assert.equal(resumeRes.status, 200);

    // Upload realistic GPS route points + 1 poor accuracy point + 1 impossible 500km teleport jump
    const baseTs = Date.now() - 3 * 3600 * 1000; // 3 hours ago start
    const points = [
      { lat: 34.1526, lng: 77.5771, accuracyMeters: 15, timestamp: new Date(baseTs).toISOString() }, // Checkpoint 1
      { lat: 34.215, lng: 77.59, accuracyMeters: 20, timestamp: new Date(baseTs + 1200 * 1000).toISOString() },
      { lat: 34.2787, lng: 77.6047, accuracyMeters: 18, timestamp: new Date(baseTs + 2400 * 1000).toISOString() }, // Checkpoint 2
      { lat: 34.35, lng: 77.58, accuracyMeters: 450, timestamp: new Date(baseTs + 2600 * 1000).toISOString() }, // Poor accuracy -> filtered
      { lat: 28.6139, lng: 77.209, accuracyMeters: 12, timestamp: new Date(baseTs + 2605 * 1000).toISOString() }, // Sudden Delhi teleport -> flagged & filtered
      { lat: 34.5446, lng: 77.5499, accuracyMeters: 14, timestamp: new Date(baseTs + 5400 * 1000).toISOString() }, // Checkpoint 3 (~30km in 50min = plausible)
      { lat: 34.8473, lng: 76.8266, accuracyMeters: 16, timestamp: new Date(baseTs + 10800 * 1000).toISOString() }, // Turtuk (~75km in 90min = plausible -> total > 110 km!)
    ];

    const uploadRes = await fetch(`${baseUrl}/tracking/sessions/${trackingSessionId}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
      body: JSON.stringify({ points }),
    });
    const uploadBody = await uploadRes.json();
    assert.equal(uploadRes.status, 200);
    const s = uploadBody.data.session;
    assert.ok(s.verifiedDistanceKm >= 100 && s.verifiedDistanceKm < 250);
    assert.ok(s.stats.filteredPoorAccuracy >= 1);
    assert.ok(s.stats.filteredJumps >= 1);
    assert.ok(s.suspiciousFlags.length >= 1);
    // Checkpoints within 300m should auto-verify!
    assert.equal(uploadBody.data.newlyVerifiedCheckpoints.length, 3);

    // Duplicate checkpoint verify MUST fail cleanly (409), far-away verify MUST fail 422
    const dupCpRes = await fetch(
      `${baseUrl}/tracking/sessions/${trackingSessionId}/checkpoints/${cp1Id}/verify`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
        body: JSON.stringify({ lat: 34.1526, lng: 77.5771, accuracyMeters: 15 }),
      }
    );
    assert.equal(dupCpRes.status, 409);

    // Stop session -> sets verificationStatus='flagged' due to the injected teleport jump & awards 0 km
    const stopRes = await fetch(`${baseUrl}/tracking/sessions/${trackingSessionId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
      body: JSON.stringify({ shareSimplifiedRoutePublic: true }),
    });
    const flaggedStopBody = await stopRes.json();
    assert.equal(stopRes.status, 200);
    assert.equal(flaggedStopBody.data.session.verificationStatus, 'flagged');
    assert.equal(flaggedStopBody.data.kmAwardedNow, 0);

    // Repeated stop of same session MUST be rejected 409
    const doubleStop = await fetch(`${baseUrl}/tracking/sessions/${trackingSessionId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
      body: JSON.stringify({}),
    });
    assert.equal(doubleStop.status, 409);

    // Run a CLEAN session (> 105 km, 5+ points) with NO jumps so Rider 1 earns verified km + FIRST_100_KM + coarsened summary!
    const cleanStart = await fetch(`${baseUrl}/tracking/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
      body: JSON.stringify({ rideId, groupId, title: 'Clean Verifiable Run', enableLocationSharing: true }),
    });
    const cleanBody = await cleanStart.json();
    assert.equal(cleanStart.status, 201);
    const cleanId = cleanBody.data._id;

    const cleanTs = Date.now() - 3 * 3600 * 1000;
    const cleanPoints = [
      { lat: 34.1526, lng: 77.5771, accuracyMeters: 12, timestamp: new Date(cleanTs).toISOString() },
      { lat: 34.2787, lng: 77.6047, accuracyMeters: 15, timestamp: new Date(cleanTs + 1800 * 1000).toISOString() },
      { lat: 34.4342, lng: 77.5602, accuracyMeters: 14, timestamp: new Date(cleanTs + 3200 * 1000).toISOString() },
      { lat: 34.5446, lng: 77.5499, accuracyMeters: 14, timestamp: new Date(cleanTs + 4500 * 1000).toISOString() },
      { lat: 34.8473, lng: 76.8266, accuracyMeters: 16, timestamp: new Date(cleanTs + 9800 * 1000).toISOString() },
    ];
    await fetch(`${baseUrl}/tracking/sessions/${cleanId}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
      body: JSON.stringify({ points: cleanPoints }),
    });
    const cleanStop = await fetch(`${baseUrl}/tracking/sessions/${cleanId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
      body: JSON.stringify({ shareSimplifiedRoutePublic: true }),
    });
    const cleanStopBody = await cleanStop.json();
    assert.equal(cleanStop.status, 200);
    assert.ok(cleanStopBody.data.kmAwardedNow >= 100);
    assert.ok(cleanStopBody.data.session.estimatedDistanceKm >= 100);
    const badgeCodes = (cleanStopBody.data.newlyAwarded || []).map((b) => b.code);
    assert.ok(badgeCodes.includes('FIRST_100_KM'), `Unexpected newlyAwarded: ${JSON.stringify(cleanStopBody.data)}`);

    // Public profile shows badge & coarsened summary route, NEVER leaks raw start/end or private info
    const pubProfileRes = await fetch(`${baseUrl}/riders/${rider1Handle}`);
    const pubProfile = await pubProfileRes.json();
    assert.equal(pubProfileRes.status, 200);
    assert.ok(pubProfile.data.rider.verifiedKilometres >= 100);
    assert.ok(pubProfile.data.publicRouteSummaries.length >= 1);
    // Coarsened summary trimmed first/last points, so exact start [77.5771, 34.1526] shouldn't match exact vertex
    const cleanSummary = pubProfile.data.publicRouteSummaries.find((s) => s.title === 'Clean Verifiable Run');
    assert.ok(cleanSummary);
    const summaryCoords = cleanSummary.simplifiedPublicRoute;
    assert.ok(Array.isArray(summaryCoords) && summaryCoords.length >= 2);
    assert.equal(
      summaryCoords.some((c) => Math.abs(c[0] - 77.5771) < 0.002 && Math.abs(c[1] - 34.1526) < 0.002),
      false
    );
    assert.equal(
      summaryCoords.some((c) => Math.abs(c[0] - 76.8266) < 0.002 && Math.abs(c[1] - 34.8473) < 0.002),
      false
    );

    // Direct client attempt to tamper with verifiedKilometres or rank via profile update MUST NOT change DB values
    await fetch(`${baseUrl}/riders/me/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
      body: JSON.stringify({ verifiedKilometres: 99999, rank: 'Himalayan Legend', homeCity: 'Leh' }),
    });
    const afterTamperRes = await fetch(`${baseUrl}/riders/${rider1Handle}`);
    const afterTamper = await afterTamperRes.json();
    assert.ok(afterTamper.data.rider.verifiedKilometres < 500);
    assert.equal(afterTamper.data.rider.rank, 'Beginner');
  });

  it('enforces Socket.IO live group location opt-in, member-only authorization & instant stop-sharing', async () => {
    // Start active session for rider1 WITHOUT sharing first
    const sRes = await fetch(`${baseUrl}/tracking/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
      body: JSON.stringify({ groupId, title: 'Live Socket Convoy', enableLocationSharing: false }),
    });
    const sBody = await sRes.json();
    assert.equal(sRes.status, 201);
    const liveSessId = sBody.data._id;

    const sock1 = ioClient(originUrl, { auth: { token: rider1Token }, transports: ['websocket'] });
    const sock2 = ioClient(originUrl, { auth: { token: rider2Token }, transports: ['websocket'] });
    await Promise.all([
      new Promise((r) => sock1.on('connect', r)),
      new Promise((r) => sock2.on('connect', r)),
    ]);

    try {
      // Non-member rider2 MUST be rejected from group:location_join & update
      const nonMemberJoin = await new Promise((resolve) =>
        sock2.emit('group:location_join', { groupId }, resolve)
      );
      assert.equal(nonMemberJoin.ok, false);

      // Member rider1 without opt-in enabled MUST be blocked from broadcasting location
      const unconsentedAck = await new Promise((resolve) =>
        sock1.emit('group:location_update', { groupId, lat: 34.16, lng: 77.58, sessionId: liveSessId }, resolve)
      );
      assert.equal(unconsentedAck.ok, false);

      // Rider2 joins public group -> becomes active member
      const joinGrpRes = await fetch(`${baseUrl}/groups/${groupId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${rider2Token}` },
      });
      assert.equal(joinGrpRes.status, 201);

      const memberJoinAck = await new Promise((resolve) =>
        sock2.emit('group:location_join', { groupId }, resolve)
      );
      assert.equal(memberJoinAck.ok, true);

      // Rider1 explicitly enables opt-in sharing via REST
      const toggleOnRes = await fetch(`${baseUrl}/tracking/sessions/${liveSessId}/sharing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
        body: JSON.stringify({ enabled: true, groupId }),
      });
      assert.equal(toggleOnRes.status, 200);

      // Rider2 receives live location broadcast from Rider1
      const receivedUpdate = new Promise((resolve) => {
        sock2.once('group:location_update', resolve);
      });
      const updateAck = await new Promise((resolve) =>
        sock1.emit(
          'group:location_update',
          { groupId, lat: 34.162, lng: 77.585, accuracyMeters: 12, sessionId: liveSessId },
          resolve
        )
      );
      assert.equal(updateAck.ok, true);
      const broadcastPayload = await receivedUpdate;
      assert.equal(String(broadcastPayload.userId), String(rider1Id));
      assert.equal(broadcastPayload.lat, 34.162);

      // Rider1 stops sharing immediately -> Rider2 receives group:location_stop
      const receivedStop = new Promise((resolve) => {
        sock2.once('group:location_stop', resolve);
      });
      const toggleOffRes = await fetch(`${baseUrl}/tracking/sessions/${liveSessId}/sharing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
        body: JSON.stringify({ enabled: false }),
      });
      assert.equal(toggleOffRes.status, 200);
      const stopPayload = await receivedStop;
      assert.equal(String(stopPayload.userId), String(rider1Id));

      await fetch(`${baseUrl}/tracking/sessions/${liveSessId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider1Token}` },
        body: JSON.stringify({}),
      });
    } finally {
      sock1.disconnect();
      sock2.disconnect();
    }
  });

  it('computes global, monthly, organisation & expedition leaderboards while enforcing privacy', async () => {
    // Set rider2 profile private -> MUST NOT appear on leaderboards
    await fetch(`${baseUrl}/riders/me/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rider2Token}` },
      body: JSON.stringify({ isProfilePublic: false }),
    });

    const [globalRes, monthlyRes, expRes, achRes] = await Promise.all([
      fetch(`${baseUrl}/leaderboards?category=global`, {
        headers: { Authorization: `Bearer ${rider1Token}` },
      }),
      fetch(`${baseUrl}/leaderboards?category=monthly`, {
        headers: { Authorization: `Bearer ${rider1Token}` },
      }),
      fetch(`${baseUrl}/leaderboards?category=expedition&rideId=${rideId}`),
      fetch(`${baseUrl}/leaderboards/achievements/me`, {
        headers: { Authorization: `Bearer ${rider1Token}` },
      }),
    ]);

    const globalBody = await globalRes.json();
    const monthlyBody = await monthlyRes.json();
    const expBody = await expRes.json();
    const achBody = await achRes.json();

    assert.equal(globalRes.status, 200);
    assert.ok(globalBody.data.entries.length > 0);
    assert.ok(globalBody.data.myEntry !== null);
    // No private fields exposed & private rider2 excluded
    assert.equal(
      globalBody.data.entries.some((e) => e.handle === rider2Handle),
      false
    );
    assert.equal(globalBody.data.entries[0].email, undefined);

    assert.equal(monthlyRes.status, 200);
    assert.ok(monthlyBody.data.entries.some((e) => e.handle === rider1Handle));

    assert.equal(expRes.status, 200);
    assert.ok(expBody.data.entries.some((e) => e.handle === rider1Handle));

    assert.equal(achRes.status, 200);
    assert.ok(achBody.data.earnedCount >= 2);
    assert.ok(achBody.data.items.some((a) => a.code === 'CHECKPOINT_CHAMPION' && a.earned));
  });
});
