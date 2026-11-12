import { Router } from 'express';
import {
  listConversations,
  startOrGetConversation,
  getConversationMessages,
  sendPrivateMessage,
  markConversationRead,
} from '../controllers/messageController.js';
import { protect, authorize } from '../middleware/auth.js';
import { messagingLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(protect, authorize('rider'));

router.get('/conversations', listConversations);
router.post('/conversations/:targetUserId', startOrGetConversation);
router.get('/conversations/:conversationId', getConversationMessages);
router.post('/conversations/:conversationId', messagingLimiter, sendPrivateMessage);
router.patch('/conversations/:conversationId/read', markConversationRead);

export default router;

