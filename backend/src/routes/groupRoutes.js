import { Router } from 'express';
import {
  listGroups,
  createGroup,
  getGroupBySlug,
  updateGroup,
  joinGroup,
  inviteToGroup,
  acceptGroupInvite,
  manageGroupMember,
  leaveGroup,
  removeGroupMember,
  getGroupMessages,
  sendGroupMessage,
  markGroupRead,
  listGroupAnnouncements,
  createGroupAnnouncement,
  updateGroupAnnouncement,
  deleteGroupAnnouncement,
} from '../controllers/groupController.js';
import { protect, optionalProtect } from '../middleware/auth.js';
import { messagingLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/', optionalProtect, listGroups);
router.post('/', protect, createGroup);
router.get('/:slugOrId', optionalProtect, getGroupBySlug);
router.put('/:id', protect, updateGroup);

router.post('/:id/join', protect, joinGroup);
router.post('/:id/invite', protect, inviteToGroup);
router.post('/:id/accept-invite', protect, acceptGroupInvite);
router.patch('/:id/members/:memberId', protect, manageGroupMember);
router.delete('/:id/leave', protect, leaveGroup);
router.delete('/:id/members/:memberId', protect, removeGroupMember);

router.get('/:id/messages', protect, getGroupMessages);
router.post('/:id/messages', protect, messagingLimiter, sendGroupMessage);
router.patch('/:id/read', protect, markGroupRead);

router.get('/:id/announcements', protect, listGroupAnnouncements);
router.post('/:id/announcements', protect, createGroupAnnouncement);
router.put('/:id/announcements/:announcementId', protect, updateGroupAnnouncement);
router.delete('/:id/announcements/:announcementId', protect, deleteGroupAnnouncement);

export default router;

