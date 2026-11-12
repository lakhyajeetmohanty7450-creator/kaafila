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

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const client = ioClient(originUrl, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
    });
    const timer = setTimeout(() => {
      client.close();
      reject(new Error('Socket connect timeout'));
    }, 5000);

    client.on('connect', () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.on('connect_error', (err) => {
      clearTimeout(timer);
      client.close();
      reject(err);
    });
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (ack) => resolve(ack));
  });
}

function waitForEvent(socket, event, predicate = () => true, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for socket event: ${event}`));
    }, timeoutMs);

    function handler(data) {
      if (predicate(data)) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(data);
      }
    }

    socket.on(event, handler);
  });
}

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

describe('KAAFILA Phase 3 — Community, Connections, Groups & Real-Time Socket.IO Tests', () => {
  let riderAToken = '';
  let riderAId = '';
  let riderAHandle = '';

  let riderBToken = '';
  let riderBId = '';
  let riderBHandle = '';

  let riderCToken = '';
  let riderCId = '';
  let riderCHandle = '';

  let orgAToken = '';

  let connABId = '';
  let convABId = '';

  let publicGroupId = '';
  let publicGroupSlug = '';
  let privateGroupId = '';
  let privateGroupSlug = '';
  let inviteGroupId = '';
  let inviteGroupSlug = '';
  let announcementId = '';

  it('health endpoint reports Phase 3 and registers test riders + organisation', async () => {
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthJson = await healthRes.json();
    assert.equal(healthRes.status, 200);
    assert.ok(healthJson.phase >= 3);

    const registerRider = async (payload) => {
      const res = await fetch(`${baseUrl}/auth/register/rider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 201);
      return res.json();
    };

    const resA = await registerRider({
      fullName: 'Aarav Thakur',
      email: 'aarav.phase3@kaafila.test',
      password: 'Password123',
      confirmPassword: 'Password123',
      city: 'Manali',
      phoneNumber: '+91-9876543210',
    });
    riderAToken = resA.data.token;
    riderAId = resA.data.user._id;
    riderAHandle = resA.data.riderProfile.handle;

    const resB = await registerRider({
      fullName: 'Meera Joshi',
      email: 'meera.phase3@kaafila.test',
      password: 'Password123',
      confirmPassword: 'Password123',
      city: 'Pune',
      phoneNumber: '+91-9811112222',
    });
    riderBToken = resB.data.token;
    riderBId = resB.data.user._id;
    riderBHandle = resB.data.riderProfile.handle;

    const resC = await registerRider({
      fullName: 'Zorawar Gill',
      email: 'zorawar.phase3@kaafila.test',
      password: 'Password123',
      confirmPassword: 'Password123',
      city: 'Mumbai',
      phoneNumber: '+91-9822223333',
    });
    riderCToken = resC.data.token;
    riderCId = resC.data.user._id;
    riderCHandle = resC.data.riderProfile.handle;

    // Update Rider A & Rider B bikes for discovery filters, and set Rider C private
    await fetch(`${baseUrl}/riders/me/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderAToken}` },
      body: JSON.stringify({
        primaryMotorcycle: 'Royal Enfield Himalayan 450',
        homeCity: 'Manali',
        emergencyContact: { name: 'Secret Kin', phone: '+91-9999900000' },
      }),
    });
    await fetch(`${baseUrl}/riders/me/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderBToken}` },
      body: JSON.stringify({
        primaryMotorcycle: 'BMW G 310 GS',
        homeCity: 'Pune',
      }),
    });
    await fetch(`${baseUrl}/riders/me/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderCToken}` },
      body: JSON.stringify({
        isProfilePublic: false,
      }),
    });

    const orgRes = await fetch(`${baseUrl}/auth/register/organisation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organisationName: 'Zanskar Moto Collective',
        email: 'org.phase3@kaafila.test',
        password: 'Password123',
        contactNumber: '+91-9833334444',
        location: 'Leh',
        officialWebsite: 'https://zanskarmoto.example.com',
        description: 'High altitude touring group organiser.',
      }),
    });
    assert.equal(orgRes.status, 201);
    const orgJson = await orgRes.json();
    orgAToken = orgJson.data.token;
  });

  it('supports Rider Discovery search/filters while respecting privacy and hiding private fields', async () => {
    const searchRes = await fetch(
      `${baseUrl}/riders?search=Aarav&city=Manali&motorcycle=Himalayan`,
      { headers: { Authorization: `Bearer ${riderBToken}` } }
    );
    assert.equal(searchRes.status, 200);
    const searchJson = await searchRes.json();
    assert.equal(searchJson.data.length, 1);

    const card = searchJson.data[0];
    assert.equal(card.handle, riderAHandle);
    assert.equal(card.email, undefined);
    assert.equal(card.phoneNumber, undefined);
    assert.equal(card.emergencyContact, undefined);
    assert.equal(card.connectionStatus, 'none');

    // Private profile Rider C should be excluded from discovery and hidden from others
    const allRes = await fetch(`${baseUrl}/riders?search=Zorawar`);
    const allJson = await allRes.json();
    assert.equal(allJson.data.length, 0);

    const hiddenRes = await fetch(`${baseUrl}/riders/${riderCHandle}`, {
      headers: { Authorization: `Bearer ${riderBToken}` },
    });
    assert.equal(hiddenRes.status, 404);

    // Owner can still view own profile
    const selfRes = await fetch(`${baseUrl}/riders/${riderCHandle}`, {
      headers: { Authorization: `Bearer ${riderCToken}` },
    });
    assert.equal(selfRes.status, 200);
  });

  it('manages Rider Connections, prevents duplicates/self-connections/unauthorised mutations', async () => {
    // Self-connection blocked
    const selfConn = await fetch(`${baseUrl}/connections/request/${riderAId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderAToken}` },
    });
    assert.equal(selfConn.status, 400);

    // A -> B send request
    const sendRes = await fetch(`${baseUrl}/connections/request/${riderBId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderAToken}` },
    });
    assert.equal(sendRes.status, 201);
    const sendJson = await sendRes.json();
    connABId = sendJson.data._id;

    // Duplicate A -> B blocked
    const dupRes = await fetch(`${baseUrl}/connections/request/${riderBId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderAToken}` },
    });
    assert.equal(dupRes.status, 409);

    // Reverse B -> A while pending blocked
    const revRes = await fetch(`${baseUrl}/connections/request/${riderAId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderBToken}` },
    });
    assert.equal(revRes.status, 409);

    // Requester A cannot accept their own sent request
    const unauthAccept = await fetch(`${baseUrl}/connections/${connABId}/accept`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${riderAToken}` },
    });
    assert.equal(unauthAccept.status, 403);

    // Third party C cannot reject
    const thirdReject = await fetch(`${baseUrl}/connections/${connABId}/reject`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${riderCToken}` },
    });
    assert.equal(thirdReject.status, 403);

    // B views incoming requests
    const reqListRes = await fetch(`${baseUrl}/connections/requests`, {
      headers: { Authorization: `Bearer ${riderBToken}` },
    });
    const reqListJson = await reqListRes.json();
    assert.equal(reqListJson.data.incoming.length, 1);
    assert.equal(reqListJson.data.incoming[0].user._id, riderAId);

    // B accepts A's request
    const acceptRes = await fetch(`${baseUrl}/connections/${connABId}/accept`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${riderBToken}` },
    });
    assert.equal(acceptRes.status, 200);

    // A sees B in accepted connections
    const connListRes = await fetch(`${baseUrl}/connections`, {
      headers: { Authorization: `Bearer ${riderAToken}` },
    });
    const connListJson = await connListRes.json();
    assert.equal(connListJson.data.length, 1);
    assert.equal(connListJson.data[0].user._id, riderBId);

    // Test cancel + reject with Rider C
    const reqC = await fetch(`${baseUrl}/connections/request/${riderCId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderAToken}` },
    });
    const reqCJson = await reqC.json();
    const cancelRes = await fetch(`${baseUrl}/connections/${reqCJson.data._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${riderAToken}` },
    });
    assert.equal(cancelRes.status, 200);

    const reqC2 = await fetch(`${baseUrl}/connections/request/${riderCId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderAToken}` },
    });
    const reqC2Json = await reqC2.json();
    const rejectRes = await fetch(`${baseUrl}/connections/${reqC2Json.data._id}/reject`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${riderCToken}` },
    });
    assert.equal(rejectRes.status, 200);
  });

  it('enforces connected-only 1:1 Private Messaging + real-time Socket.IO JWT auth, events, and read status', async () => {
    // Non-connected A -> C blocked
    const blockedStart = await fetch(`${baseUrl}/messages/conversations/${riderCId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderAToken}` },
    });
    assert.equal(blockedStart.status, 403);

    // Connected A -> B succeeds
    const startRes = await fetch(`${baseUrl}/messages/conversations/${riderBId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderAToken}` },
    });
    assert.equal(startRes.status, 200);
    const startJson = await startRes.json();
    convABId = startJson.data._id;

    // Socket.IO rejects missing/invalid JWT
    await assert.rejects(() => connectSocket(''), /Authentication required/);
    await assert.rejects(() => connectSocket('invalid.jwt.token'), /Invalid or expired/);

    const socketA = await connectSocket(riderAToken);
    const socketB = await connectSocket(riderBToken);
    const socketC = await connectSocket(riderCToken);

    try {
      // Unauthorized Rider C cannot join A-B conversation room or read REST history
      const cJoin = await emitAck(socketC, 'conversation:join', convABId);
      assert.equal(cJoin.ok, false);

      const cRest = await fetch(`${baseUrl}/messages/conversations/${convABId}`, {
        headers: { Authorization: `Bearer ${riderCToken}` },
      });
      assert.equal(cRest.status, 403);

      // A and B join room
      const aJoin = await emitAck(socketA, 'conversation:join', convABId);
      const bJoin = await emitAck(socketB, 'conversation:join', convABId);
      assert.equal(aJoin.ok, true);
      assert.equal(bJoin.ok, true);

      // Typing indicator
      const typingPromise = waitForEvent(
        socketB,
        'private:typing',
        (d) => d.conversationId === convABId && d.userId === riderAId && d.isTyping === true
      );
      socketA.emit('private:typing', { conversationId: convABId, isTyping: true });
      await typingPromise;

      // Real-time send + receive + notification
      const msgPromise = waitForEvent(
        socketB,
        'private:message',
        (m) => m.content === 'Wheels roll at 05:30 AM from Manali!'
      );
      const notifPromise = waitForEvent(
        socketB,
        'notification:new',
        (n) => n.type === 'private_message'
      );
      const sendAck = await emitAck(socketA, 'private:send', {
        conversationId: convABId,
        content: 'Wheels roll at 05:30 AM from Manali!',
      });
      assert.equal(sendAck.ok, true);
      const [receivedMsg, receivedNotif] = await Promise.all([msgPromise, notifPromise]);
      assert.equal(receivedMsg.sender._id, riderAId);
      assert.ok(receivedNotif._id);

      // Unread count for B before reading
      const listB = await fetch(`${baseUrl}/messages/conversations`, {
        headers: { Authorization: `Bearer ${riderBToken}` },
      });
      const listBJson = await listB.json();
      assert.equal(listBJson.totalUnread, 1);

      // B opens conversation & marks read
      const threadRes = await fetch(`${baseUrl}/messages/conversations/${convABId}?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${riderBToken}` },
      });
      const threadJson = await threadRes.json();
      assert.equal(threadJson.data.messages.length, 1);

      const listBRead = await fetch(`${baseUrl}/messages/conversations`, {
        headers: { Authorization: `Bearer ${riderBToken}` },
      });
      const listBReadJson = await listBRead.json();
      assert.equal(listBReadJson.totalUnread, 0);
    } finally {
      socketA.close();
      socketB.close();
      socketC.close();
    }
  });

  it('supports Public, Private & Invite-Only KAAFILA Groups, real-time Group Chat & Announcements', async () => {
    // A creates Public and Private groups
    const pubRes = await fetch(`${baseUrl}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderAToken}` },
      body: JSON.stringify({
        name: 'Khardung La Sunrise Pack',
        destination: 'Leh - Khardung La',
        maxMembers: 15,
        privacy: 'public',
        description: 'Open convoy for early morning Khardung La ascent.',
      }),
    });
    assert.equal(pubRes.status, 201);
    const pubJson = await pubRes.json();
    publicGroupId = pubJson.data._id;
    publicGroupSlug = pubJson.data.slug;

    const privRes = await fetch(`${baseUrl}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderAToken}` },
      body: JSON.stringify({
        name: 'Hanle Stargazers Crew',
        destination: 'Hanle',
        maxMembers: 10,
        privacy: 'private',
        description: 'Approval-based high altitude crew.',
      }),
    });
    assert.equal(privRes.status, 201);
    const privJson = await privRes.json();
    privateGroupId = privJson.data._id;
    privateGroupSlug = privJson.data.slug;

    // Org A creates Invite-Only group
    const invRes = await fetch(`${baseUrl}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgAToken}` },
      body: JSON.stringify({
        name: 'Zanskar Marshal Briefing Room',
        destination: 'Zanskar',
        maxMembers: 12,
        privacy: 'invite_only',
        description: 'Invite-only coordination squad.',
      }),
    });
    assert.equal(invRes.status, 201);
    const invJson = await invRes.json();
    inviteGroupId = invJson.data._id;
    inviteGroupSlug = invJson.data.slug;

    // Non-invited Rider B cannot see invite_only group in listGroups or view by slug
    const browseB = await fetch(`${baseUrl}/groups?search=Zanskar`, {
      headers: { Authorization: `Bearer ${riderBToken}` },
    });
    const browseBJson = await browseB.json();
    assert.equal(browseBJson.data.some((g) => g._id === inviteGroupId), false);

    const viewInvB = await fetch(`${baseUrl}/groups/${inviteGroupSlug}`, {
      headers: { Authorization: `Bearer ${riderBToken}` },
    });
    assert.equal(viewInvB.status, 403);

    // Non-member C cannot read private group chat or roster
    const cPrivDetail = await fetch(`${baseUrl}/groups/${privateGroupSlug}`, {
      headers: { Authorization: `Bearer ${riderCToken}` },
    });
    const cPrivDetailJson = await cPrivDetail.json();
    assert.equal(cPrivDetailJson.data.accessGranted, false);
    assert.equal(cPrivDetailJson.data.members.length, 0);

    const cPrivMsgs = await fetch(`${baseUrl}/groups/${privateGroupId}/messages`, {
      headers: { Authorization: `Bearer ${riderCToken}` },
    });
    assert.equal(cPrivMsgs.status, 403);

    // Rider B joins public group directly
    const joinPubB = await fetch(`${baseUrl}/groups/${publicGroupId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderBToken}` },
    });
    assert.equal(joinPubB.status, 201);

    // Rider B requests access to private group -> pending -> Rider A approves
    const reqPrivB = await fetch(`${baseUrl}/groups/${privateGroupId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderBToken}` },
    });
    assert.equal(reqPrivB.status, 201);
    const reqPrivBJson = await reqPrivB.json();
    assert.equal(reqPrivBJson.data.status, 'pending_request');
    const bPrivateMembershipId = reqPrivBJson.data._id;

    const approveRes = await fetch(
      `${baseUrl}/groups/${privateGroupId}/members/${bPrivateMembershipId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderAToken}` },
        body: JSON.stringify({ action: 'approve' }),
      }
    );
    assert.equal(approveRes.status, 200);

    // Org A invites Rider B by handle to invite_only group -> B accepts
    const inviteCall = await fetch(`${baseUrl}/groups/${inviteGroupId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgAToken}` },
      body: JSON.stringify({ handle: riderBHandle }),
    });
    assert.equal(inviteCall.status, 201);

    const acceptInvite = await fetch(`${baseUrl}/groups/${inviteGroupId}/accept-invite`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderBToken}` },
    });
    assert.equal(acceptInvite.status, 200);

    // Real-time Group Chat & Presence on Public Group
    const socketA = await connectSocket(riderAToken);
    const socketB = await connectSocket(riderBToken);
    const socketC = await connectSocket(riderCToken);

    try {
      // Non-member C cannot join group socket room
      const cGrpJoin = await emitAck(socketC, 'group:join', publicGroupId);
      assert.equal(cGrpJoin.ok, false);

      const aGrpJoin = await emitAck(socketA, 'group:join', publicGroupId);
      const bGrpJoin = await emitAck(socketB, 'group:join', publicGroupId);
      assert.equal(aGrpJoin.ok, true);
      assert.equal(bGrpJoin.ok, true);
      assert.ok(bGrpJoin.onlineMemberIds.includes(riderAId));

      const grpMsgPromise = waitForEvent(
        socketB,
        'group:message',
        (m) => m.content === 'Carry thermal gloves and Diamox backup.'
      );
      const grpSendAck = await emitAck(socketA, 'group:send', {
        groupId: publicGroupId,
        content: 'Carry thermal gloves and Diamox backup.',
      });
      assert.equal(grpSendAck.ok, true);
      await grpMsgPromise;

      // Normal member B cannot post announcements (403)
      const bAnnBlocked = await fetch(`${baseUrl}/groups/${publicGroupId}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderBToken}` },
        body: JSON.stringify({ title: 'Unauthorized', content: 'Should fail' }),
      });
      assert.equal(bAnnBlocked.status, 403);

      // Owner A creates, edits, and deletes announcement
      const annCreate = await fetch(`${baseUrl}/groups/${publicGroupId}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderAToken}` },
        body: JSON.stringify({
          title: 'Fuel Stop Alert',
          content: 'Refuel full tanks at Karu before ascending.',
          isPinned: true,
        }),
      });
      assert.equal(annCreate.status, 201);
      const annCreateJson = await annCreate.json();
      announcementId = annCreateJson.data._id;

      const annEdit = await fetch(
        `${baseUrl}/groups/${publicGroupId}/announcements/${announcementId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderAToken}` },
          body: JSON.stringify({ content: 'Refuel full tanks at Karu + carry 5L jerrycan.' }),
        }
      );
      assert.equal(annEdit.status, 200);

      const annDel = await fetch(
        `${baseUrl}/groups/${publicGroupId}/announcements/${announcementId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${riderAToken}` },
        }
      );
      assert.equal(annDel.status, 200);
    } finally {
      socketA.close();
      socketB.close();
      socketC.close();
    }

    // Owner sets Rider B role to marshal in private group, then B leaves cleanly
    const setRoleRes = await fetch(
      `${baseUrl}/groups/${privateGroupId}/members/${bPrivateMembershipId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderAToken}` },
        body: JSON.stringify({ action: 'set_role', role: 'marshal' }),
      }
    );
    assert.equal(setRoleRes.status, 200);

    const leaveRes = await fetch(`${baseUrl}/groups/${privateGroupId}/leave`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${riderBToken}` },
    });
    assert.equal(leaveRes.status, 200);
  });

  it('persists Notification Centre items and marks individual / all as read', async () => {
    const listRes = await fetch(`${baseUrl}/notifications`, {
      headers: { Authorization: `Bearer ${riderBToken}` },
    });
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.ok(listJson.data.length >= 3);
    assert.ok(listJson.unreadCount >= 1);

    const firstId = listJson.data[0]._id;
    const markOneRes = await fetch(`${baseUrl}/notifications/${firstId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${riderBToken}` },
    });
    assert.equal(markOneRes.status, 200);
    const markOneJson = await markOneRes.json();
    assert.equal(markOneJson.data.isRead, true);

    const markAllRes = await fetch(`${baseUrl}/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${riderBToken}` },
    });
    assert.equal(markAllRes.status, 200);
    const markAllJson = await markAllRes.json();
    assert.equal(markAllJson.unreadCount, 0);
  });
});

