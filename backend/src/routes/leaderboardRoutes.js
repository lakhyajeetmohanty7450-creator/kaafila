import { Router } from 'express';
import {
  getLeaderboard,
  getAchievementDefinitions,
  getMyAchievements,
} from '../controllers/leaderboardController.js';
import { protect, authorize, optionalProtect } from '../middleware/auth.js';

const router = Router();

router.get('/', optionalProtect, getLeaderboard);
router.get('/achievements/definitions', getAchievementDefinitions);
router.get('/achievements/me', protect, authorize('rider'), getMyAchievements);

export default router;

