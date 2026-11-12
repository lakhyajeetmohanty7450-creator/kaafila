import { query, queryOne, transaction } from '../config/pg.js';
import {
  escapeIlike,
  fetchUsersMap,
  findGroupWithRefsBySlugOrId,
} from '../repositories/common.js';
import {
  mapGroup,
  mapGroupMember,
  mapMessage,
  mapOrganisation,
  mapRide,
  mapUser,
} from '../repositories/mappers.js';
import { isValidImageUrl, isValidUuid, parsePagination } from '../utils/validators.js';
import { toSlug, uniqueSlug } from '../utils/slugify.js';
import { createAndEmitNotification, getSocketIO } from '../utils/notify.js';

const GROUP_PRIVACIES = ['public', 'private', 'invite_only'];

async function getActiveMembership(groupId, userId) {
  if (!userId || !isValidUuid(String(groupId))) return null;
  return queryOne(
    "SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2 AND status = 'active'",
    [groupId, userId]
  );
}

function isGroupManager(membership) {
  return Boolean(membership && ['owner', 'admin'].includes(membership.role) && membership.status === 'active');
}

export async function listGroups(req, res, next) {
  try {
    const { search = '', destination = '', privacy = 'all', mine = '' } = req.query;
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 12, maxLimit: 50 });

    let myMemberships = [];
    if (req.user) {
      const memRes = await query(
        "SELECT * FROM group_members WHERE user_id = $1 AND status IN ('active', 'pending_request', 'invited')",
        [req.user.id]
      );
      myMemberships = memRes.rows;
    }

    const myMembershipMap = new Map(myMemberships.map((m) => [m.group_id, m]));
    const myAccessibleGroupIds = myMemberships.map((m) => m.group_id);

    const conditions = [];
    const params = [];

    if (mine === 'true') {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }
      const activeIds = myMemberships.filter((m) => m.status === 'active').map((m) => m.group_id);
      if (activeIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          pagination: { page, limit, total: 0, totalPages: 1 },
        });
      }
      params.push(activeIds);
      conditions.push(`g.id = ANY($${params.length}::uuid[])`);
    } else if (privacy && ['public', 'private'].includes(privacy)) {
      params.push(privacy);
      conditions.push(`g.privacy = $${params.length}`);
    } else if (myAccessibleGroupIds.length > 0) {
      params.push(myAccessibleGroupIds);
      conditions.push(`(g.privacy IN ('public', 'private') OR g.id = ANY($${params.length}::uuid[]))`);
    } else {
      conditions.push("g.privacy IN ('public', 'private')");
    }

    if (search.trim()) {
      params.push(`%${escapeIlike(search.trim())}%`);
      const pIdx = params.length;
      conditions.push(`(g.name ILIKE $${pIdx} OR g.destination ILIKE $${pIdx} OR g.description ILIKE $${pIdx})`);
    }

    if (destination.trim() && destination !== 'all') {
      params.push(`%${escapeIlike(destination.trim())}%`);
      conditions.push(`g.destination ILIKE $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const dataParams = [...params, limit, skip];

    const [groupsRes, countRes] = await Promise.all([
      query(
        `SELECT g.*,
           CASE WHEN o.id IS NOT NULL THEN row_to_json(o.*) ELSE NULL END AS org_row,
           CASE WHEN r.id IS NOT NULL THEN row_to_json(r.*) ELSE NULL END AS ride_row,
           CASE WHEN u.id IS NOT NULL THEN json_build_object(
             'id', u.id, 'full_name', u.full_name, 'avatar_url', u.avatar_url, 'role', u.role
           ) ELSE NULL END AS creator_row
         FROM kafila_groups g
         LEFT JOIN organisations o ON o.id = g.organisation_id
         LEFT JOIN rides r ON r.id = g.ride_id
         LEFT JOIN users u ON u.id = g.created_by_id
         ${whereClause}
         ORDER BY g.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        dataParams
      ),
      queryOne(`SELECT COUNT(*)::int AS total FROM kafila_groups g ${whereClause}`, params),
    ]);

    const groupIds = groupsRes.rows.map((g) => g.id);
    const countMap = new Map();
    if (groupIds.length > 0) {
      const cntRes = await query(
        `SELECT group_id, COUNT(*)::int AS count
         FROM group_members
         WHERE group_id = ANY($1::uuid[]) AND status = 'active'
         GROUP BY group_id`,
        [groupIds]
      );
      for (const row of cntRes.rows) {
        countMap.set(row.group_id, row.count);
      }
    }

    const data = groupsRes.rows.map((row) => {
      const org = row.org_row ? mapOrganisation(row.org_row) : null;
      const ride = row.ride_row ? mapRide(row.ride_row) : null;
      const creator = row.creator_row ? mapUser(row.creator_row, { includeEmail: false, includePhone: false }) : null;
      const mapped = mapGroup(row, {
        organisation: org
          ? {
              _id: org.id,
              id: org.id,
              name: org.name,
              slug: org.slug,
              logoUrl: org.logoUrl,
              isVerified: org.isVerified,
              isDemo: org.isDemo,
            }
          : null,
        ride: ride
          ? {
              _id: ride.id,
              id: ride.id,
              title: ride.title,
              slug: ride.slug,
              region: ride.region,
              startDate: ride.startDate,
            }
          : null,
        createdBy: creator,
      });

      const mem = myMembershipMap.get(mapped.id) || null;
      return {
        ...mapped,
        memberCount: countMap.get(mapped.id) || 0,
        myMembership: mem ? { _id: mem.id, id: mem.id, status: mem.status, role: mem.role } : null,
      };
    });

    const total = countRes?.total || 0;

    return res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createGroup(req, res, next) {
  try {
    if (req.user.role === 'rider') {
      const rp = await queryOne('SELECT can_create_groups FROM rider_profiles WHERE user_id = $1', [req.user.id]);
      if (rp && rp.can_create_groups === false) {
        return res.status(403).json({
          success: false,
          message: 'Your account is not authorised to create riding groups.',
        });
      }
    }

    const {
      name,
      description = '',
      coverImageUrl = '',
      destination = '',
      startDate = '',
      maxMembers = 25,
      privacy = 'public',
      rideId = '',
      organisationId = '',
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Group name is required.' });
    }
    if (!GROUP_PRIVACIES.includes(privacy)) {
      return res.status(400).json({ success: false, message: 'Invalid group privacy setting.' });
    }
    if (coverImageUrl && !isValidImageUrl(coverImageUrl)) {
      return res.status(400).json({ success: false, message: 'Invalid group image URL.' });
    }

    let resolvedOrgId = null;
    if (req.user.role === 'organisation') {
      const myOrg = await queryOne('SELECT id FROM organisations WHERE owner_id = $1 LIMIT 1', [req.user.id]);
      resolvedOrgId = myOrg?.id || null;
    } else if (organisationId && isValidUuid(String(organisationId))) {
      const org = await queryOne('SELECT id FROM organisations WHERE id = $1', [organisationId]);
      resolvedOrgId = org?.id || null;
    }

    let resolvedRideId = null;
    if (rideId && isValidUuid(String(rideId))) {
      const ride = await queryOne('SELECT id, organisation_id FROM rides WHERE id = $1', [rideId]);
      if (ride) {
        resolvedRideId = ride.id;
        if (!resolvedOrgId && ride.organisation_id) {
          resolvedOrgId = ride.organisation_id;
        }
      }
    }

    let slug = toSlug(name);
    const slugTaken = slug ? await queryOne('SELECT id FROM kafila_groups WHERE LOWER(slug) = LOWER($1)', [slug]) : true;
    if (!slug || slugTaken) {
      slug = uniqueSlug(name || 'group');
    }

    const capacity = Math.min(500, Math.max(2, Number(maxMembers) || 25));

    const createdGroupRow = await transaction(async (tx) => {
      const groupRow = await tx.queryOne(
        `INSERT INTO kafila_groups
           (name, slug, cover_image_url, organisation_id, ride_id, destination, start_date,
            max_members, description, privacy, created_by_id, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, FALSE)
         RETURNING *`,
        [
          String(name).trim().slice(0, 120),
          slug,
          String(coverImageUrl || '').trim() || '/images/community-camp.png',
          resolvedOrgId,
          resolvedRideId,
          String(destination || '').trim().slice(0, 120),
          startDate ? new Date(startDate) : null,
          capacity,
          String(description || '').trim().slice(0, 1000),
          privacy,
          req.user.id,
        ]
      );

      await tx.query(
        `INSERT INTO group_members (group_id, user_id, role, status)
         VALUES ($1, $2, 'owner', 'active')`,
        [groupRow.id, req.user.id]
      );

      return groupRow;
    });

    const populated = await findGroupWithRefsBySlugOrId(createdGroupRow.id);

    return res.status(201).json({
      success: true,
      message: 'KAAFILA group created successfully.',
      data: {
        ...populated,
        memberCount: 1,
        myMembership: { role: 'owner', status: 'active' },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getGroupBySlug(req, res, next) {
  try {
    const group = await findGroupWithRefsBySlugOrId(req.params.slugOrId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'KAAFILA group not found.' });
    }

    const [countRes, myMemberRow] = await Promise.all([
      queryOne("SELECT COUNT(*)::int AS cnt FROM group_members WHERE group_id = $1 AND status = 'active'", [group.id]),
      req.user ? queryOne('SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2', [group.id, req.user.id]) : null,
    ]);

    const activeMemberCount = countRes?.cnt || 0;
    const isActiveMember = myMemberRow?.status === 'active';
    const isInvited = myMemberRow?.status === 'invited';
    const isSystemAdmin = req.user?.role === 'admin';

    if (group.privacy === 'invite_only' && !isActiveMember && !isInvited && !isSystemAdmin) {
      return res.status(403).json({
        success: false,
        message: 'This invite-only KAAFILA group requires an invitation to view.',
      });
    }

    const basePayload = {
      _id: group._id,
      id: group.id,
      name: group.name,
      slug: group.slug,
      coverImageUrl: group.coverImageUrl,
      description: group.description,
      destination: group.destination,
      startDate: group.startDate,
      maxMembers: group.maxMembers,
      privacy: group.privacy,
      organisation: group.organisation
        ? {
            _id: group.organisation._id,
            id: group.organisation.id,
            name: group.organisation.name,
            slug: group.organisation.slug,
            logoUrl: group.organisation.logoUrl,
            isVerified: group.organisation.isVerified,
            isDemo: group.organisation.isDemo,
          }
        : null,
      ride: group.ride || null,
      createdBy: group.createdBy || null,
      isDemo: group.isDemo,
      createdAt: group.createdAt,
      memberCount: activeMemberCount,
      myMembership: myMemberRow ? { _id: myMemberRow.id, id: myMemberRow.id, role: myMemberRow.role, status: myMemberRow.status } : null,
    };

    if (!isActiveMember && !isSystemAdmin) {
      return res.json({
        success: true,
        data: {
          group: basePayload,
          accessGranted: false,
          members: [],
          pendingRequests: [],
          announcements: [],
          unreadCount: 0,
        },
      });
    }

    const canManage = isGroupManager(myMemberRow) || isSystemAdmin;
    const allowedStatuses = canManage ? ['active', 'pending_request', 'invited'] : ['active'];

    const [membersRes, announcementsRes, unreadRes] = await Promise.all([
      query(
        `SELECT gm.*, u.full_name, u.avatar_url, u.city, u.role AS user_role
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = $1 AND gm.status = ANY($2::text[])
         ORDER BY gm.role ASC, gm.joined_at ASC`,
        [group.id, allowedStatuses]
      ),
      query(
        `SELECT m.*, u.full_name AS sender_full_name, u.avatar_url AS sender_avatar_url, u.role AS sender_role
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.group_id = $1 AND m.message_type = 'announcement'
         ORDER BY m.is_pinned DESC, m.created_at DESC
         LIMIT 25`,
        [group.id]
      ),
      myMemberRow
        ? queryOne(
            `SELECT COUNT(*)::int AS cnt FROM messages
             WHERE group_id = $1 AND sender_id <> $2 AND created_at > $3`,
            [group.id, req.user.id, myMemberRow.last_read_at || myMemberRow.joined_at || new Date(0)]
          )
        : Promise.resolve({ cnt: 0 }),
    ]);

    const memberUserIds = membersRes.rows.map((m) => m.user_id);
    const profilesRes = memberUserIds.length
      ? await query(
          'SELECT user_id, handle, rank, home_city, primary_motorcycle FROM rider_profiles WHERE user_id = ANY($1::uuid[])',
          [memberUserIds]
        )
      : { rows: [] };
    const profileMap = new Map(
      profilesRes.rows.map((p) => [
        p.user_id,
        {
          user: p.user_id,
          handle: p.handle,
          rank: p.rank,
          homeCity: p.home_city,
          primaryMotorcycle: p.primary_motorcycle,
        },
      ])
    );

    const enrichMember = (m) => ({
      _id: m.id,
      id: m.id,
      role: m.role,
      status: m.status,
      joinedAt: m.joined_at,
      user: {
        _id: m.user_id,
        id: m.user_id,
        fullName: m.full_name,
        avatarUrl: m.avatar_url || '',
        city: m.city || '',
        role: m.user_role,
      },
      riderProfile: profileMap.get(m.user_id) || null,
    });

    const activeMembers = membersRes.rows.filter((m) => m.status === 'active').map(enrichMember);
    const pendingRequests = canManage
      ? membersRes.rows.filter((m) => m.status === 'pending_request').map(enrichMember)
      : [];
    const invitedMembers = canManage
      ? membersRes.rows.filter((m) => m.status === 'invited').map(enrichMember)
      : [];

    const announcements = announcementsRes.rows.map((a) =>
      mapMessage(a, {
        sender: {
          _id: a.sender_id,
          id: a.sender_id,
          fullName: a.sender_full_name,
          avatarUrl: a.sender_avatar_url || '',
          role: a.sender_role,
        },
      })
    );

    return res.json({
      success: true,
      data: {
        group: basePayload,
        accessGranted: true,
        canManage,
        members: activeMembers,
        pendingRequests,
        invitedMembers,
        announcements,
        unreadCount: unreadRes?.cnt || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateGroup(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid group ID.' });
    }
    const existing = await queryOne('SELECT * FROM kafila_groups WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Group not found.' });
    }

    const membership = await getActiveMembership(existing.id, req.user.id);
    if (!isGroupManager(membership) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only group owners or admins can edit this group.' });
    }

    const { name, description, destination, startDate, maxMembers, privacy, coverImageUrl } = req.body;
    if (coverImageUrl && !isValidImageUrl(coverImageUrl)) {
      return res.status(400).json({ success: false, message: 'Invalid group image URL.' });
    }
    if (privacy !== undefined && !GROUP_PRIVACIES.includes(privacy)) {
      return res.status(400).json({ success: false, message: 'Invalid group privacy setting.' });
    }

    const updated = await queryOne(
      `UPDATE kafila_groups SET
         name = $1,
         description = $2,
         destination = $3,
         start_date = $4,
         max_members = $5,
         privacy = $6,
         cover_image_url = $7
       WHERE id = $8
       RETURNING *`,
      [
        typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : existing.name,
        typeof description === 'string' ? description.trim().slice(0, 1000) : existing.description,
        typeof destination === 'string' ? destination.trim().slice(0, 120) : existing.destination,
        startDate !== undefined ? (startDate ? new Date(startDate) : null) : existing.start_date,
        maxMembers !== undefined ? Math.min(500, Math.max(2, Number(maxMembers) || 25)) : existing.max_members,
        privacy !== undefined ? privacy : existing.privacy,
        typeof coverImageUrl === 'string' && coverImageUrl.trim() ? coverImageUrl.trim() : existing.cover_image_url,
        existing.id,
      ]
    );

    return res.json({ success: true, message: 'Group updated successfully.', data: mapGroup(updated) });
  } catch (err) {
    next(err);
  }
}

export async function joinGroup(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid group ID.' });
    }

    const groupRow = await queryOne('SELECT * FROM kafila_groups WHERE id = $1', [req.params.id]);
    if (!groupRow) {
      return res.status(404).json({ success: false, message: 'Group not found.' });
    }

    const [existing, activeCountRow] = await Promise.all([
      queryOne('SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2', [groupRow.id, req.user.id]),
      queryOne("SELECT COUNT(*)::int AS cnt FROM group_members WHERE group_id = $1 AND status = 'active'", [groupRow.id]),
    ]);

    const activeCount = activeCountRow?.cnt || 0;

    if (existing?.status === 'active') {
      return res.status(409).json({ success: false, message: 'You are already a member of this group.' });
    }
    if (existing?.status === 'pending_request') {
      return res.status(409).json({ success: false, message: 'Your access request is already pending approval.' });
    }

    if (groupRow.privacy === 'invite_only' && existing?.status !== 'invited') {
      return res.status(403).json({
        success: false,
        message: 'This group is invite-only. Ask a group owner or admin to invite you.',
      });
    }

    if ((groupRow.privacy === 'public' || existing?.status === 'invited') && activeCount >= groupRow.max_members) {
      return res.status(400).json({ success: false, message: 'This group has reached its maximum capacity.' });
    }

    const nextStatus =
      groupRow.privacy === 'public' || existing?.status === 'invited' ? 'active' : 'pending_request';

    let membershipRow;
    if (existing) {
      membershipRow = await queryOne(
        `UPDATE group_members SET
           status = $1,
           joined_at = CASE WHEN $1 = 'active' THEN NOW() ELSE joined_at END
         WHERE id = $2
         RETURNING *`,
        [nextStatus, existing.id]
      );
    } else {
      membershipRow = await queryOne(
        `INSERT INTO group_members (group_id, user_id, role, status)
         VALUES ($1, $2, 'member', $3)
         RETURNING *`,
        [groupRow.id, req.user.id, nextStatus]
      );
    }

    const managersRes = await query(
      "SELECT user_id FROM group_members WHERE group_id = $1 AND status = 'active' AND role IN ('owner', 'admin')",
      [groupRow.id]
    );

    for (const mgr of managersRes.rows) {
      await createAndEmitNotification({
        recipient: mgr.user_id,
        actor: req.user.id,
        type: nextStatus === 'pending_request' ? 'group_join_request' : 'group_membership',
        title:
          nextStatus === 'pending_request'
            ? `${req.user.fullName} requested to join ${groupRow.name}`
            : `${req.user.fullName} joined ${groupRow.name}`,
        body:
          nextStatus === 'pending_request'
            ? 'Review pending access requests in the group Members tab.'
            : 'New member in your riding group.',
        link: `/community/groups/${groupRow.slug}`,
        metadata: { groupId: groupRow.id },
      });
    }

    return res.status(201).json({
      success: true,
      message:
        nextStatus === 'active'
          ? `Joined ${groupRow.name}!`
          : 'Access request submitted to group admins.',
      data: mapGroupMember(membershipRow),
    });
  } catch (err) {
    next(err);
  }
}

export async function inviteToGroup(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid group ID.' });
    }

    const groupRow = await queryOne('SELECT * FROM kafila_groups WHERE id = $1', [req.params.id]);
    if (!groupRow) {
      return res.status(404).json({ success: false, message: 'Group not found.' });
    }

    const myMember = await getActiveMembership(groupRow.id, req.user.id);
    if (!isGroupManager(myMember) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only owners or admins can invite riders.' });
    }

    const { userId, handle } = req.body;
    let targetUser = null;
    if (userId && isValidUuid(String(userId))) {
      targetUser = await queryOne('SELECT id, full_name FROM users WHERE id = $1 AND is_active = TRUE', [userId]);
    } else if (handle) {
      const cleanHandle = String(handle).replace(/^@/, '').toLowerCase().trim();
      targetUser = await queryOne(
        `SELECT u.id, u.full_name
         FROM rider_profiles rp
         JOIN users u ON u.id = rp.user_id
         WHERE LOWER(rp.handle) = LOWER($1) AND u.is_active = TRUE
         LIMIT 1`,
        [cleanHandle]
      );
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Rider to invite not found.' });
    }

    const existing = await queryOne('SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2', [
      groupRow.id,
      targetUser.id,
    ]);
    if (existing?.status === 'active') {
      return res.status(409).json({ success: false, message: 'This user is already an active member.' });
    }
    if (existing?.status === 'invited') {
      return res.status(409).json({ success: false, message: 'An invitation has already been sent to this user.' });
    }

    let invitationRow;
    if (existing) {
      invitationRow = await queryOne(
        "UPDATE group_members SET status = 'invited', invited_by_id = $1 WHERE id = $2 RETURNING *",
        [req.user.id, existing.id]
      );
    } else {
      invitationRow = await queryOne(
        `INSERT INTO group_members (group_id, user_id, role, status, invited_by_id)
         VALUES ($1, $2, 'member', 'invited', $3)
         RETURNING *`,
        [groupRow.id, targetUser.id, req.user.id]
      );
    }

    await createAndEmitNotification({
      recipient: targetUser.id,
      actor: req.user.id,
      type: 'group_invitation',
      title: `Invited to KAAFILA group: ${groupRow.name}`,
      body: `${req.user.fullName} invited you to join this riding group.`,
      link: `/community/groups/${groupRow.slug}`,
      metadata: { groupId: groupRow.id },
    });

    return res.status(201).json({
      success: true,
      message: `Invitation sent to ${targetUser.full_name}.`,
      data: mapGroupMember(invitationRow),
    });
  } catch (err) {
    next(err);
  }
}

export async function acceptGroupInvite(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid group ID.' });
    }

    const [groupRow, invitation, activeCountRow] = await Promise.all([
      queryOne('SELECT * FROM kafila_groups WHERE id = $1', [req.params.id]),
      queryOne("SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2 AND status = 'invited'", [
        req.params.id,
        req.user.id,
      ]),
      queryOne("SELECT COUNT(*)::int AS cnt FROM group_members WHERE group_id = $1 AND status = 'active'", [
        req.params.id,
      ]),
    ]);

    if (!groupRow || !invitation) {
      return res.status(404).json({ success: false, message: 'Pending group invitation not found.' });
    }
    if ((activeCountRow?.cnt || 0) >= groupRow.max_members) {
      return res.status(400).json({ success: false, message: 'Group capacity is currently full.' });
    }

    const updated = await queryOne(
      "UPDATE group_members SET status = 'active', joined_at = NOW() WHERE id = $1 RETURNING *",
      [invitation.id]
    );

    return res.json({
      success: true,
      message: `You are now a member of ${groupRow.name}.`,
      data: mapGroupMember(updated),
    });
  } catch (err) {
    next(err);
  }
}

export async function manageGroupMember(req, res, next) {
  try {
    const { id, memberId } = req.params;
    const { action, role } = req.body;

    if (!isValidUuid(id) || !isValidUuid(memberId)) {
      return res.status(400).json({ success: false, message: 'Invalid identifier.' });
    }

    const [groupRow, actorMember, targetMember] = await Promise.all([
      queryOne('SELECT * FROM kafila_groups WHERE id = $1', [id]),
      getActiveMembership(id, req.user.id),
      queryOne('SELECT * FROM group_members WHERE id = $1 AND group_id = $2', [memberId, id]),
    ]);

    if (!groupRow || !targetMember) {
      return res.status(404).json({ success: false, message: 'Group or member record not found.' });
    }
    if (!isGroupManager(actorMember) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only owners or admins can manage members.' });
    }

    if (action === 'approve') {
      if (targetMember.status !== 'pending_request') {
        return res.status(400).json({ success: false, message: 'Member is not awaiting approval.' });
      }
      const activeCountRow = await queryOne(
        "SELECT COUNT(*)::int AS cnt FROM group_members WHERE group_id = $1 AND status = 'active'",
        [id]
      );
      if ((activeCountRow?.cnt || 0) >= groupRow.max_members) {
        return res.status(400).json({ success: false, message: 'Group capacity is full.' });
      }
      const updated = await queryOne(
        "UPDATE group_members SET status = 'active', joined_at = NOW() WHERE id = $1 RETURNING *",
        [targetMember.id]
      );

      await createAndEmitNotification({
        recipient: targetMember.user_id,
        actor: req.user.id,
        type: 'group_join_accepted',
        title: `Request approved for ${groupRow.name}`,
        body: 'You now have access to group chat and announcements.',
        link: `/community/groups/${groupRow.slug}`,
        metadata: { groupId: groupRow.id },
      });

      return res.json({ success: true, message: 'Member request approved.', data: mapGroupMember(updated) });
    }

    if (action === 'reject') {
      await query('DELETE FROM group_members WHERE id = $1', [targetMember.id]);
      return res.json({ success: true, message: 'Join request declined.' });
    }

    if (action === 'set_role' || role) {
      if (actorMember?.role !== 'owner' && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Only the group owner can change member roles.' });
      }
      if (targetMember.role === 'owner') {
        return res.status(400).json({ success: false, message: 'Group owner role cannot be downgraded.' });
      }
      if (!['admin', 'member', 'marshal'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid target role.' });
      }
      const updated = await queryOne(
        'UPDATE group_members SET role = $1 WHERE id = $2 RETURNING *',
        [role, targetMember.id]
      );

      await createAndEmitNotification({
        recipient: targetMember.user_id,
        actor: req.user.id,
        type: 'group_membership',
        title: `Role updated in ${groupRow.name}`,
        body: `Your group role is now ${role}.`,
        link: `/community/groups/${groupRow.slug}`,
        metadata: { groupId: groupRow.id },
      });

      return res.json({ success: true, message: `Member role updated to ${role}.`, data: mapGroupMember(updated) });
    }

    return res.status(400).json({ success: false, message: 'Specify a valid action (approve, reject, set_role).' });
  } catch (err) {
    next(err);
  }
}

export async function leaveGroup(req, res, next) {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid group ID.' });
    }

    const membership = await queryOne('SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (!membership) {
      return res.status(404).json({ success: false, message: 'You are not a member of this group.' });
    }
    if (membership.role === 'owner') {
      return res.status(400).json({
        success: false,
        message: 'Group owner cannot leave the group directly.',
      });
    }

    await query('DELETE FROM group_members WHERE id = $1', [membership.id]);
    return res.json({ success: true, message: 'You have left the group.' });
  } catch (err) {
    next(err);
  }
}

export async function removeGroupMember(req, res, next) {
  try {
    const { id, memberId } = req.params;
    if (!isValidUuid(id) || !isValidUuid(memberId)) {
      return res.status(400).json({ success: false, message: 'Invalid identifier.' });
    }

    const [groupRow, actorMember, targetMember] = await Promise.all([
      queryOne('SELECT * FROM kafila_groups WHERE id = $1', [id]),
      getActiveMembership(id, req.user.id),
      queryOne('SELECT * FROM group_members WHERE id = $1 AND group_id = $2', [memberId, id]),
    ]);

    if (!groupRow || !targetMember) {
      return res.status(404).json({ success: false, message: 'Group or member not found.' });
    }
    if (!isGroupManager(actorMember) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (targetMember.role === 'owner') {
      return res.status(400).json({ success: false, message: 'Cannot remove the group owner.' });
    }
    if (actorMember?.role === 'admin' && targetMember.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Admins cannot remove another admin.' });
    }

    await query('DELETE FROM group_members WHERE id = $1', [targetMember.id]);

    await createAndEmitNotification({
      recipient: targetMember.user_id,
      actor: req.user.id,
      type: 'group_membership',
      title: `Removed from ${groupRow.name}`,
      body: 'Your membership in this KAAFILA group was removed by a group manager.',
      link: '/community/groups',
      metadata: { groupId: groupRow.id },
    });

    return res.json({ success: true, message: 'Member removed from group.' });
  } catch (err) {
    next(err);
  }
}

export async function getGroupMessages(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid group ID.' });
    }

    const membership = await getActiveMembership(id, req.user.id);
    if (!membership && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only active group members can read group chat.' });
    }

    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 40, maxLimit: 100 });

    const [msgsRes, totalRes] = await Promise.all([
      query(
        `SELECT m.*, u.full_name AS sender_full_name, u.avatar_url AS sender_avatar_url, u.role AS sender_role
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.group_id = $1 AND m.message_type IN ('text', 'system')
         ORDER BY m.created_at DESC
         LIMIT $2 OFFSET $3`,
        [id, limit, skip]
      ),
      queryOne("SELECT COUNT(*)::int AS total FROM messages WHERE group_id = $1 AND message_type IN ('text', 'system')", [
        id,
      ]),
    ]);

    if (membership) {
      await query('UPDATE group_members SET last_read_at = NOW() WHERE id = $1', [membership.id]);
    }

    const data = msgsRes.rows.reverse().map((m) =>
      mapMessage(m, {
        sender: {
          _id: m.sender_id,
          id: m.sender_id,
          fullName: m.sender_full_name,
          avatarUrl: m.sender_avatar_url || '',
          role: m.sender_role,
        },
      })
    );

    const total = totalRes?.total || 0;

    return res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function sendGroupMessage(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid group ID.' });
    }

    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content || content.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Message must be between 1 and 2000 characters.',
      });
    }

    const membership = await getActiveMembership(id, req.user.id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Only active group members can post messages.' });
    }

    const msgRow = await transaction(async (tx) => {
      const m = await tx.queryOne(
        `INSERT INTO messages (sender_id, group_id, message_type, content, read_by)
         VALUES ($1, $2, 'text', $3, ARRAY[$1::uuid])
         RETURNING *`,
        [req.user.id, id, content]
      );
      await tx.query('UPDATE group_members SET last_read_at = NOW() WHERE id = $1', [membership.id]);
      return m;
    });

    const populated = mapMessage(msgRow, {
      sender: {
        _id: req.user.id,
        id: req.user.id,
        fullName: req.user.fullName,
        avatarUrl: req.user.avatarUrl || '',
        role: req.user.role,
      },
    });

    const io = getSocketIO();
    if (io) {
      io.to(`group:${id}`).emit('group:message', populated);
    }

    return res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

export async function markGroupRead(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid group ID.' });
    }
    await query(
      "UPDATE group_members SET last_read_at = NOW() WHERE group_id = $1 AND user_id = $2 AND status = 'active'",
      [id, req.user.id]
    );
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function listGroupAnnouncements(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid group ID.' });
    }
    const membership = await getActiveMembership(id, req.user.id);
    if (!membership && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only active group members can view announcements.' });
    }

    const resRows = await query(
      `SELECT m.*, u.full_name AS sender_full_name, u.avatar_url AS sender_avatar_url, u.role AS sender_role
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.group_id = $1 AND m.message_type = 'announcement'
       ORDER BY m.is_pinned DESC, m.created_at DESC`,
      [id]
    );

    const announcements = resRows.rows.map((m) =>
      mapMessage(m, {
        sender: {
          _id: m.sender_id,
          id: m.sender_id,
          fullName: m.sender_full_name,
          avatarUrl: m.sender_avatar_url || '',
          role: m.sender_role,
        },
      })
    );

    return res.json({ success: true, data: announcements });
  } catch (err) {
    next(err);
  }
}

async function resolveGroupWithOrgOwner(groupId) {
  return queryOne(
    `SELECT g.*, o.owner_id AS org_owner_id
     FROM kafila_groups g
     LEFT JOIN organisations o ON o.id = g.organisation_id
     WHERE g.id = $1`,
    [groupId]
  );
}

export async function createGroupAnnouncement(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid group ID.' });
    }

    const [groupRow, membership] = await Promise.all([
      resolveGroupWithOrgOwner(id),
      getActiveMembership(id, req.user.id),
    ]);

    if (!groupRow) {
      return res.status(404).json({ success: false, message: 'Group not found.' });
    }

    const isOrgOwner = groupRow.org_owner_id && groupRow.org_owner_id === req.user.id;
    if (!isGroupManager(membership) && !isOrgOwner && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only group owners, admins, or the owning organisation can publish announcements.',
      });
    }

    const title = String(req.body.title || '').trim().slice(0, 160);
    const content = String(req.body.content || '').trim();
    const isPinned = Boolean(req.body.isPinned);

    if (!content || content.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Announcement content must be 1 to 2000 characters.',
      });
    }

    const annRow = await queryOne(
      `INSERT INTO messages (sender_id, group_id, message_type, title, content, is_pinned, read_by)
       VALUES ($1, $2, 'announcement', $3, $4, $5, ARRAY[$1::uuid])
       RETURNING *`,
      [req.user.id, groupRow.id, title || 'Group Announcement', content, isPinned]
    );

    const populated = mapMessage(annRow, {
      sender: {
        _id: req.user.id,
        id: req.user.id,
        fullName: req.user.fullName,
        avatarUrl: req.user.avatarUrl || '',
        role: req.user.role,
      },
    });

    const io = getSocketIO();
    if (io) {
      io.to(`group:${id}`).emit('group:announcement', populated);
    }

    const activeMembersRes = await query(
      "SELECT user_id FROM group_members WHERE group_id = $1 AND status = 'active' AND user_id <> $2",
      [groupRow.id, req.user.id]
    );

    for (const m of activeMembersRes.rows) {
      await createAndEmitNotification({
        recipient: m.user_id,
        actor: req.user.id,
        type: 'group_announcement',
        title: `Announcement in ${groupRow.name}`,
        body: title ? `${title}: ${content.slice(0, 110)}` : content.slice(0, 140),
        link: `/community/groups/${groupRow.slug}`,
        metadata: { groupId: groupRow.id, announcementId: annRow.id },
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Announcement published.',
      data: populated,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateGroupAnnouncement(req, res, next) {
  try {
    const { id, announcementId } = req.params;
    if (!isValidUuid(id) || !isValidUuid(announcementId)) {
      return res.status(400).json({ success: false, message: 'Invalid identifier.' });
    }

    const [groupRow, membership, existing] = await Promise.all([
      resolveGroupWithOrgOwner(id),
      getActiveMembership(id, req.user.id),
      queryOne("SELECT * FROM messages WHERE id = $1 AND group_id = $2 AND message_type = 'announcement'", [
        announcementId,
        id,
      ]),
    ]);

    if (!groupRow || !existing) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }

    const isOrgOwner = groupRow.org_owner_id && groupRow.org_owner_id === req.user.id;
    if (!isGroupManager(membership) && !isOrgOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const nextTitle = typeof req.body.title === 'string' ? req.body.title.trim().slice(0, 160) : existing.title;
    let nextContent = existing.content;
    if (typeof req.body.content === 'string') {
      const clean = req.body.content.trim();
      if (!clean || clean.length > 2000) {
        return res.status(400).json({ success: false, message: 'Content must be 1 to 2000 characters.' });
      }
      nextContent = clean;
    }
    const nextPinned = typeof req.body.isPinned === 'boolean' ? req.body.isPinned : existing.is_pinned;

    const updated = await queryOne(
      `UPDATE messages
       SET title = $1, content = $2, is_pinned = $3, edited_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [nextTitle, nextContent, nextPinned, existing.id]
    );

    const senderMap = await fetchUsersMap([updated.sender_id], { includeEmail: false, includePhone: false });
    const sender = senderMap.get(updated.sender_id);
    const populated = mapMessage(updated, {
      sender: sender
        ? { _id: sender.id, id: sender.id, fullName: sender.fullName, avatarUrl: sender.avatarUrl, role: sender.role }
        : null,
    });

    const io = getSocketIO();
    if (io) {
      io.to(`group:${id}`).emit('group:announcement_updated', populated);
    }

    return res.json({ success: true, message: 'Announcement updated.', data: populated });
  } catch (err) {
    next(err);
  }
}

export async function deleteGroupAnnouncement(req, res, next) {
  try {
    const { id, announcementId } = req.params;
    if (!isValidUuid(id) || !isValidUuid(announcementId)) {
      return res.status(400).json({ success: false, message: 'Invalid identifier.' });
    }

    const [groupRow, membership, existing] = await Promise.all([
      resolveGroupWithOrgOwner(id),
      getActiveMembership(id, req.user.id),
      queryOne("SELECT * FROM messages WHERE id = $1 AND group_id = $2 AND message_type = 'announcement'", [
        announcementId,
        id,
      ]),
    ]);

    if (!groupRow || !existing) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }

    const isOrgOwner = groupRow.org_owner_id && groupRow.org_owner_id === req.user.id;
    if (!isGroupManager(membership) && !isOrgOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    await query('DELETE FROM messages WHERE id = $1', [existing.id]);

    const io = getSocketIO();
    if (io) {
      io.to(`group:${id}`).emit('group:announcement_deleted', { announcementId });
    }

    return res.json({ success: true, message: 'Announcement deleted.' });
  } catch (err) {
    next(err);
  }
}
